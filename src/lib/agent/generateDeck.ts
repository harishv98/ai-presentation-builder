import { pushNotice, useChatStore } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";
import {
  addOutlineSlide,
  finishGeneration,
  finishOutline,
  setNextTitle,
  startGeneration,
  useGenerationStore,
} from "@/lib/generation/store";
import { useUiStore } from "@/lib/ui/store";
import { describeError, streamStep } from "./agentRequest";
import { aiToolContext, executeToolCall } from "./executeTool";
import { populateSlide, type TxnRef } from "./populateSlide";
import { clip } from "./snapshot";
import { addPlannedSlide, PlanDeckArgs, parseStreamedPlan, type PlannedSlide } from "./tools/planTool";

const POPULATE_CONCURRENCY = 2;
const MAX_PLANNED_SLIDES = 10;

type OnPlannedSlide = (slideId: string, planned: PlannedSlide, index: number) => void;

export async function generateDeck(prompt: string): Promise<void> {
  const text = prompt.trim();
  const chat = useChatStore.getState();
  if (!text || chat.abort) return;

  const abort = new AbortController();
  chat.beginTurn(abort);
  chat.pushItem({ kind: "user", text });
  chat.pushItem({ kind: "generation", runId: startGeneration() });
  const txn: TxnRef = { txnId: crypto.randomUUID(), label: `AI: ${clip(text, 40)}` };
  const fills: Promise<void>[] = [];
  const startedEarly = new Set<string>();
  let reply = "";

  const onPlannedSlide: OnPlannedSlide = (slideId, planned, index) => {
    if (index !== 0) return;
    useUiStore.getState().goToSlide(slideId);
    if (planned.layout !== "title") return;
    startedEarly.add(slideId);
    fills.push(populateSlide(slideId, txn, abort.signal));
  };

  try {
    const slideIds = await planOutline(text, txn, abort.signal, onPlannedSlide);
    finishOutline();
    const rest = slideIds.filter((id) => !startedEarly.has(id));
    fills.push(runPool(rest, abort.signal, (slideId) => populateSlide(slideId, txn, abort.signal)));
    await Promise.all(fills);
    if (abort.signal.aborted) {
      pushNotice("info", "Stopped. The slides made so far are kept; use Fill with AI on the rest, or ⌘Z to remove the deck.");
    } else {
      reply = describeOutcome();
      useChatStore.getState().pushItem({ kind: "assistant", text: reply });
    }
  } catch (error) {
    await Promise.all(fills);
    const kept = useDeckStore.getState().deck.slideOrder.length;
    if (!abort.signal.aborted) pushNotice("error", describeError(error), text);
    else if (kept === 0) pushNotice("info", "Stopped before the outline was ready. Nothing was changed.");
    else pushNotice("info", `Stopped while outlining. The ${kept} slides so far are kept; use Fill with AI on them, or ⌘Z to remove them.`);
  } finally {
    finishGeneration();
    useChatStore.getState().endTurn(
      [
        { role: "user", content: text },
        { role: "assistant", content: reply || "(no reply)" },
      ],
      { prompt: text, changes: [] },
    );
  }
}

export async function fillSlide(slideId: string): Promise<void> {
  const chat = useChatStore.getState();
  const title = useDeckStore.getState().deck.slides[slideId]?.title;
  if (chat.abort || !title || !useGenerationStore.getState().outline[slideId]) return;
  const abort = new AbortController();
  chat.beginTurn(abort);
  try {
    await populateSlide(slideId, { txnId: crypto.randomUUID(), label: `AI: Fill "${clip(title, 30)}"` }, abort.signal);
  } finally {
    useChatStore.getState().endTurn([], { prompt: "", changes: [] });
  }
}

async function planOutline(prompt: string, txn: TxnRef, signal: AbortSignal, onSlide: OnPlannedSlide): Promise<string[]> {
  const ctx = aiToolContext(txn);
  const slideIds: string[] = [];
  let finalCall = false;
  let renamed = false;
  let planError = "";

  const register = (slideId: string, planned: PlannedSlide) => {
    slideIds.push(slideId);
    addOutlineSlide(slideId, planned);
    onSlide(slideId, planned, slideIds.length - 1);
  };

  let truncated = false;
  try {
    const result = await streamStep(
      { mode: "plan", messages: [{ role: "user", content: prompt }], deckSnapshot: "" },
      0,
      signal,
      {
        onToolArgs(args, index) {
          if (index !== 0) return;
          const streamed = parseStreamedPlan(args);
          for (const planned of streamed.slides.slice(slideIds.length, MAX_PLANNED_SLIDES)) {
            const added = addPlannedSlide(ctx, planned);
            if (typeof added === "string") {
              planError = added;
              break;
            }
            register(added[0]!, planned);
          }
          setNextTitle(streamed.nextTitle);
        },
        onToolCall(call) {
          if (finalCall || call.function.name !== "plan_deck") return;
          finalCall = true;
          const execution = executeToolCall(call, { ...txn, mode: "plan" });
          if (!execution.ok) {
            planError = execution.summary;
            return;
          }
          renamed = true;
          const { slides } = PlanDeckArgs.parse(JSON.parse(call.function.arguments));
          const known = slideIds.length;
          for (const [i, id] of useDeckStore.getState().deck.slideOrder.slice(known).entries()) register(id, slides[known + i]!);
        },
      },
    );
    truncated = result.truncated;
  } catch (error) {
    if (signal.aborted || slideIds.length === 0) throw error;
    pushNotice("error", `The outline broke off after ${slideIds.length} slides (${describeError(error)}). Filling those.`);
  } finally {
    setNextTitle(null);
    const first = slideIds[0] && useDeckStore.getState().deck.slides[slideIds[0]];
    if (!renamed && first) ctx.apply([{ op: "update_deck", patch: { title: first.title } }]);
  }

  if (slideIds.length === 0) {
    if (planError) throw new Error(`The outline was invalid: ${clip(planError, 300)}`);
    throw new Error(truncated ? "The AI ran out of room while planning. Try a shorter request." : "The AI didn't return an outline. Try again.");
  }
  return slideIds;
}

async function runPool(ids: string[], signal: AbortSignal, run: (id: string) => Promise<void>): Promise<void> {
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined && !signal.aborted; id = queue.shift()) await run(id);
  };
  await Promise.all(Array.from({ length: Math.min(POPULATE_CONCURRENCY, ids.length) }, worker));
}

function describeOutcome(): string {
  const { deck } = useDeckStore.getState();
  const failed = Object.values(useGenerationStore.getState().slides).filter((fill) => fill.status === "failed").length;
  const base = `Created "${deck.title}" with ${deck.slideOrder.length} slides.`;
  if (failed === 0) return `${base} Ask me to change anything, or edit the slides directly.`;
  return `${base} ${failed} couldn't be filled; use Retry on ${failed === 1 ? "that slide" : "those slides"}.`;
}
