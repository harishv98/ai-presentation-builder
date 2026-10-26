# Streaming client

The browser side of each AI request: the client–server contract, the `fetch` to `/api/chat`, the SSE reader, and the accumulator that rebuilds text and tool calls from streamed deltas.

[← Back to the architecture overview](../ARCHITECTURE.md)

## Where it sits in the flow

Step 6 of the [end-to-end flow](../ARCHITECTURE.md#1-end-to-end-flow). The [agent runtime](agent-runtime.md) and the [plan step](deck-generation.md#plan-step-planoutline) call `streamStep`; it talks to the [chat API](chat-api.md) and reports text and completed tool calls back through callbacks.

## Files

| File | Purpose |
|---|---|
| `lib/agent/protocol.ts` | The contract shared with the server: `ChatRequestSchema`, message and tool-call shapes, `ChatErrorBody`, and limits. |
| `lib/agent/stream/agentRequest.ts` | `streamStep` (one request, streamed to completion), `AgentRequestError`, and `describeError` (user-facing error text). |
| `lib/agent/stream/sse.ts` | `readSseEvents` (SSE line parser) and `createTurnAccumulator`. |

## Protocol

```ts
ChatRequest = {
  mode: "plan" | "populate" | "edit";
  messages: ChatMessage[];   // 1–200 user / assistant / tool messages
  deckSnapshot: string;      // ≤ 150,000 chars
  forcePlan?: boolean;       // plan mode only
}
```

| Limit | Value |
|---|---|
| `MAX_BODY_BYTES` | 200,000 |
| `MAX_PROMPT_CHARS` (per user message) | 4,000 |
| `HISTORY_MESSAGES` (kept between turns) | 6 |
| `MAX_AGENT_STEPS` (edit reply) | 12 |

Errors come back as JSON `{ error, code, upstreamStatus? }` with `code` one of `bad_request`, `too_large`, `rate_limited`, `not_configured`, `upstream`.

## `streamStep(request, step, signal, events)`

1. `POST /api/chat` with the request and the turn's abort signal.
2. On a non-2xx response, throw `AgentRequestError` with the parsed error body and `retry-after`.
3. Feed each SSE event into a turn accumulator.
4. Return `{ text, toolCalls, usage, truncated }`. `truncated` is `finish_reason === "length"`. In development, token usage is logged to the console.

## Turn accumulator

`createTurnAccumulator(step, events)` streams `delta.content` straight to `onText` and rebuilds tool calls alongside it, so text and tool calls stream independently.

**Tool-call assembler.** Rebuilds structured calls from `delta.tool_calls` parts:

- Parts are grouped by `index`. Some providers omit `index` and send `id` only on a call's first part, so a part with an id starts a new call and a bare part continues the open one.
- `onToolArgs(args, index)` fires on every argument delta. The plan step uses this to add slides while `plan_deck` is still streaming.
- `onToolCall(call)` fires as soon as a call is complete (when the next call starts, or at the end of the stream). The tool loop executes each call right away. A call without an id gets `call_<step>_<n>`.

A stream chunk with an `error` field throws and fails the step.

## Error messages

`describeError` maps failures to text shown in chat notices:

| Cause | Message |
|---|---|
| `rate_limited` | "Too many requests. Try again in N seconds." |
| `not_configured` | Add `SARVAM_API_KEY` to `.env.local` and restart. |
| `too_large` | The deck is too large to send to the AI. |
| `upstream` 401 / 403 | Sarvam rejected the API key. |
| `upstream` 402 / 429 | Sarvam refused the request (credits or rate limit). |
| Other `upstream` | "The AI service failed: …" |
| `TypeError` from `fetch` | Network error: could not reach the server. |

## Known gaps

### Streaming and the AI request path

- **Elements appear per tool call, not per token.** Text streams as it arrives, and outline slides appear as soon as each slide object closes, but an element only lands once its whole tool call has arrived. A long table or chart call shows nothing until it completes.
- **The rate limit is per server instance.** `rateLimit.ts` keeps its buckets in memory (40 requests a minute, 400 a day per client IP). On Vercel each instance has its own counts and a cold start resets them, so the limit is a guard against runaway loops, not a quota.
- **No `maxDuration` on `/api/chat`.** One step normally finishes well inside the platform's default function timeout, but a very slow upstream response would be cut off there and surface as a network error.

### Product

- **Export is print-to-PDF only.** Export PDF (or ⌘P) prints one 1600×900 page per slide from the live store, including charts, tables, and images. There is no PPTX export.
- **Speaker notes have no editor.** They are in the schema, the AI can write them through `add_slide` / `update_slide`, and the AI sees them, but there is no manual field to edit them and no present mode to show them.
- **Out of scope for v1:** rotation, element lock (`locked` is reserved in the type only), grouping, present mode, a multi-deck dashboard, and pasting from an external spreadsheet.
- **Persistence.** The deck is saved to IndexedDB in this browser only. Two open tabs overwrite each other, an edit made within 300 ms of a refresh can be lost, and uploaded images are stored as data URLs inside undo entries, so many large images make the history heavy. See [persistence](persistence.md).
- **Undo grouping across manual edits.** A generated deck is one undo step only if the user doesn't edit in between; see [undo grouping](deck-model.md#undo-history).
