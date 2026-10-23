import { useDeckStore } from "@/lib/deck/store";
import { resolveCurrentSlideId, useUiStore } from "@/lib/ui/store";
import { executeToolCall } from "./executeTool";
import { serializeForAI } from "./snapshot";
import { toOpenAiTools } from "./tools";

function snapshot(): string {
  const { deck } = useDeckStore.getState();
  return serializeForAI(deck, resolveCurrentSlideId(deck, useUiStore.getState().currentSlideId));
}

function run(name: string, args: unknown) {
  const call = { id: "console", type: "function" as const, function: { name, arguments: JSON.stringify(args) } };
  return executeToolCall(call, { txnId: crypto.randomUUID(), label: `Tool: ${name}` });
}

const agentDevtools = { snapshot, run, definitions: () => toOpenAiTools() };

declare global {
  interface Window {
    agent?: typeof agentDevtools;
  }
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.agent = agentDevtools;
}
