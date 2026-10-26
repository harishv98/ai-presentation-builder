# Server API

The two Next.js route handlers. `/api/chat` validates and relays model requests to Sarvam while keeping the API key on the server; `/api/image` resolves image keywords to photos.

[← Back to the architecture overview](../ARCHITECTURE.md)

## Where it sits in the flow

Step 7 of the [end-to-end flow](../ARCHITECTURE.md#1-end-to-end-flow). The [streaming client](streaming.md) posts here once per agent step. The server holds no deck or conversation state: the browser sends everything the model needs in each request.

## Files

| File | Purpose |
|---|---|
| `src/app/api/chat/route.ts` | `POST /api/chat`. |
| `src/app/api/image/route.ts` | `GET /api/image?q=keyword`. |
| `lib/server/sarvam.ts` | `buildCompletionBody` (per-mode system prompt, tools, `tool_choice`, model settings) and `callSarvam`. |
| `lib/server/prompts.ts` | System prompts for `edit`, `plan`, and `populate`. |
| `lib/server/rateLimit.ts` | In-memory per-client rate limit. |
| `.env.example` | `SARVAM_API_KEY` and `SARVAM_MODEL`. Copy to `.env.local`. |

## `POST /api/chat`

Checks run in this order; each failure returns a JSON `ChatErrorBody`:

| Check | Failure |
|---|---|
| Body size (`content-length` header, then actual bytes) ≤ 200 KB | 413 `too_large` |
| Rate limit for the client | 429 `rate_limited` with `retry-after` |
| Body is JSON | 400 `bad_request` |
| Body matches `ChatRequestSchema` | 400 `bad_request` with the prettified Zod error |
| `SARVAM_API_KEY` is set | 500 `not_configured` |
| Sarvam is reachable | 502 `upstream` (or 499 if the client aborted) |
| Sarvam returns 2xx with a body | 502 `upstream` with the upstream status and first 500 chars of its body |

On success, Sarvam's SSE body is returned as is with `content-type: text/event-stream`. The server doesn't parse or buffer the stream. The browser's abort signal is passed to the upstream `fetch`, so pressing Stop also cancels the Sarvam request.

## Completion body (`buildCompletionBody`)

| Field | Value |
|---|---|
| `model` | `SARVAM_MODEL`, default `sarvam-105b` |
| `messages` | The mode's system prompt (with the deck snapshot embedded) followed by the request's messages |
| `tools` | The mode's tools as OpenAI JSON Schema (from `lib/agent/tools`) |
| `tool_choice` | `auto` for edit and plan, `required` for populate, `{ function: plan_deck }` when `forcePlan` is set |
| `max_tokens`, `temperature` | 3000, 0.2 |
| `reasoning_effort` | `low` for reasoning models (`sarvam-105b`, `glm5.3`, `deepseekv4.1-flash`) |
| `stream`, `stream_options` | `true`, `{ include_usage: true }` |

With `forcePlan`, the plan prompt also gets "You have asked enough questions. Call plan_deck now…".

## System prompts

| Mode | Gist |
|---|---|
| `edit` | The snapshot is the only truth about the current deck. Make targeted changes with update tools; don't delete and re-create. Omit `box` when adding so the editor places it. Fix overlaps in the same reply. Revert using the "before" values in recent changes. Don't claim a change unless a tool succeeded. Ask one short question if the request is ambiguous. Suggest New deck for a different topic. Finish with one short sentence. |
| `plan` | Ask up to 4 short questions if key details are missing, otherwise call `plan_deck` once. 5–7 slides by default; slide 1 uses the title layout; decks of 5+ slides include a chart and a table. Rules for layouts, visuals, and intents. |
| `populate` | Fill only the marked slide, in one round of tool calls, at most three elements, never passing `box`. Content rules per layout, plus limits for bullets, charts, and tables. Reply only with tool calls. |

## Rate limit

`takeToken(clientKey(request))` keeps a bucket per client, keyed by the first `x-forwarded-for` address, then `x-real-ip`, then `"local"`. Limits are 40 requests per minute (sliding window) and 400 per day. Buckets are in process memory, so they reset on restart and aren't shared across server instances. Stale buckets are swept once there are 5,000.

## `GET /api/image?q=keyword`

The AI's image elements use `/api/image?q=<keyword>` as their `src` (`stockImageUrl` in `placement.ts`).

1. Search Wikimedia Commons for bitmap files matching the keyword (5 s timeout) and take the first result with an `https` thumbnail at 1200 px wide.
2. Found: 302 redirect to it, cacheable for a day.
3. Not found or failed: 302 to a picsum.photos image seeded by the keyword, `no-store`.
