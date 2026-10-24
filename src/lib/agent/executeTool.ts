import type { Op } from "@/lib/deck/ops";
import type { Deck } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";
import type { AgentMode, ToolCall } from "./protocol";
import { describeElement } from "./snapshot";
import { findTool, type ToolContext } from "./tools";

export type ToolScope = { txnId: string; label: string; mode?: AgentMode; slideId?: string };

export type ToolExecution = {
  callId: string;
  name: string;
  ok: boolean;
  summary: string;
  touched: string[];
  added: string[];
  previously: string[];
  content: string;
};

export function executeToolCall(call: ToolCall, scope: ToolScope): ToolExecution {
  const base = { callId: call.id, name: call.function.name };
  const tool = findTool(call.function.name, scope.mode);
  if (!tool) return failed(base, `Tool ${call.function.name} is not available here`);

  let args: unknown;
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch {
    return failed(base, "Arguments are not valid JSON");
  }

  const outside = scope.slideId ? outsideSlide(useDeckStore.getState().deck, args, scope.slideId) : null;
  if (outside) return failed(base, outside);
  const conflict = editingConflict(useDeckStore.getState().deck, call.function.name, args);
  if (conflict) return failed(base, conflict);

  const ctx = aiToolContext(scope);

  try {
    const before = ctx.deck();
    const outcome = tool.execute(args, ctx);
    if (!outcome.ok) return failed(base, outcome.error);
    const after = ctx.deck();
    const added = outcome.touched.filter((id) => !before.elements[id] && !before.slides[id]);
    const previously = outcome.touched.flatMap((id) => {
      const old = before.elements[id];
      return old && old !== after.elements[id] ? [describeElement(old)] : [];
    });
    return {
      ...base,
      ok: true,
      summary: outcome.summary,
      touched: outcome.touched,
      added,
      previously,
      content: JSON.stringify({
        ok: true,
        applied: outcome.summary,
        ...outcome.data,
        ...(previously.length > 0 && { previously }),
      }),
    };
  } catch (error) {
    return failed(base, `Tool crashed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function aiToolContext(txn: { txnId: string; label: string }): ToolContext {
  return {
    deck: () => useDeckStore.getState().deck,
    apply: (ops: Op[]) => useDeckStore.getState().applyOps(ops, { source: "ai", label: txn.label, txnId: txn.txnId }),
  };
}

function failed(base: { callId: string; name: string }, error: string): ToolExecution {
  return { ...base, ok: false, summary: error, touched: [], added: [], previously: [], content: JSON.stringify({ ok: false, error }) };
}

function outsideSlide(deck: Deck, args: unknown, slideId: string): string | null {
  const { slideId: target, elementId } = (args ?? {}) as { slideId?: unknown; elementId?: unknown };
  if (typeof target === "string" && target !== slideId) return `Only slide ${slideId} can be changed now`;
  const element = typeof elementId === "string" ? deck.elements[elementId] : undefined;
  if (element && element.slideId !== slideId) return `Only elements on slide ${slideId} can be changed now`;
  return null;
}

function editingConflict(deck: Deck, name: string, args: unknown): string | null {
  const editing = useUiStore.getState().editing;
  if (!editing) return null;
  const { elementId, slideId } = (args ?? {}) as { elementId?: unknown; slideId?: unknown };
  const deletesItsSlide = name === "delete_slide" && slideId === deck.elements[editing.elementId]?.slideId;
  if (elementId !== editing.elementId && !deletesItsSlide) return null;
  return `The user is editing ${editing.elementId} right now. Leave it as it is and continue with the rest of the request.`;
}
