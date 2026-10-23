import type { Op } from "@/lib/deck/ops";
import { useDeckStore } from "@/lib/deck/store";
import type { ToolCall } from "./protocol";
import { describeElement } from "./snapshot";
import { findTool, type ToolContext } from "./tools";

export type ToolExecution = {
  callId: string;
  name: string;
  ok: boolean;
  summary: string;
  touched: string[];
  added: string[];
  content: string;
};

export function executeToolCall(call: ToolCall, meta: { txnId: string; label: string }): ToolExecution {
  const base = { callId: call.id, name: call.function.name };
  const tool = findTool(call.function.name);
  if (!tool) return failed(base, `Unknown tool ${call.function.name}`);

  let args: unknown;
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch {
    return failed(base, "Arguments are not valid JSON");
  }

  const ctx: ToolContext = {
    deck: () => useDeckStore.getState().deck,
    apply: (ops: Op[]) => useDeckStore.getState().applyOps(ops, { source: "ai", label: meta.label, txnId: meta.txnId }),
  };

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

function failed(base: { callId: string; name: string }, error: string): ToolExecution {
  return { ...base, ok: false, summary: error, touched: [], added: [], content: JSON.stringify({ ok: false, error }) };
}
