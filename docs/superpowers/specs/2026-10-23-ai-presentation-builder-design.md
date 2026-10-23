# AI Presentation Builder — Design

Date: 2026-10-23
Source requirements: `spec.md` (assignment brief)

## 1. Goal

A web-based AI presentation builder: prompt → AI plans and populates a 16:9 deck → user refines via chat (targeted tool-call patches) or edits manually on a free-form canvas (select, drag, resize, snap, cross-slide drag, charts, tables, images). Manual and AI edits share one store and one undo history. Built and run locally; deployed on Vercel in the final stage.

## 2. Decisions log

| # | Decision | Chosen | Why |
|---|----------|--------|-----|
| D1 | Framework | Next.js (App Router) + TypeScript, deployed on Vercel | Spec prefers Next.js; API route keeps the key server-side; TS because the schema is the backbone |
| D2 | LLM provider | Sarvam only (`POST https://api.sarvam.ai/v2/chat/completions`, OpenAI-compatible, `tools` + `stream`) | User choice. Start with `sarvam-105b`; spike against `deepseekv4.1-flash` before locking |
| D3 | Credit budget | No fallback provider; conserve credits instead | User choice. Savers: `reasoning_effort: "low"`, compact snapshot + last 6 messages, capped `max_tokens`, dev replay mode |
| D4 | Agent loop location | Client-side loop; `/api/chat` is a thin proxy | One canonical deck; tools always hit live state; mid-turn drags just work; unified undo trivial; no serverless timeout risk |
| D5 | Proxy guards | Per-IP rate limit (in-memory to start), server owns system prompt/tools/model, body size limit (200 KB), agent step cap (12) | Public endpoint spends a fixed, Sarvam-only credit budget |
| D6 | State | Zustand hosting a pure `applyOps` reducer, Immer patches for history | Agent loop needs synchronous `getState()` and return values from ops; selector-scoped re-renders for chart thumbnails; subscriptions outside React |
| D7 | Coordinates | Logical 1600×900 units everywhere; no rotation in v1 | Same meaning on canvas, thumbnails, print, and for the AI |
| D8 | Element DnD on canvas | Hand-rolled Pointer Events + pure `snap()` | Full control of scale, snapping, ghost, Escape-cancel, cross-slide hit-testing |
| D9 | Filmstrip reorder | `dnd-kit` sortable | Solid sortable UX; does not conflict with element drag (different drag origins) |
| D10 | Charts | Recharts with explicit pixel sizes (no `ResponsiveContainer`) | Real library; prints correctly |
| D11 | Export | Print-to-PDF route (`/print`) | Spec allows it; stated in README. PPTX out of scope |
| D12 | Nice-to-haves in scope | Persistence (localStorage/IndexedDB), AI-touched element highlight, keyboard nudging | User choice. Others (themes beyond default, present mode, lock, PPTX) out unless time remains |
| D13 | Text model | Paragraph/bullet arrays with per-element style, `contentEditable` on double-click | Keeps editor and AI edits simple; no rich-text library |
| D14 | Workflow | Work locally; unit tests and deployment deferred to stage 9 | User choice. Each stage until then is verified by the user's manual checklist |

## 3. Schema

All types are defined as zod schemas (single source for TS types, AI tool argument validation, persistence validation, and JSON Schema sent to Sarvam).

```ts
type Deck = {
  id: string; title: string; theme: ThemeId; aspectRatio: '16:9';
  slideOrder: string[];
  slides: Record<string, Slide>;
  elements: Record<string, Element>;
  nextId: number;                       // counter for short ids
};

type Slide = {
  id: string;                           // "s1"
  title: string;
  layout: 'title' | 'content' | 'two-column' | 'comparison' | 'section' | 'chart-forward' | 'blank';
  background: { color: string };
  notes: string;
  elementOrder: string[];               // z-order, back → front
};

type Box = { x: number; y: number; w: number; h: number };   // logical units, artboard 1600×900

type ElementBase = { id: string; slideId: string; box: Box; locked?: false };
type Element = ElementBase & (
  | { type: 'text';  text:  { role: 'title' | 'subtitle' | 'body' | 'bullets'; content: string[]; style: TextStyle } }
  | { type: 'image'; image: { src: string; alt: string; fit: 'cover' | 'contain' } }
  | { type: 'chart'; chart: { kind: 'bar' | 'line' | 'pie' | 'area' | 'stacked-bar'; title: string;
                              categories: string[]; series: { name: string; data: number[]; color?: string }[];
                              showLegend: boolean; xLabel?: string; yLabel?: string } }
  | { type: 'table'; table: { rows: string[][]; headerRow: boolean } }
  | { type: 'shape'; shape: { kind: 'rect' | 'ellipse' | 'line'; fill: string; stroke?: string } }
);

type ThemeId = 'default';               // single theme in v1

type TextStyle = { fontSize: number; bold: boolean; italic: boolean; align: 'left' | 'center' | 'right'; color: string };
```

Rules:
- Elements live in a flat map; cross-slide move = change `slideId` + update both slides' `elementOrder`. Ids are stable across moves.
- Ids are short and human-readable (`s3`, `e12`) from `deck.nextId`.
- Changing chart `kind` never touches data.
- `locked` is reserved in the type only (not implemented in v1).

## 4. Store, operations, history

- `useDeckStore` (Zustand): `{ deck, history: { past: Txn[], future: Txn[] } }`.
- `useUiStore` (Zustand): current slide, selection, drag preview, AI highlights, editing element id, chat state. Never in history.
- `applyOps(ops, meta: { source: 'user' | 'ai'; label: string; txnId?: string }): OpResult[]` is the **only** deck writer.
  - Runs under Immer `produceWithPatches`.
  - Validates ids/payloads; invalid op → `{ ok: false, error }` (never throws). Error text is fed back to the model.
  - Clamps every box into the artboard, scaling down oversized boxes proportionally.
  - Generates ids; results return them.
- Op set: `add_slide`, `update_slide`, `delete_slide`, `reorder_slides`, `duplicate_slide`, `add_element`, `update_element`, `move_element` (optional `toSlideId`, `box`, `copy`), `delete_element`, `reorder_element`.
- History: `Txn = { id, label, source, patches, inversePatches }`. Same `txnId` merges into one entry (one AI turn = one undo step). Cap 100. Not persisted.
- Drags/resizes write only `ui.dragPreview` during movement; one transaction is committed on pointer-up. Text edits commit on blur.
- `serializeForAI(deck)`: compact snapshot (slide id/title/layout/order; element id/type/box/truncated text/chart + table data), rebuilt before every request.
- Persistence: debounced subscribe → IndexedDB (falls back to localStorage); zod-validated on load.
- AI highlight: ops with `source: 'ai'` push touched ids into `ui.aiHighlights` for ~1.5 s; canvas shows a pulse outline.

## 5. Agent

### 5.1 Proxy route — `app/api/chat/route.ts`
- Input: `{ mode: 'plan' | 'populate' | 'edit', messages, deckSnapshot, slideId? }`.
- Server attaches system prompt for the mode, tool definitions (from zod), model id, `reasoning_effort: "low"` (reasoning models only), capped `max_tokens`, `stream: true`.
- Guards: per-IP rate limit (20/min, 300/day, in-memory per instance), 200 KB body limit, mode-allowed tool subset.
- Key: `SARVAM_API_KEY` from `process.env` only. `.env.local` git-ignored; `.env.example` committed.
- Streams Sarvam SSE through to the client unchanged.

### 5.2 Client loop — `runAgent(userMessage)`
1. New `txnId`; step counter (max 12).
2. POST messages (last 6) + fresh `serializeForAI(getState().deck)`.
3. Parse SSE: text deltas render live in chat; tool-call deltas accumulate by index.
4. On each complete tool call: zod-validate → `applyOps(..., { source: 'ai', txnId })` → chat shows a one-line receipt; canvas updates + highlights immediately.
5. Append `role: tool` results; loop with a fresh snapshot.
6. Stop when the model replies without tool calls or the cap is hit. A Stop button aborts; applied ops stay and are undoable as one step.

### 5.3 Two-phase generation (empty deck or "new deck" intent)
- **Plan:** `tool_choice` forces one `plan_deck({ title, theme, slides: [{ title, layout, intent }] })`. Skeleton slides appear in the filmstrip immediately.
- **Populate:** one request per slide (`mode: 'populate'`, tools restricted to element/chart/table tools on that slide). Concurrency 2. Slides fill progressively.

### 5.4 Edit mode
- Full slide/element/chart/table tool set. System prompt: never recreate existing content; reference ids; preserve boxes of elements not mentioned.

### 5.5 Tools
- Slides: `add_slide`, `update_slide`, `delete_slide`, `reorder_slides`, `duplicate_slide`, `change_layout`
- Elements: `add_element`, `update_element`, `delete_element`, `move_element`, `resize_element`, `reorder_elements`
- Charts: `add_chart`, `update_chart_data`, `change_chart_type`
- Tables: `add_table`, `update_table`
- Chart/table/resize tools compile down to core ops.
- `box` is optional on adds; a deterministic layout helper places the element into a free slot for the slide's layout (title zone, body, left/right column).
- AI images: `https://picsum.photos/seed/<keyword>/800/600` with descriptive alt text.

### 5.6 Dev replay
- `NEXT_PUBLIC_AGENT_REPLAY=1` replays recorded SSE fixtures instead of calling the proxy, so UI work spends no credits.

## 6. Canvas & drag-and-drop

- `<SlideRenderer slideId scale interactive>` is shared by canvas, thumbnails, and print. 1600×900 div, `transform: scale(s)`, elements absolutely positioned. Thumbnails: non-interactive, no chart animation, memoized element renderers.
- Selection: click, shift-click, marquee on empty canvas. Overlay draws bounding box + 8 handles.
- Editing: double-click text → `contentEditable` (drag suspended), commit on blur. Double-click table cell → edit cell. Charts edited in a side inspector (data grid, type, legend, axis labels).
- In-slide move: pointer capture; `delta / scale` → logical units; pure `snap(moving, others, artboard)` returns snapped box + guides (edges/centers, ~6 screen-px threshold, optional 20-unit grid); group bbox for multi-select; commit on pointer-up; Escape cancels.
- Resize: same pipeline; handle determines edges; Shift keeps aspect; minimum size.
- Cross-slide: leaving the artboard shows a `position: fixed` ghost in a portal; `document.elementsFromPoint` finds `[data-drop-slide-id]` thumbnails; target shows ring + "Move/Copy to slide N"; Alt = copy (new id); drop commits `move_element({ id, toSlideId, copy })` keeping x/y (clamped); drop elsewhere or Escape cancels. Context-menu "Move to slide…" as a supplementary path.
- Filmstrip: `dnd-kit` sortable, vertical, insertion line. Element drags only use thumbnails as hit-test targets, so the two systems never compete.
- Keyboard (disabled while editing text): Delete/Backspace, ⌘D, ⌘Z / ⌘⇧Z, arrows nudge 1 (Shift 20), PageUp/PageDown or arrows with no selection switch slides, ⌘] / ⌘[ z-order.
- Insert toolbar: text, image (file picker → data URL), chart (sample bar), table (3×3), shape. Inserted centered, default size, auto-selected.
- Export: `/print` renders all slides at 1600×900 with `@page { size: 1600px 900px }` and page breaks, then calls `window.print()`.

## 7. Error, empty, and loading states

- Zero slides: empty canvas state with a prompt box and "Add blank slide".
- Chat: empty state with example prompts; streaming indicator; per-tool receipts; inline error with Retry for network/429/5xx; clear message when rate-limited or credits exhausted.
- Tool errors are returned to the model (not shown as crashes); repeated failures stop at the step cap with a visible note.
- Persistence load failure (schema mismatch) → start fresh, keep raw copy under a backup key.

## 8. Testing

- Stages 0–8: verified by the user's manual checklist per stage (below). No automated tests yet (D14).
- Stage 9: Vitest unit tests for pure logic: `applyOps` (each op, clamping, id generation, cross-slide move/copy), history merge/undo/redo, `snap()`, layout helper, `serializeForAI`, SSE tool-call accumulator, zod tool-arg validation.

## 9. Staged roadmap

Each stage ends with: a running app, a manual test checklist for the user, and a short "decisions made in this stage" note. No stage starts until the previous one is accepted.

| Stage | Scope | User can test |
|-------|-------|---------------|
| 0. Foundation | Git init; replace Vite with Next.js + TS; Tailwind; oxlint; `.env.example`; Sarvam tool-calling spike script (one call, verify tool_calls + streaming on `sarvam-105b` vs `deepseekv4.1-flash`) | `npm run dev` shows shell; spike output shows a real tool call |
| 1. Schema + store + render | zod schema, `applyOps`, history, fixture deck; `SlideRenderer` for all element types (charts/tables read-only); filmstrip click-to-navigate; keyboard slide nav | Fixture deck renders with chart + table; click thumbnails |
| 2. Canvas manipulation | Selection, marquee, drag, resize, snapping + guides, multi-select move, delete, duplicate, z-order, nudge, undo/redo | Drag/resize elements with guides; Escape cancels; ⌘Z restores |
| 3. Slide operations | `dnd-kit` filmstrip reorder with insertion line; add blank (after current / at end), delete, duplicate, rename | Reorder by drag; undo reorder |
| 4. AI edit mode | Proxy route + guards; SSE parser; client agent loop; full tool set; tool receipts; AI highlight; replay mode | "Make slide 3 more concise", "switch the chart to a line chart" on the fixture deck patch only the targeted elements; one ⌘Z reverts the turn |
| 5. AI generation | `plan_deck` + populate flow, layout helper, progressive streaming; empty/loading/error states | Prompt a 5–7 slide deck with a chart and a table; watch skeletons then fill |
| 6. Content editing | Inline text editing, table cell editing, chart inspector (data, type, legend, axes), insert toolbar, image upload | Edit chart data, switch type keeps data; insert each element type |
| 7. Cross-slide DnD | Ghost drag to thumbnail, Alt copy, Escape cancel, clamping, context-menu fallback | Drag a chart onto another thumbnail; ask the AI about "the chart" — it knows the new slide |
| 8. Persistence + export | IndexedDB autosave, `/print` export | Refresh keeps deck; print preview shows charts at correct positions |
| 9. Tests + deploy + README | Vitest unit tests (section 8); Vercel deploy; README (setup, architecture, DnD implementation, known gaps); AI transcripts export | `npm test` green; reviewer walkthrough from `spec.md` "What We Will Try" on the deployed URL |

Rationale for order: the store and canvas are the foundation everything writes to; AI edit mode comes before generation because it exercises the full tool set on known data (cheaper to debug, fewer credits); cross-slide DnD comes after inline editing because it reuses the drag pipeline from stage 2.

## 10. Out of scope (v1)

Rotation, element lock, grouping, themes beyond one default, present mode, PPTX export, multi-project dashboard, external spreadsheet paste, auth, backend persistence, multiplayer.
