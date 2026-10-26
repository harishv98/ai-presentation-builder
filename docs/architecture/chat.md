# Chat

The prompt box, the transcript, and the chat store. This is where every AI request starts and where its progress and results are shown.

[← Back to the architecture overview](../ARCHITECTURE.md)

## Where it sits in the flow

Step 3 of the [end-to-end flow](../ARCHITECTURE.md#1-end-to-end-flow). `sendPrompt` routes the prompt to [deck generation](deck-generation.md) when the deck is empty, or to the [edit agent](edit-agent.md) otherwise.

## Files

| File | Purpose |
|---|---|
| `components/chat/ChatPanel.tsx` | Transcript above the composer. |
| `components/chat/ChatComposer.tsx` | Prompt box (Enter sends, Shift+Enter is a newline, capped at `MAX_PROMPT_CHARS` = 4000). While a turn runs, Send becomes **Stop**, which calls `stopAgent()`. |
| `components/chat/ChatTranscript.tsx` | Renders each `ChatItem`: user and assistant messages, one line per tool call, notices (with a **Retry** button when they carry a `retryPrompt`), and the generation progress card. |
| `components/generation/EmptyDeck.tsx` | The prompt screen shown on the canvas when the deck is empty. Uses the same `sendPrompt`. |
| `lib/agent/flows/sendPrompt.ts` | The router: `slideOrder.length === 0 ? generateDeck(prompt) : runAgent(prompt)`. |
| `lib/chat/store.ts` | `useChatStore` and helpers (below). |

## `useChatStore`

| Field | Meaning |
|---|---|
| `items` | What the transcript shows. A `ChatItem` is `user`, `assistant`, `tool`, `notice`, or `generation` (a pointer to a generation run). |
| `history` | The model-facing conversation: the last `HISTORY_MESSAGES` (6) user/assistant messages. Tool calls and results are not kept, only each turn's final text. |
| `planThread` | The clarifying-question exchange during [generation](deck-generation.md). Cleared once an outline arrives or on New deck. |
| `recentChanges` | The change summaries of the last 3 edit replies, each with "before" values, so a later reply can revert them. |
| `abort` | The `AbortController` of the running turn. Non-null means a turn is running (`selectRunning`). |
| `draft` | The composer text. |

**Turn lifecycle.** Every flow calls `beginTurn(abort)` first and `endTurn(exchange, changes)` in a `finally`. `beginTurn` is the lock: every entry point returns early if `abort` is already set, so only one AI turn runs at a time. `endTurn` clears the lock and appends the turn to `history` and `recentChanges`.

**Streaming text.** `assistantTextWriter()` returns a function that creates an assistant item on the first text delta and appends to it afterwards. The [tool loop](agent-runtime.md#tool-loop) asks for a new writer at the start of each step, so each step's text becomes its own message.

**Notices.** `pushNotice(tone, text, retryPrompt?)` adds an info or error line. Errors from a request include the original prompt so Retry can resend it.

## Stopping

`stopAgent()` aborts the running turn's controller. The signal is passed to every `fetch("/api/chat")`, so the stream stops, and every flow treats an aborted signal as "stopped", not "failed". Changes already applied are kept and can be undone with one ⌘Z.
