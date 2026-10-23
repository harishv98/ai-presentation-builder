import { useDeckStore } from "@/lib/deck/store";
import { resolveCurrentSlideId, useUiStore } from "@/lib/ui/store";
import { executeToolCall } from "./executeTool";
import { revealAiChanges } from "./reveal";
import { runAgent, stopAgent } from "./runAgent";
import { serializeForAI } from "./snapshot";
import { toOpenAiTools } from "./tools";

function snapshot(): string {
  const { deck } = useDeckStore.getState();
  return serializeForAI(deck, resolveCurrentSlideId(deck, useUiStore.getState().currentSlideId));
}

function run(name: string, args: unknown) {
  const call = { id: "console", type: "function" as const, function: { name, arguments: JSON.stringify(args) } };
  const execution = executeToolCall(call, { txnId: crypto.randomUUID(), label: `Tool: ${name}` });
  if (execution.ok) revealAiChanges(execution.touched);
  return execution;
}

const agentDevtools = { snapshot, run, ask: runAgent, stop: stopAgent, definitions: () => toOpenAiTools() };

declare global {
  interface Window {
    agent?: typeof agentDevtools;
  }
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.agent = agentDevtools;
}
