import { describe, expect, it, vi } from "vitest";
import type { ToolExecution } from "./executeTool";
import type { ChatMessage, ChatRequest, ToolCall } from "../protocol";
import type { TurnEvents, TurnResult } from "../stream/sse";
import { runToolLoop, type ToolLoopOptions } from "./toolLoop";

type Scripted = { text?: string; calls?: string[] };

const call = (name: string, step: number): ToolCall => ({ id: `${name}_${step}`, type: "function", function: { name, arguments: "{}" } });

function scriptedStream(steps: Scripted[]) {
  const requests: ChatMessage[][] = [];
  const stream = vi.fn(async (request: ChatRequest, step: number, _signal: AbortSignal, events: TurnEvents): Promise<TurnResult> => {
    requests.push(structuredClone(request.messages));
    const { text = "", calls = [] } = steps[step] ?? {};
    if (text) events.onText?.(text);
    const toolCalls = calls.map((name) => call(name, step));
    for (const toolCall of toolCalls) events.onToolCall(toolCall);
    return { text, toolCalls, usage: undefined, truncated: false };
  });
  return { stream, requests };
}

const execution = (toolCall: ToolCall, ok = true): ToolExecution => ({
  callId: toolCall.id,
  name: toolCall.function.name,
  ok,
  summary: "",
  touched: [],
  added: [],
  previously: [],
  content: JSON.stringify({ ok }),
});

function options(stream: ToolLoopOptions["stream"], overrides: Partial<ToolLoopOptions> = {}): ToolLoopOptions {
  return {
    maxSteps: 5,
    signal: new AbortController().signal,
    buildRequest: (turn) => ({ mode: "edit", messages: turn, deckSnapshot: "" }),
    execute: (toolCall) => execution(toolCall),
    decide: (step) => (step.toolCalls.length === 0 ? "stop" : "continue"),
    stream,
    ...overrides,
  };
}

describe("runToolLoop", () => {
  it("feeds tool results back until the model replies without tools", async () => {
    const { stream, requests } = scriptedStream([{ calls: ["add"] }, { text: "Done" }]);
    const end = await runToolLoop("Add a slide", options(stream));

    expect(end).toMatchObject({ outOfSteps: false, last: { step: 1, text: "Done" } });
    expect(requests[1]).toEqual([
      { role: "user", content: "Add a slide" },
      { role: "assistant", content: null, tool_calls: [call("add", 0)] },
      { role: "tool", tool_call_id: "add_0", content: '{"ok":true}' },
    ]);
  });

  it("reports running out of steps", async () => {
    const { stream } = scriptedStream([{ calls: ["a"] }, { calls: ["b"] }]);
    expect(await runToolLoop("x", options(stream, { maxSteps: 2 }))).toMatchObject({ outOfSteps: true, last: { step: 1 } });
  });

  it("adds a follow-up user message after a text-only reply, keeping its empty content", async () => {
    const { stream, requests } = scriptedStream([{}, { calls: ["a"] }]);
    let retried = false;
    await runToolLoop("x", options(stream, {
      decide: (step) => {
        if (step.toolCalls.length > 0) return "stop";
        if (retried) return "stop";
        retried = true;
        return { followUp: "Use tools" };
      },
    }));
    expect(requests[1]?.slice(1)).toEqual([
      { role: "assistant", content: "" },
      { role: "user", content: "Use tools" },
    ]);
  });

  it("ends without streaming when buildRequest returns null", async () => {
    const { stream } = scriptedStream([]);
    const end = await runToolLoop("x", options(stream, { buildRequest: () => null }));
    expect(end).toEqual({ outOfSteps: false, last: null });
    expect(stream).not.toHaveBeenCalled();
  });

  it("gives each step a fresh text writer", async () => {
    const { stream } = scriptedStream([{ text: "a", calls: ["t"] }, { text: "b" }]);
    const writers: string[][] = [];
    await runToolLoop("x", options(stream, {
      textWriter: () => {
        const parts: string[] = [];
        writers.push(parts);
        return (delta) => parts.push(delta);
      },
    }));
    expect(writers).toEqual([["a"], ["b"]]);
  });
});
