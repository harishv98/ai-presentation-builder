import { pushNotice, useChatStore } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";
import { finishGeneration, finishOutline, setSlideFill, startGeneration, useGenerationStore } from "@/lib/generation/store";
import { useUiStore } from "@/lib/ui/store";
import { describeError } from "../stream/agentRequest";
import { newUndoGroup } from "../runtime/executeTool";
import { planOutline } from "./planOutline";
import { populateSlide } from "./populateSlide";
import { clip } from "../deck/snapshot";
import type { PlannedSlide } from "../tools/planTool";

const POPULATE_CONCURRENCY = 2;

type FillPool = { add: (ids: string[]) => void; drain: () => Promise<void> };

/** The running generation's pool; retries join it so Stop, undo and the concurrency cap cover them too. */
let activePool: FillPool | null = null;

export async function generateDeck(prompt: string): Promise<void> {
  const text = prompt.trim();
  const chat = useChatStore.getState();
  if (!text || chat.abort) return;

  const abort = new AbortController();
  chat.beginTurn(abort);
  chat.pushItem({ kind: "user", text });
  chat.pushItem({ kind: "generation", runId: startGeneration() });
  const undoGroup = newUndoGroup(`AI: ${clip(text, 40)}`);
  const pool = createPool(abort.signal, (slideId) => populateSlide(slideId, undoGroup, abort.signal));
  activePool = pool;
  const prefilled = new Set<string>();
  let reply = "";

  const onFirstSlide = (slideId: string, planned: PlannedSlide) => {
    useUiStore.getState().goToSlide(slideId);
    if (planned.layout !== "title") return;
    prefilled.add(slideId);
    pool.add([slideId]);
  };

  try {
    const thread = useChatStore.getState().planThread;
    const outcome = await planOutline(text, thread, undoGroup, abort.signal, onFirstSlide);

    if (outcome.kind === "question") {
      reply = outcome.text;
      useChatStore.getState().setPlanThread([...thread, { role: "user", content: text }, { role: "assistant", content: reply }]);
      return;
    }
    if (outcome.kind === "failed") {
      await pool.drain();
      pushNotice("error", outcome.message, text);
      return;
    }
    if (outcome.kind === "stopped") {
      await pool.drain();
      pushNotice("info", stoppedWhilePlanning());
      return;
    }

    useChatStore.getState().setPlanThread([]);
    finishOutline();
    pool.add(outcome.slideIds.filter((id) => !prefilled.has(id)));
    await pool.drain();
    if (abort.signal.aborted) {
      pushNotice("info", "Stopped. The slides made so far are kept; use Fill with AI on the rest, or ⌘Z to remove the deck.");
    } else {
      reply = describeOutcome();
      useChatStore.getState().pushItem({ kind: "assistant", text: reply });
    }
  } catch (error) {
    await pool.drain();
    pushNotice("error", describeError(error), text);
  } finally {
    activePool = null;
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
  const generation = useGenerationStore.getState();
  if (!title || !generation.outline[slideId]) return;
  const status = generation.slides[slideId]?.status;
  if (status === "pending" || status === "filling") return;
  if (activePool) {
    setSlideFill(slideId, { status: "pending" });
    activePool.add([slideId]);
    return;
  }
  if (chat.abort) return;
  const abort = new AbortController();
  chat.beginTurn(abort);
  try {
    await populateSlide(slideId, newUndoGroup(`AI: Fill "${clip(title, 30)}"`), abort.signal);
  } finally {
    useChatStore.getState().endTurn([], { prompt: "", changes: [] });
  }
}

/** Fills slides at most POPULATE_CONCURRENCY at a time; slides can be added while it runs. */
function createPool(signal: AbortSignal, run: (id: string) => Promise<void>): FillPool {
  const queue: string[] = [];
  const workers = new Set<Promise<void>>();
  const work = async () => {
    while (queue.length > 0 && !signal.aborted) await run(queue.shift()!);
  };
  return {
    add(ids) {
      queue.push(...ids);
      const spawn = Math.min(POPULATE_CONCURRENCY - workers.size, queue.length);
      for (let i = 0; i < spawn; i++) {
        const worker: Promise<void> = work().finally(() => workers.delete(worker));
        workers.add(worker);
      }
    },
    async drain() {
      while (workers.size > 0) await Promise.all(workers);
    },
  };
}

function stoppedWhilePlanning(): string {
  const kept = useDeckStore.getState().deck.slideOrder.length;
  if (kept === 0) return "Stopped before the outline was ready. Nothing was changed.";
  return `Stopped while outlining. The ${kept} slides so far are kept; use Fill with AI on them, or ⌘Z to remove them.`;
}

function describeOutcome(): string {
  const { deck } = useDeckStore.getState();
  const failed = Object.values(useGenerationStore.getState().slides).filter((fill) => fill.status === "failed");
  const base = `Created "${deck.title}" with ${deck.slideOrder.length} slides.`;
  if (failed.length === 0) return `${base} Ask me to change anything, or edit the slides directly.`;
  const reasons = new Set(failed.map((fill) => fill.error ?? "Unknown error"));
  const why = reasons.size === 1 ? sentence([...reasons][0]!) : "Each slide above shows why.";
  const which = failed.length === 1 ? "that slide" : "those slides";
  return `${base} ${failed.length} couldn't be filled. ${why} Use Retry on ${which}.`;
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
