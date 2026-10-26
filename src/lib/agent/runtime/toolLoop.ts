import { streamStep } from "../stream/agentRequest";
import type { ToolExecution } from "./executeTool";
import type { ChatMessage, ChatRequest, ToolCall } from "../protocol";
import type { TurnResult } from "../stream/sse";

export type LoopStep = TurnResult & { step: number; executions: ToolExecution[] };

/** After a step: send another, end the loop, or add a user message and send another. */
export type LoopDecision = "continue" | "stop" | { followUp: string };

export type ToolLoopOptions = {
  maxSteps: number;
  signal: AbortSignal;
  /** The request for the next step given the turn so far, or null to end the loop. */
  buildRequest: (turn: ChatMessage[]) => ChatRequest | null;
  /** Runs one tool call as soon as it has fully streamed in. */
  execute: (call: ToolCall) => ToolExecution;
  decide: (step: LoopStep) => LoopDecision;
  /** Called at the start of each step for a writer that receives that step's streamed text. */
  textWriter?: () => (delta: string) => void;
  stream?: typeof streamStep;
};

export type ToolLoopEnd = { outOfSteps: boolean; last: LoopStep | null };

/**
 * The agent loop shared by edit and populate: stream a step, execute its tool calls, feed the
 * results back, and repeat until `decide` stops it or `maxSteps` runs out.
 */
export async function runToolLoop(prompt: string, options: ToolLoopOptions): Promise<ToolLoopEnd> {
  const { maxSteps, signal, buildRequest, execute, decide, textWriter, stream = streamStep } = options;
  const turn: ChatMessage[] = [{ role: "user", content: prompt }];
  let last: LoopStep | null = null;

  for (let step = 0; step < maxSteps; step++) {
    const request = buildRequest(turn);
    if (!request) return { outOfSteps: false, last };
    const executions: ToolExecution[] = [];
    const result = await stream(request, step, signal, {
      onText: textWriter?.(),
      onToolCall: (call) => executions.push(execute(call)),
    });
    last = { ...result, step, executions };
    turn.push(assistantMessage(result), ...executions.map(toolResultMessage));

    const decision = decide(last);
    if (decision === "stop") return { outOfSteps: false, last };
    if (decision !== "continue") turn.push({ role: "user", content: decision.followUp });
  }
  return { outOfSteps: true, last };
}

function assistantMessage({ text, toolCalls }: TurnResult): ChatMessage {
  // Content may only be null when the message carries tool calls.
  if (toolCalls.length === 0) return { role: "assistant", content: text };
  return { role: "assistant", content: text || null, tool_calls: toolCalls };
}

function toolResultMessage(execution: ToolExecution): ChatMessage {
  return { role: "tool", tool_call_id: execution.callId, content: execution.content };
}
