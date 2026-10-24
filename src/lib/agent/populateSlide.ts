import { useDeckStore } from "@/lib/deck/store";
import { setSlideFill, useGenerationStore } from "@/lib/generation/store";
import { describeError, streamStep } from "./agentRequest";
import { arrangeSlide, bodyElements } from "./arrange";
import { executeToolCall, type ToolExecution } from "./executeTool";
import type { ChatMessage } from "./protocol";
import { revealAiChanges } from "./reveal";
import { serializeForPopulate } from "./snapshot";
import type { PlannedSlide } from "./tools/planTool";

const POPULATE_MAX_STEPS = 3;

export type TxnRef = { txnId: string; label: string };

export async function populateSlide(slideId: string, txn: TxnRef, signal: AbortSignal): Promise<void> {
  const planned = useGenerationStore.getState().outline[slideId];
  if (!planned) return;
  setSlideFill(slideId, { status: "filling" });
  const turn: ChatMessage[] = [{ role: "user", content: instruction(slideId, planned) }];
  let lastError = "";

  try {
    for (let step = 0; step < POPULATE_MAX_STEPS; step++) {
      const { deck } = useDeckStore.getState();
      if (!deck.slides[slideId]) break;
      const executions: ToolExecution[] = [];
      const snapshot = serializeForPopulate(deck, slideId, useGenerationStore.getState().outline);
      const result = await streamStep({ mode: "populate", messages: turn, deckSnapshot: snapshot }, step, signal, {
        onToolCall(call) {
          const execution = executeToolCall(call, { ...txn, mode: "populate", slideId });
          executions.push(execution);
          if (!execution.ok) {
            lastError = execution.summary;
            return;
          }
          tidy(slideId, txn);
          revealAiChanges(execution.touched, { follow: false });
        },
      });
      turn.push({
        role: "assistant",
        content: result.text || null,
        ...(result.toolCalls.length > 0 && { tool_calls: result.toolCalls }),
      });
      for (const execution of executions) turn.push({ role: "tool", tool_call_id: execution.callId, content: execution.content });
      if (executions.length === 0) {
        if (result.truncated) lastError = "The AI ran out of room while thinking";
        break;
      }
      if (executions.every((execution) => execution.ok)) break;
    }
    const filled = bodyElements(useDeckStore.getState().deck, slideId).length > 0;
    setSlideFill(slideId, filled ? { status: "done" } : { status: "failed", error: lastError || "The AI added no content" });
  } catch (error) {
    setSlideFill(slideId, signal.aborted ? { status: "stopped" } : { status: "failed", error: describeError(error) });
  }
}

function instruction(slideId: string, planned: PlannedSlide): string {
  const number = useDeckStore.getState().deck.slideOrder.indexOf(slideId) + 1;
  return `Fill slide ${number} (${slideId}) "${planned.title}". Layout: ${planned.layout}. Planned visual: ${planned.visual}. It should cover: ${planned.intent}`;
}

function tidy(slideId: string, txn: TxnRef): void {
  const { deck, applyOps } = useDeckStore.getState();
  const ops = arrangeSlide(deck, slideId);
  if (ops.length > 0) applyOps(ops, { source: "ai", ...txn });
}
