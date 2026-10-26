import { z } from "zod";
import { ChatRequestSchema, MAX_BODY_BYTES, type ChatErrorBody } from "@/lib/agent/protocol";
import { clientKey, takeToken } from "@/lib/server/rateLimit";
import { buildCompletionBody, callSarvam } from "@/lib/server/sarvam";

const SSE_HEADERS = { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" };

export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return tooLarge();
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return tooLarge();

  const limit = takeToken(clientKey(request));
  if (!limit.ok) {
    return errorResponse(429, { code: "rate_limited", error: "Too many requests" }, { "retry-after": String(limit.retryAfterSec) });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return errorResponse(400, { code: "bad_request", error: "Body must be JSON" });
  }
  const parsed = ChatRequestSchema.safeParse(json);
  if (!parsed.success) return errorResponse(400, { code: "bad_request", error: z.prettifyError(parsed.error) });

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return errorResponse(500, { code: "not_configured", error: "SARVAM_API_KEY is not set on the server" });

  let upstream: Response;
  try {
    upstream = await callSarvam(buildCompletionBody(parsed.data), apiKey, request.signal);
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return errorResponse(502, { code: "upstream", error: `Could not reach Sarvam: ${error instanceof Error ? error.message : String(error)}` });
  }
  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.text()).slice(0, 500);
    return errorResponse(502, {
      code: "upstream",
      error: detail || `Sarvam returned HTTP ${upstream.status}`,
      upstreamStatus: upstream.status,
    });
  }

  return new Response(upstream.body, { headers: SSE_HEADERS });
}

function errorResponse(status: number, body: ChatErrorBody, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

function tooLarge(): Response {
  return errorResponse(413, { code: "too_large", error: `Request is larger than ${MAX_BODY_BYTES / 1000} KB` });
}