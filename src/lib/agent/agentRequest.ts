import type { ChatErrorBody, ChatRequest } from "./protocol";
import { createTurnAccumulator, readSseEvents, type TurnEvents } from "./sse";

export class AgentRequestError extends Error {
  status: number;
  body: Partial<ChatErrorBody>;
  retryAfter: string | null;

  constructor(res: Response, body: Partial<ChatErrorBody>) {
    super(body.error ?? `HTTP ${res.status}`);
    this.status = res.status;
    this.body = body;
    this.retryAfter = res.headers.get("retry-after");
  }
}

export async function streamStep(request: ChatRequest, step: number, signal: AbortSignal, events: TurnEvents) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as Partial<ChatErrorBody>;
    throw new AgentRequestError(res, body);
  }
  const accumulator = createTurnAccumulator(step, events);
  for await (const event of readSseEvents(res.body)) accumulator.push(event);
  const result = accumulator.finish();
  if (process.env.NODE_ENV !== "production" && result.usage) {
    console.debug(`[agent] ${request.mode} step ${step + 1} usage`, result.usage);
  }
  return result;
}

export function describeError(error: unknown): string {
  if (error instanceof AgentRequestError) {
    switch (error.body.code) {
      case "rate_limited":
        return `Too many requests. Try again in ${error.retryAfter ?? "a few"} seconds.`;
      case "not_configured":
        return "The server has no SARVAM_API_KEY. Add it to .env.local and restart the dev server.";
      case "too_large":
        return "The deck is too large to send to the AI.";
      case "upstream": {
        const status = error.body.upstreamStatus;
        if (status === 401 || status === 403) return "Sarvam rejected the API key.";
        if (status === 402 || status === 429) return `Sarvam refused the request (credits or rate limit): ${error.message}`;
        return `The AI service failed: ${error.message}`;
      }
      default:
        return error.message;
    }
  }
  if (error instanceof TypeError) return "Network error: could not reach the server.";
  return error instanceof Error ? error.message : String(error);
}
