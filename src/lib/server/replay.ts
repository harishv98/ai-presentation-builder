import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChatMessage } from "@/lib/agent/protocol";

const FIXTURE_DIR = path.join(process.cwd(), "fixtures", "agent");
const DRIP_MS = 30;

export const SSE_HEADERS = { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" };

export const replayEnabled = () => process.env.AGENT_REPLAY === "1";
export const recordEnabled = () => process.env.AGENT_RECORD === "1" && process.env.NODE_ENV !== "production";

export function fixtureName(messages: ChatMessage[]): string {
  const lastUser = messages.findLastIndex((m) => m.role === "user");
  const prompt = lastUser === -1 ? "" : (messages[lastUser]?.content ?? "");
  const step = messages.slice(lastUser + 1).filter((m) => m.role === "assistant").length;
  const slug =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "empty";
  return `${slug}.step${step}.sse`;
}

export async function replayResponse(name: string): Promise<Response> {
  let text: string;
  try {
    text = await readFile(path.join(FIXTURE_DIR, name), "utf8");
  } catch {
    text = textEvent(`No recording named ${name}. Record it by running the dev server with AGENT_RECORD=1.`);
  }
  return new Response(drip(text), { headers: SSE_HEADERS });
}

export function recordStream(body: ReadableStream<Uint8Array>, name: string): ReadableStream<Uint8Array> {
  const [toClient, toDisk] = body.tee();
  void new Response(toDisk)
    .text()
    .then(async (text) => {
      await mkdir(FIXTURE_DIR, { recursive: true });
      await writeFile(path.join(FIXTURE_DIR, name), dropReasoningEvents(text));
    })
    .catch((error: unknown) => console.warn(`[replay] could not record ${name}`, error));
  return toClient;
}

// The client ignores reasoning deltas; keeping them makes replay drip for tens of seconds.
export function dropReasoningEvents(text: string): string {
  return text
    .split(/\r?\n\r?\n/)
    .filter((event) => event.trim() && !isReasoningOnly(event))
    .map((event) => `${event}\n\n`)
    .join("");
}

function isReasoningOnly(event: string): boolean {
  const payload = event.replace(/^data:\s*/, "");
  if (payload === "[DONE]") return false;
  try {
    const chunk = JSON.parse(payload) as { usage?: unknown; choices?: { delta?: Record<string, unknown>; finish_reason?: unknown }[] };
    if (chunk.usage || chunk.choices?.length !== 1) return false;
    const [choice] = chunk.choices;
    const keys = Object.keys(choice?.delta ?? {}).filter((key) => key !== "role");
    return !choice?.finish_reason && keys.length > 0 && keys.every((key) => key === "reasoning" || key === "reasoning_content");
  } catch {
    return false;
  }
}

function drip(text: string): ReadableStream<Uint8Array> {
  const events = text.split(/\r?\n\r?\n/).filter((e) => e.trim());
  const encoder = new TextEncoder();
  return new ReadableStream({
    async pull(controller) {
      const next = events.shift();
      if (next === undefined) {
        controller.close();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, DRIP_MS));
      controller.enqueue(encoder.encode(`${next}\n\n`));
    },
  });
}

function textEvent(message: string): string {
  const chunk = { choices: [{ delta: { content: message }, finish_reason: "stop" }] };
  return `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
}
