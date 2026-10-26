import { pushNotice, useChatStore } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";
import { finishGeneration, finishOutline, startGeneration, useGenerationStore } from "@/lib/generation/store";
import { useUiStore } from "@/lib/ui/store";
import { describeError } from "../stream/agentRequest";
import { newUndoGroup } from "../runtime/executeTool";
import { planOutline } from "./planOutline";
import { populateSlide } from "./populateSlide";
import { clip } from "../deck/snapshot";
import type { PlannedSlide } from "../tools/planTool";

const POPULATE_CONCURRENCY = 2;

export async function generateDeck(prompt: string): Promise<void> {
  const text = prompt.trim();
  const chat = useChatStore.getState();
  if (!text || chat.abort) return;

  const abort = new AbortController();
  chat.beginTurn(abort);
  chat.pushItem({ kind: "user", text });
  chat.pushItem({ kind: "generation", runId: startGeneration() });
  const undoGroup = newUndoGroup(`AI: ${clip(text, 40)}`);
  const fill = (slideId: string) => populateSlide(slideId, undoGroup, abort.signal);
  const fills: Promise<void>[] = [];
  const prefilled = new Set<string>();
  let reply = "";

  const onFirstSlide = (slideId: string, planned: PlannedSlide) => {
    useUiStore.getState().goToSlide(slideId);
    if (planned.layout !== "title") return;
    prefilled.add(slideId);
    fills.push(fill(slideId));
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
      await Promise.all(fills);
      pushNotice("error", outcome.message, text);
      return;
    }
    if (outcome.kind === "stopped") {
      await Promise.all(fills);
      pushNotice("info", stoppedWhilePlanning());
      return;
    }

    useChatStore.getState().setPlanThread([]);
    finishOutline();
    fills.push(runPool(outcome.slideIds.filter((id) => !prefilled.has(id)), abort.signal, fill));
    await Promise.all(fills);
    if (abort.signal.aborted) {
      pushNotice("info", "Stopped. The slides made so far are kept; use Fill with AI on the rest, or ⌘Z to remove the deck.");
    } else {
      reply = describeOutcome();
      useChatStore.getState().pushItem({ kind: "assistant", text: reply });
    }
  } catch (error) {
    await Promise.all(fills);
    pushNotice("error", describeError(error), text);
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
    await populateSlide(slideId, newUndoGroup(`AI: Fill "${clip(title, 30)}"`), abort.signal);
  } finally {
    useChatStore.getState().endTurn([], { prompt: "", changes: [] });
  }
}

async function runPool(ids: string[], signal: AbortSignal, run: (id: string) => Promise<void>): Promise<void> {
  const queue = [...ids];
  const worker = async () => {
    while (queue.length > 0 && !signal.aborted) await run(queue.shift()!);
  };
  await Promise.all(Array.from({ length: Math.min(POPULATE_CONCURRENCY, ids.length) }, worker));
}

function stoppedWhilePlanning(): string {
  const kept = useDeckStore.getState().deck.slideOrder.length;
  if (kept === 0) return "Stopped before the outline was ready. Nothing was changed.";
  return `Stopped while outlining. The ${kept} slides so far are kept; use Fill with AI on them, or ⌘Z to remove them.`;
}

function describeOutcome(): string {
  const { deck } = useDeckStore.getState();
  const failed = Object.values(useGenerationStore.getState().slides).filter((fill) => fill.status === "failed").length;
  const base = `Created "${deck.title}" with ${deck.slideOrder.length} slides.`;
  if (failed === 0) return `${base} Ask me to change anything, or edit the slides directly.`;
  return `${base} ${failed} couldn't be filled; use Retry on ${failed === 1 ? "that slide" : "those slides"}.`;
}
