import type { ToolCall } from "./protocol";
import { parseTaggedToolCalls, taggedStart } from "./toolCallTags";

type ToolCallDelta = { index?: number; id?: string; function?: { name?: string; arguments?: string } };

type StreamChunk = {
  choices?: { delta?: { content?: string | null; tool_calls?: ToolCallDelta[] }; finish_reason?: string | null }[];
  usage?: unknown;
  error?: { message?: string };
};

export async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseDataLine(line);
      if (event !== undefined) yield event;
    }
  }
  const last = parseDataLine(buffer);
  if (last !== undefined) yield last;
}

function parseDataLine(line: string): unknown {
  if (!line.startsWith("data:")) return undefined;
  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

export type TurnEvents = {
  onText?: (delta: string) => void;
  onToolCall: (call: ToolCall) => void;
  onToolArgs?: (args: string, index: number) => void;
};

export function createTurnAccumulator(step: number, events: TurnEvents) {
  let text = "";
  let shown = 0;
  let usage: unknown;
  let finishReason: string | null = null;
  const calls: ToolCall[] = [];
  let open = -1;

  function closeOpen() {
    const call = calls[open];
    if (call) {
      call.id ||= `call_${step}_${open}`;
      events.onToolCall(call);
    }
    open = -1;
  }

  return {
    push(raw: unknown) {
      const chunk = raw as StreamChunk;
      if (chunk.error) throw new Error(chunk.error.message ?? "The model stream failed");
      if (chunk.usage) usage = chunk.usage;
      finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) return;
      if (delta.content) {
        text += delta.content;
        const tags = taggedStart(text);
        const visible = tags === -1 ? text.length : tags;
        if (visible > shown) {
          events.onText?.(text.slice(shown, visible));
          shown = visible;
        }
        // Stream the salvaged arguments the same way a real tool call streams, so the outline
        // still appears slide by slide.
        if (tags !== -1 && calls.length === 0) {
          const [first] = parseTaggedToolCalls(text.slice(tags), false);
          if (first) events.onToolArgs?.(first.arguments, 0);
        }
      }
      for (const part of delta.tool_calls ?? []) {
        const index = part.index ?? (part.id || open === -1 ? calls.length : open);
        if (index !== open) {
          closeOpen();
          open = index;
        }
        const call = (calls[index] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
        if (part.id) call.id = part.id;
        if (part.function?.name) call.function.name += part.function.name;
        if (part.function?.arguments) {
          call.function.arguments += part.function.arguments;
          events.onToolArgs?.(call.function.arguments, index);
        }
      }
    },
    finish() {
      closeOpen();
      const tags = taggedStart(text);
      if (tags !== -1) {
        if (calls.length === 0) {
          for (const [index, tagged] of parseTaggedToolCalls(text.slice(tags)).entries()) {
            const call: ToolCall = { id: `call_${step}_tag_${index}`, type: "function", function: tagged };
            calls.push(call);
            events.onToolCall(call);
          }
        }
        text = text.slice(0, tags);
      }
      return { text, toolCalls: calls.filter(Boolean), usage, truncated: finishReason === "length" };
    },
  };
}
