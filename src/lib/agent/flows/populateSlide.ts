import { useDeckStore } from "@/lib/deck/store";
import { setSlideFill, useGenerationStore } from "@/lib/generation/store";
import { describeError } from "../stream/agentRequest";
import { bodyElements } from "../deck/arrange";
import { autoArrange, executeToolCall, type UndoGroup } from "../runtime/executeTool";
import { revealAiChanges } from "../runtime/reveal";
import { serializeForPopulate } from "../deck/snapshot";
import { runToolLoop } from "../runtime/toolLoop";
import type { PlannedSlide } from "../tools/planTool";

const POPULATE_MAX_STEPS = 3;

export async function populateSlide(slideId: string, undoGroup: UndoGroup, signal: AbortSignal): Promise<void> {
  const planned = useGenerationStore.getState().outline[slideId];
  if (!planned) return;
  setSlideFill(slideId, { status: "filling" });
  let lastError = "";

  try {
    await runToolLoop(instruction(slideId, planned), {
      maxSteps: POPULATE_MAX_STEPS,
      signal,
      buildRequest(turn) {
        const { deck } = useDeckStore.getState();
        if (!deck.slides[slideId]) return null;
        const snapshot = serializeForPopulate(deck, slideId, useGenerationStore.getState().outline);
        return { mode: "populate", messages: turn, deckSnapshot: snapshot };
      },
      execute(call) {
        const execution = executeToolCall(call, { ...undoGroup, mode: "populate", slideId });
        if (!execution.ok) {
          lastError = execution.summary;
          return execution;
        }
        autoArrange(slideId, undoGroup);
        revealAiChanges(execution.touched, { follow: false });
        return execution;
      },
      decide({ executions, truncated }) {
        if (executions.length > 0) return executions.every((execution) => execution.ok) ? "stop" : "continue";
        lastError = truncated ? "The AI ran out of room while thinking" : "The AI made no tool calls";
        return "stop";
      },
    });
    const filled = bodyElements(useDeckStore.getState().deck, slideId).length > 0;
    setSlideFill(slideId, filled ? { status: "done" } : { status: "failed", error: lastError || "The AI added no content" });
  } catch (error) {
    setSlideFill(slideId, signal.aborted ? { status: "stopped" } : { status: "failed", error: describeError(error) });
  }
}

function instruction(slideId: string, planned: PlannedSlide): string {
  return `Fill slide ${slideNumber(slideId)} (${slideId}) "${planned.title}". Layout: ${planned.layout}. Planned visual: ${planned.visual}. It should cover: ${planned.intent}`;
}

function slideNumber(slideId: string): number {
  return useDeckStore.getState().deck.slideOrder.indexOf(slideId) + 1;
}