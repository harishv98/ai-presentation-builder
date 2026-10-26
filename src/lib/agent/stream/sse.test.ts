import { describe, expect, it, vi } from "vitest";
import type { ToolCall } from "../protocol";
import { createTurnAccumulator, readSseEvents } from "./sse";

const text = (content: string) => ({ choices: [{ delta: { content } }] });
const toolPart = (part: { index: number; id?: string; name?: string; args?: string }) => ({
  choices: [
    {
      delta: {
        tool_calls: [
          {
            index: part.index,
            ...(part.id && { id: part.id }),
            function: { ...(part.name && { name: part.name }), ...(part.args && { arguments: part.args }) },
          },
        ],
      },
    },
  ],
});

function run(chunks: unknown[], step = 0) {
  const onText = vi.fn<(delta: string) => void>();
  const onToolArgs = vi.fn<(args: string, index: number) => void>();
  const finished: ToolCall[] = [];
  const accumulator = createTurnAccumulator(step, { onText, onToolArgs, onToolCall: (call) => finished.push(structuredClone(call)) });
  for (const chunk of chunks) accumulator.push(chunk);
  return { result: accumulator.finish(), onText, onToolArgs, finished };
}

describe("createTurnAccumulator", () => {
  it("streams text deltas and returns the full text", () => {
    const { result, onText } = run([text("Hello"), text(", world")]);
    expect(onText.mock.calls.map(([delta]) => delta)).toEqual(["Hello", ", world"]);
    expect(result).toMatchObject({ text: "Hello, world", toolCalls: [], truncated: false });
  });

  it("rebuilds indexed tool calls and reports each one when the next starts or the stream ends", () => {
    const { result, onToolArgs, finished } = run([
      toolPart({ index: 0, id: "a", name: "add_", args: '{"x"' }),
      toolPart({ index: 0, name: "slide", args: ":1}" }),
      toolPart({ index: 1, id: "b", name: "delete_slide", args: "{}" }),
    ]);
    expect(finished.map((call) => [call.id, call.function.name, call.function.arguments])).toEqual([
      ["a", "add_slide", '{"x":1}'],
      ["b", "delete_slide", "{}"],
    ]);
    expect(onToolArgs.mock.calls).toEqual([
      ['{"x"', 0],
      ['{"x":1}', 0],
      ["{}", 1],
    ]);
    expect(result.toolCalls).toHaveLength(2);
  });

  it("gives calls without an id a stable synthetic one", () => {
    const { finished } = run([toolPart({ index: 0, name: "one", args: "{}" })], 3);
    expect(finished[0]?.id).toBe("call_3_0");
  });

  it("flags a length cutoff as truncated", () => {
    const { result } = run([text("a"), { choices: [{ delta: {}, finish_reason: "length" }] }]);
    expect(result.truncated).toBe(true);
  });

  it("throws on an error chunk", () => {
    const accumulator = createTurnAccumulator(0, { onToolCall: () => {} });
    expect(() => accumulator.push({ error: { message: "boom" } })).toThrow("boom");
  });
});

describe("readSseEvents", () => {
  it("parses data lines split across chunks and skips noise", async () => {
    const encoder = new TextEncoder();
    const parts = ['data: {"a":', '1}\n\n: comment\ndata: [DONE]\n', 'data: not json\ndata: {"b":2}'];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    });
    const events: unknown[] = [];
    for await (const event of readSseEvents(body)) events.push(event);
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
