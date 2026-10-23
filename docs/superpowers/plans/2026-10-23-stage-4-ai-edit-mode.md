# Stage 4: AI Edit Mode — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Automated tests are deferred to stage 9 (design doc D14); each task ends with a manual check instead.

**Goal:** The user types a request in the chat panel ("make slide 2 more concise", "switch the revenue chart to a line chart") and the AI changes only the targeted slides and elements through tool calls. Changes appear on the canvas as each tool call lands, the touched elements pulse, and one ⌘Z reverts the whole reply.

**Architecture:** `/api/chat` is a thin proxy that adds the system prompt, tool definitions, model, and limits, then streams Sarvam's SSE back unchanged (D4, D5). The agent loop runs in the browser: it sends a fresh compact deck snapshot each step, parses the stream, runs each tool call against the live store through `applyOps` with one `txnId` per reply, and sends the tool results back until the model answers without tools. Tools are zod-defined objects shared by the server (as JSON Schema) and the client (for validation and execution); they only produce existing deck ops.

**Tech Stack:** Next.js 16 route handler (Web `Request`/`Response`), React 19, TypeScript 6, Zustand 5, Immer 11, zod 4 (`z.toJSONSchema`, `z.prettifyError`). Sarvam `POST https://api.sarvam.ai/v2/chat/completions`, model `sarvam-105b` (D2). No new npm dependencies.

## Global Constraints

- Every deck mutation goes through `applyOps`. AI tools write with `{ source: "ai", label: "AI: <prompt>", txnId }`; one reply = one `txnId`.
- `SARVAM_API_KEY` is only read on the server from `process.env`. The client never chooses the model, tools, system prompt, or `max_tokens`.
- The AI sees deck state only through `serializeForAI`, rebuilt before every request. Uploaded image data URLs are never sent.
- Tool failures never throw into the UI: they become `{ ok: false, error }` tool results for the model and an amber receipt in the chat.
- Chat state (messages, running flag, highlights) is UI state: not in undo history, not persisted.
- Keyboard shortcuts stay ignored while focus is in the chat textarea (existing `isEditableTarget` check).
- Requests cost Sarvam credits: keep tool descriptions short, send at most the last 6 messages of earlier turns, cap `max_tokens` at 1500.
- `next dev` must run with `NODE_USE_SYSTEM_CA=1` exported (D15) or calls to Sarvam fail behind Zscaler.
- No automated tests in this stage (D14).

## Decisions introduced in this stage (to confirm)

| # | Decision | Why |
|---|----------|-----|
| S4-a | 17 tools: slides `add_slide`, `update_slide`, `delete_slide`, `reorder_slides`, `duplicate_slide`, `change_layout`; elements `add_element` (text, image, shape), `update_element`, `delete_element`, `move_element`, `resize_element`, `reorder_elements`; charts `add_chart`, `update_chart_data`, `change_chart_type`; tables `add_table`, `update_table` (whole rows or single cells). All map onto existing ops; no new deck ops | Covers the spec's tool list. Cell-level `update_table` keeps table edits a targeted patch |
| S4-b | A tool can apply several ops and returns new ids to the model (e.g. `add_slide` → `{ slideId, titleElementId }`), so the model can keep working on what it created in the same reply | The model needs ids it just created; returning them avoids an extra round trip |
| S4-c | `add_slide` with a non-blank layout also adds a title text box (centered and large for `title`/`section`, top band otherwise). Manual "+ New" stays blank (S3-d) | An AI-added slide that shows nothing on the canvas looks broken and costs another tool call |
| S4-d | When an add tool omits `box`, the editor places it: titles go in the top band; everything else goes in the first of these slots with the least overlap: full body, right half, left half, bottom strip. This minimal layout helper moves here from stage 5 | "Add a bar chart of …" needs a sensible position; models guess coordinates badly |
| S4-e | The snapshot is compact text, one line per slide and element (id, type, box, style, text, chart data, table rows), not JSON. Each text element is clipped to 600 characters, each table to 20 rows, notes to 120; uploaded images show as `src=uploaded`. It names the current slide | About 3–4× fewer tokens than JSON while keeping the ids, positions, and content the model needs to patch |
| S4-f | Context: earlier replies are sent as plain user/assistant text only (last 6 messages); the current reply is sent in full (assistant tool calls + tool results) | Keeps requests small and avoids sending tool results without the assistant message that called them |
| S4-g | Each tool call is applied as soon as it has finished streaming (the next call starts or the stream ends), not after the whole reply | Changes land progressively, as the spec's streaming requirement asks |
| S4-h | The canvas follows the AI: after each successful tool call the editor shows the slide it touched, unless the user is dragging an element, drawing a marquee, dragging a slide, or renaming. Touched elements get an emerald pulse outline on the canvas for 1.5 s; the touched slide's thumbnail pulses too | The user sees each patch land. Emerald keeps it distinct from the indigo selection |
| S4-i | Proxy guards: 40 requests/min and 400/day per IP (the design said 20/300), 200 KB body, zod-validated body (no `system` messages from the client), `max_tokens` 1500, temperature 0.2. Stop aborts the upstream request | One reply can take up to 12 requests, and stage 5's populate sends about 8 at once; 20/min would block normal use |
| S4-j | Dev replay is server-side: `AGENT_RECORD=1` saves each Sarvam stream to `fixtures/agent/<prompt-slug>.step<N>.sse`; `AGENT_REPLAY=1` serves those files (one event every ~30 ms) instead of calling Sarvam. The client is unchanged. Replaces `NEXT_PUBLIC_AGENT_REPLAY` from the design | The proxy is the only thing that talks to Sarvam, so swapping it there keeps the whole client path real. Fixtures assume the sample deck freshly loaded (ids match) |
| S4-k | Undo is not locked while the AI runs; the next snapshot reflects it. If the user edits by hand mid-reply, the reply splits into two undo steps around the manual edit | Locking would be surprising; splitting keeps the history in the order things happened |
| S4-l | One reply at a time; Send becomes Stop while running. Clicking an example prompt fills the input instead of sending it | Prevents interleaved replies; examples don't spend credits by accident |
| S4-m | Only `mode: "edit"` exists in this stage. On an empty deck the AI can still add slides with tools; plan → populate is stage 5 | Stage 5 adds the other modes on the same route |

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/agent/protocol.ts` | Request/message zod schemas and types shared by route and client; limits |
| `src/lib/agent/snapshot.ts` | `serializeForAI(deck, currentSlideId)`, `clip()` |
| `src/lib/agent/placement.ts` | Default text styles, title box, `placeBox` slot finder, stock image URL |
| `src/lib/agent/tools/shared.ts` | `defineTool`, `ToolContext`, `ToolOutcome`, arg schemas, small helpers |
| `src/lib/agent/tools/slideTools.ts` | 6 slide tools |
| `src/lib/agent/tools/elementTools.ts` | 6 element tools |
| `src/lib/agent/tools/chartTableTools.ts` | 3 chart tools, 2 table tools |
| `src/lib/agent/tools/index.ts` | Registry, `findTool`, `toOpenAiTools` |
| `src/lib/agent/executeTool.ts` | Parse → validate → run one tool call against the deck store |
| `src/lib/agent/devtools.ts` | Dev-only `window.agent` console helpers |
| `src/lib/server/prompts.ts` | Edit-mode system prompt |
| `src/lib/server/rateLimit.ts` | In-memory per-IP minute/day limits |
| `src/lib/server/sarvam.ts` | Build the completion body, call Sarvam |
| `src/lib/server/replay.ts` | Record / replay SSE fixtures |
| `src/app/api/chat/route.ts` | The proxy route |
| `src/lib/agent/sse.ts` | SSE line reader, tool-call accumulator |
| `src/lib/agent/runAgent.ts` | Client agent loop, error messages, stop |
| `src/lib/agent/reveal.ts` | Pulse touched ids and follow the AI's slide |
| `src/lib/chat/store.ts` | Chat items, compact history, draft, abort controller |
| `src/lib/ui/store.ts` (modify) | `aiHighlights`, `flashAiHighlights` |
| `src/components/chat/ChatPanel.tsx`, `ChatTranscript.tsx`, `ChatComposer.tsx` | Chat UI |
| `src/components/canvas/AiHighlightOverlay.tsx` | Pulse outlines on the canvas |
| `src/components/canvas/CanvasStage.tsx`, `filmstrip/SlideThumbnail.tsx`, `shell/EditorShell.tsx`, `app/globals.css` (modify) | Wire in overlay, thumbnail pulse, chat panel, keyframes |
| `.env.example` (modify), `fixtures/agent/*.sse` | Replay flags, recorded fixtures |

Sample-deck ids used in checks below: s1 (e6 title, e7 subtitle, e8 bar), s2 "Q3 Highlights" (e9 title, e10 bullets, e11 image), s3 "Revenue by Quarter" (e12 title, e13 chart), s4 "Plan Comparison" (e14 title, e15 table), s5 "Next Steps" (e16 title, e17 bullets, e18 ellipse). `nextId` starts at 19.

---

### Task 1: Tool layer, snapshot, and placement

**Files:**

- Create: `src/lib/agent/protocol.ts`, `src/lib/agent/snapshot.ts`, `src/lib/agent/placement.ts`, `src/lib/agent/tools/shared.ts`, `src/lib/agent/tools/slideTools.ts`, `src/lib/agent/tools/elementTools.ts`, `src/lib/agent/tools/chartTableTools.ts`, `src/lib/agent/tools/index.ts`, `src/lib/agent/executeTool.ts`, `src/lib/agent/devtools.ts`
- Modify: `src/components/shell/EditorShell.tsx` (side-effect import of devtools)

**Interfaces:**

- Consumes: `applyOps`, `Op`, `OpResult`, `NewElement`, `ElementPatch` from `@/lib/deck/ops`; schemas/types from `@/lib/deck/schema`.
- Produces:
  - `protocol.ts`: `MAX_AGENT_STEPS = 12`, `MAX_BODY_BYTES = 200_000`, `HISTORY_MESSAGES = 6`, `MAX_PROMPT_CHARS = 4000`, `ChatMessageSchema`, `ChatRequestSchema`, types `ChatMessage`, `ToolCall`, `ChatRequest`, `ChatErrorBody`
  - `serializeForAI(deck: Deck, currentSlideId: string | null): string`, `clip(text: string, max: number): string`
  - `placeBox(deck, slideId, zone: "title" | "body"): Box`, `titleElement(title, layout): NewElement`, `textStyle(role, overrides?): TextStyle`, `stockImageUrl(keyword): string`
  - `type ToolContext = { deck: () => Deck; apply: (ops: Op[]) => OpResult[] }`
  - `type ToolOutcome = { ok: true; summary: string; touched: string[]; data?: Record<string, unknown> } | { ok: false; error: string }`
  - `type AgentTool = { name; description; args: z.ZodType; execute(rawArgs: unknown, ctx: ToolContext): ToolOutcome }`
  - `AGENT_TOOLS: AgentTool[]`, `findTool(name): AgentTool | undefined`, `toOpenAiTools(): OpenAiTool[]`
  - `type ToolExecution = { callId: string; name: string; ok: boolean; summary: string; touched: string[]; content: string }`
  - `executeToolCall(call: ToolCall, meta: { txnId: string; label: string }): ToolExecution`

- [ ] **Step 1: Protocol** — `src/lib/agent/protocol.ts`

```ts
import { z } from "zod";

export const MAX_AGENT_STEPS = 12;
export const MAX_BODY_BYTES = 200_000;
export const HISTORY_MESSAGES = 6;
export const MAX_PROMPT_CHARS = 4000;

const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

export const ChatMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().min(1).max(MAX_PROMPT_CHARS) }),
  z.object({ role: z.literal("assistant"), content: z.string().nullable(), tool_calls: z.array(ToolCallSchema).optional() }),
  z.object({ role: z.literal("tool"), tool_call_id: z.string(), content: z.string() }),
]);

export const ChatRequestSchema = z.object({
  mode: z.literal("edit"),
  messages: z.array(ChatMessageSchema).min(1).max(200),
  deckSnapshot: z.string().max(150_000),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export type ChatErrorBody = {
  error: string;
  code: "bad_request" | "too_large" | "rate_limited" | "not_configured" | "upstream";
  upstreamStatus?: number;
};
```

- [ ] **Step 2: Snapshot** (S4-e) — `src/lib/agent/snapshot.ts`

```ts
import type { Deck, Element } from "@/lib/deck/schema";

const TEXT_LIMIT = 600;
const TABLE_ROW_LIMIT = 20;
const NOTES_LIMIT = 120;

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function serializeForAI(deck: Deck, currentSlideId: string | null): string {
  const lines = [
    `Deck "${deck.title}", ${deck.slideOrder.length} slides, artboard 1600x900, current slide: ${currentSlideId ?? "none"}`,
  ];
  deck.slideOrder.forEach((slideId, index) => {
    const slide = deck.slides[slideId];
    if (!slide) return;
    const notes = slide.notes ? ` notes=${JSON.stringify(clip(slide.notes, NOTES_LIMIT))}` : "";
    lines.push(`[${index + 1}] ${slide.id} ${JSON.stringify(slide.title)} layout=${slide.layout} bg=${slide.background.color}${notes}`);
    for (const id of slide.elementOrder) {
      const element = deck.elements[id];
      if (element) lines.push(`  ${describeElement(element)}`);
    }
  });
  return lines.join("\n");
}

function describeElement(element: Element): string {
  const { x, y, w, h } = element.box;
  const at = `@${x},${y} ${w}x${h}`;
  switch (element.type) {
    case "text": {
      const { role, content, style } = element.text;
      const flags = [`size=${style.fontSize}`, style.bold && "bold", style.italic && "italic", style.align, style.color]
        .filter(Boolean)
        .join(" ");
      return `${element.id} text/${role} ${at} ${flags} ${JSON.stringify(clipParagraphs(content))}`;
    }
    case "image": {
      const src = element.image.src.startsWith("data:") ? "uploaded" : element.image.src;
      return `${element.id} image ${at} alt=${JSON.stringify(element.image.alt)} src=${src}`;
    }
    case "chart": {
      const c = element.chart;
      const series = c.series.map((s) => `${s.name}=${JSON.stringify(s.data)}`).join("; ");
      const axes = [c.xLabel && `x=${JSON.stringify(c.xLabel)}`, c.yLabel && `y=${JSON.stringify(c.yLabel)}`].filter(Boolean).join(" ");
      return `${element.id} chart/${c.kind} ${at} title=${JSON.stringify(c.title)} categories=${JSON.stringify(c.categories)} series: ${series} legend=${c.showLegend} ${axes}`.trimEnd();
    }
    case "table": {
      const { rows, headerRow } = element.table;
      const shown = rows.slice(0, TABLE_ROW_LIMIT);
      const more = rows.length > shown.length ? ` (+${rows.length - shown.length} more rows)` : "";
      return `${element.id} table ${at} header=${headerRow} rows=${JSON.stringify(shown)}${more}`;
    }
    case "shape":
      return `${element.id} shape/${element.shape.kind} ${at} fill=${element.shape.fill}`;
  }
}

function clipParagraphs(content: string[]): string[] {
  const out: string[] = [];
  let budget = TEXT_LIMIT;
  for (const paragraph of content) {
    if (budget <= 0) break;
    out.push(clip(paragraph, budget));
    budget -= paragraph.length;
  }
  return out;
}
```

- [ ] **Step 3: Placement** (S4-c, S4-d) — `src/lib/agent/placement.ts`

```ts
import type { NewElement } from "@/lib/deck/ops";
import type { Box, Deck, SlideLayout, TextPayload, TextStyle } from "@/lib/deck/schema";

const INK = "#0f172a";
const BODY_TEXT = "#334155";

const TITLE_BAND: Box = { x: 80, y: 60, w: 1440, h: 120 };
const HERO_TITLE: Box = { x: 160, y: 300, w: 1280, h: 160 };
const BODY_SLOTS: Box[] = [
  { x: 80, y: 220, w: 1440, h: 620 },
  { x: 840, y: 220, w: 680, h: 620 },
  { x: 80, y: 220, w: 680, h: 620 },
  { x: 80, y: 560, w: 1440, h: 280 },
];

const ROLE_STYLE: Record<TextPayload["role"], Partial<TextStyle>> = {
  title: { fontSize: 60, bold: true, color: INK },
  subtitle: { fontSize: 32 },
  body: { fontSize: 28 },
  bullets: { fontSize: 30 },
};

export function textStyle(role: TextPayload["role"], overrides: Partial<TextStyle> = {}): TextStyle {
  return { fontSize: 34, bold: false, italic: false, align: "left", color: BODY_TEXT, ...ROLE_STYLE[role], ...overrides };
}

export function titleElement(title: string, layout: SlideLayout): NewElement {
  const hero = layout === "title" || layout === "section";
  return {
    type: "text",
    box: hero ? HERO_TITLE : TITLE_BAND,
    text: { role: "title", content: [title], style: textStyle("title", hero ? { fontSize: 88, align: "center" } : {}) },
  };
}

export function placeBox(deck: Deck, slideId: string, zone: "title" | "body"): Box {
  if (zone === "title") return TITLE_BAND;
  const taken = (deck.slides[slideId]?.elementOrder ?? []).flatMap((id) => {
    const element = deck.elements[id];
    return element ? [element.box] : [];
  });
  let best = BODY_SLOTS[0]!;
  let bestOverlap = Infinity;
  for (const slot of BODY_SLOTS) {
    const overlap = taken.reduce((sum, box) => sum + overlapArea(slot, box), 0);
    if (overlap < bestOverlap) {
      best = slot;
      bestOverlap = overlap;
    }
    if (overlap === 0) break;
  }
  return best;
}

export function stockImageUrl(keyword: string): string {
  const seed = keyword.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "slide";
  return `https://picsum.photos/seed/${seed}/800/600`;
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
```

- [ ] **Step 4: Tool plumbing** (S4-b) — `src/lib/agent/tools/shared.ts`

```ts
import { z } from "zod";
import type { Op, OpResult } from "@/lib/deck/ops";
import type { Deck, ElementOf, ElementType } from "@/lib/deck/schema";

export type ToolContext = { deck: () => Deck; apply: (ops: Op[]) => OpResult[] };

export type ToolOutcome =
  | { ok: true; summary: string; touched: string[]; data?: Record<string, unknown> }
  | { ok: false; error: string };

export type AgentTool = {
  name: string;
  description: string;
  args: z.ZodType;
  execute: (rawArgs: unknown, ctx: ToolContext) => ToolOutcome;
};

export function defineTool<S extends z.ZodType>(spec: {
  name: string;
  description: string;
  args: S;
  run: (args: z.infer<S>, ctx: ToolContext) => ToolOutcome;
}): AgentTool {
  return {
    name: spec.name,
    description: spec.description,
    args: spec.args,
    execute(rawArgs, ctx) {
      const parsed = spec.args.safeParse(rawArgs);
      if (!parsed.success) return fail(`Invalid arguments:\n${z.prettifyError(parsed.error)}`);
      return spec.run(parsed.data, ctx);
    },
  };
}

export const fail = (error: string): ToolOutcome => ({ ok: false, error });

export const done = (summary: string, touched: string[], data?: Record<string, unknown>): ToolOutcome =>
  data ? { ok: true, summary, touched, data } : { ok: true, summary, touched };

export function applyOne(ctx: ToolContext, op: Op): OpResult {
  return ctx.apply([op])[0] ?? { ok: false, error: "Operation produced no result" };
}

export function applyCreate(ctx: ToolContext, op: Op): { id: string } | { error: string } {
  const result = applyOne(ctx, op);
  if (!result.ok) return { error: result.error };
  return result.id ? { id: result.id } : { error: "Nothing was created" };
}

export function slideLabel(deck: Deck, slideId: string): string {
  const index = deck.slideOrder.indexOf(slideId);
  return index === -1 ? slideId : `slide ${index + 1}`;
}

export function findElement<T extends ElementType = ElementType>(deck: Deck, id: string, type?: T): ElementOf<T> | string {
  const element = deck.elements[id];
  if (!element) return `Element ${id} not found`;
  if (type && element.type !== type) return `Element ${id} is a ${element.type}, not a ${type}`;
  return element as ElementOf<T>;
}

export const SlideIdArg = z.string().describe("Slide id from the snapshot, e.g. s3");
export const ElementIdArg = z.string().describe("Element id from the snapshot, e.g. e12");

export const BoxArg = z
  .object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
  .describe("Position and size in artboard units (1600x900). Omit to let the editor place it");

export const TextStyleArg = z.object({
  fontSize: z.number().min(8).max(200).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  color: z.string().optional().describe("Hex color, e.g. #0f172a"),
});
```

- [ ] **Step 5: Slide tools** (S4-c) — `src/lib/agent/tools/slideTools.ts`

```ts
import { z } from "zod";
import { SlideLayoutSchema } from "@/lib/deck/schema";
import { titleElement } from "../placement";
import { applyCreate, applyOne, defineTool, done, fail, slideLabel, SlideIdArg } from "./shared";

const addSlide = defineTool({
  name: "add_slide",
  description:
    "Add a slide. Non-blank layouts get a title text box showing the title. Add content afterwards with add_element, add_chart, or add_table.",
  args: z.object({
    title: z.string().min(1).max(120),
    layout: SlideLayoutSchema,
    afterSlideId: SlideIdArg.optional().describe("Insert after this slide. Omit to append at the end"),
    notes: z.string().optional().describe("Speaker notes"),
  }),
  run(args, ctx) {
    const deck = ctx.deck();
    let index: number | undefined;
    if (args.afterSlideId) {
      const at = deck.slideOrder.indexOf(args.afterSlideId);
      if (at === -1) return fail(`Slide ${args.afterSlideId} not found`);
      index = at + 1;
    }
    const slide = applyCreate(ctx, {
      op: "add_slide",
      index,
      slide: { title: args.title, layout: args.layout, notes: args.notes ?? "" },
    });
    if ("error" in slide) return fail(slide.error);

    const data: Record<string, unknown> = { slideId: slide.id };
    const touched = [slide.id];
    if (args.layout !== "blank") {
      const title = applyCreate(ctx, { op: "add_element", slideId: slide.id, element: titleElement(args.title, args.layout) });
      if ("id" in title) {
        data.titleElementId = title.id;
        touched.push(title.id);
      }
    }
    return done(`Added ${slideLabel(ctx.deck(), slide.id)} "${args.title}"`, touched, data);
  },
});

const updateSlide = defineTool({
  name: "update_slide",
  description:
    "Change slide metadata: title (shown in the slide list, not on the slide), speaker notes, background color. To change the visible heading, update the title text element.",
  args: z.object({
    slideId: SlideIdArg,
    title: z.string().min(1).max(120).optional(),
    notes: z.string().optional(),
    backgroundColor: z.string().optional().describe("Hex color"),
  }),
  run({ slideId, backgroundColor, ...rest }, ctx) {
    const patch = { ...rest, ...(backgroundColor && { background: { color: backgroundColor } }) };
    if (Object.keys(patch).length === 0) return fail("Pass at least one of title, notes, backgroundColor");
    const result = applyOne(ctx, { op: "update_slide", id: slideId, patch });
    return result.ok ? done(`Updated ${slideLabel(ctx.deck(), slideId)}`, [slideId]) : fail(result.error);
  },
});

const deleteSlide = defineTool({
  name: "delete_slide",
  description: "Delete a slide and everything on it.",
  args: z.object({ slideId: SlideIdArg }),
  run({ slideId }, ctx) {
    const deck = ctx.deck();
    const slide = deck.slides[slideId];
    if (!slide) return fail(`Slide ${slideId} not found`);
    const label = slideLabel(deck, slideId);
    const result = applyOne(ctx, { op: "delete_slide", id: slideId });
    return result.ok ? done(`Deleted ${label} "${slide.title}"`, []) : fail(result.error);
  },
});

const reorderSlides = defineTool({
  name: "reorder_slides",
  description: "Move a slide to a new position in the deck.",
  args: z.object({
    slideId: SlideIdArg,
    toPosition: z.number().int().min(1).max(500).describe("1-based position, as numbered in the snapshot"),
  }),
  run({ slideId, toPosition }, ctx) {
    const deck = ctx.deck();
    const slide = deck.slides[slideId];
    if (!slide) return fail(`Slide ${slideId} not found`);
    const result = applyOne(ctx, { op: "reorder_slides", id: slideId, toIndex: toPosition - 1 });
    if (!result.ok) return fail(result.error);
    return done(`Moved "${slide.title}" to ${slideLabel(ctx.deck(), slideId)}`, [slideId]);
  },
});

const duplicateSlide = defineTool({
  name: "duplicate_slide",
  description: "Copy a slide with all its elements; the copy is inserted right after it.",
  args: z.object({ slideId: SlideIdArg }),
  run({ slideId }, ctx) {
    const label = slideLabel(ctx.deck(), slideId);
    const copy = applyCreate(ctx, { op: "duplicate_slide", id: slideId });
    if ("error" in copy) return fail(copy.error);
    return done(`Duplicated ${label}`, [copy.id], { slideId: copy.id });
  },
});

const changeLayout = defineTool({
  name: "change_layout",
  description: "Change a slide's layout hint. Elements keep their positions; move or resize them separately if needed.",
  args: z.object({ slideId: SlideIdArg, layout: SlideLayoutSchema }),
  run({ slideId, layout }, ctx) {
    const result = applyOne(ctx, { op: "update_slide", id: slideId, patch: { layout } });
    return result.ok ? done(`Changed ${slideLabel(ctx.deck(), slideId)} layout to ${layout}`, [slideId]) : fail(result.error);
  },
});

export const slideTools = [addSlide, updateSlide, deleteSlide, reorderSlides, duplicateSlide, changeLayout];
```

- [ ] **Step 6: Element tools** — `src/lib/agent/tools/elementTools.ts`

```ts
import { z } from "zod";
import type { ElementPatch, NewElement } from "@/lib/deck/ops";
import { ImagePayloadSchema, ShapePayloadSchema, TextPayloadSchema, type Deck, type ElementType } from "@/lib/deck/schema";
import { placeBox, stockImageUrl, textStyle } from "../placement";
import {
  applyCreate,
  applyOne,
  BoxArg,
  defineTool,
  done,
  ElementIdArg,
  fail,
  findElement,
  slideLabel,
  SlideIdArg,
  TextStyleArg,
} from "./shared";

const TextRoleArg = TextPayloadSchema.shape.role;
const ShapeKindArg = ShapePayloadSchema.shape.kind;

const EDIT_HINT: Record<ElementType, string> = {
  text: "update_element with text",
  image: "update_element with image",
  shape: "update_element with shape",
  chart: "update_chart_data or change_chart_type",
  table: "update_table",
};

const addElementArgs = z.object({
  slideId: SlideIdArg,
  type: z.enum(["text", "image", "shape"]),
  text: z
    .object({
      role: TextRoleArg,
      content: z.array(z.string()).min(1).describe("One string per paragraph or bullet"),
      style: TextStyleArg.optional(),
    })
    .optional()
    .describe("Required when type is text"),
  image: z
    .object({ keyword: z.string().min(1).describe("1-3 words for a stock photo"), alt: z.string() })
    .optional()
    .describe("Required when type is image"),
  shape: z
    .object({ kind: ShapeKindArg, fill: z.string(), stroke: z.string().optional() })
    .optional()
    .describe("Required when type is shape"),
  box: BoxArg.optional(),
});

function buildElement(deck: Deck, args: z.infer<typeof addElementArgs>): NewElement | string {
  switch (args.type) {
    case "text": {
      if (!args.text) return "text is required when type is text";
      const { role, content, style } = args.text;
      const box = args.box ?? placeBox(deck, args.slideId, role === "title" ? "title" : "body");
      return { type: "text", box, text: { role, content, style: textStyle(role, style) } };
    }
    case "image": {
      if (!args.image) return "image is required when type is image";
      const box = args.box ?? placeBox(deck, args.slideId, "body");
      return { type: "image", box, image: { src: stockImageUrl(args.image.keyword), alt: args.image.alt, fit: "cover" } };
    }
    case "shape": {
      if (!args.shape) return "shape is required when type is shape";
      return { type: "shape", box: args.box ?? placeBox(deck, args.slideId, "body"), shape: args.shape };
    }
  }
}

const addElement = defineTool({
  name: "add_element",
  description: "Add a text box, stock image, or shape to a slide. Use add_chart or add_table for charts and tables.",
  args: addElementArgs,
  run(args, ctx) {
    const deck = ctx.deck();
    if (!deck.slides[args.slideId]) return fail(`Slide ${args.slideId} not found`);
    const element = buildElement(deck, args);
    if (typeof element === "string") return fail(element);
    const created = applyCreate(ctx, { op: "add_element", slideId: args.slideId, element });
    if ("error" in created) return fail(created.error);
    return done(`Added ${args.type} to ${slideLabel(deck, args.slideId)}`, [created.id], { elementId: created.id });
  },
});

const updateElementArgs = z.object({
  elementId: ElementIdArg,
  text: z
    .object({
      role: TextRoleArg.optional(),
      content: z.array(z.string()).optional().describe("Replaces all paragraphs/bullets"),
      style: TextStyleArg.optional(),
    })
    .optional(),
  image: z
    .object({
      keyword: z.string().min(1).optional().describe("New stock photo keyword"),
      alt: z.string().optional(),
      fit: ImagePayloadSchema.shape.fit.optional(),
    })
    .optional(),
  shape: z.object({ kind: ShapeKindArg.optional(), fill: z.string().optional(), stroke: z.string().optional() }).optional(),
});

function elementPatch({ text, image, shape }: z.infer<typeof updateElementArgs>): ElementPatch {
  const { keyword, ...imageRest } = image ?? {};
  return {
    ...(text && { text }),
    ...(image && { image: { ...imageRest, ...(keyword && { src: stockImageUrl(keyword) }) } }),
    ...(shape && { shape }),
  };
}

const updateElement = defineTool({
  name: "update_element",
  description:
    "Edit a text, image, or shape element in place. Include only the fields that change. Charts: update_chart_data / change_chart_type. Tables: update_table. Position: move_element / resize_element.",
  args: updateElementArgs,
  run(args, ctx) {
    const deck = ctx.deck();
    const element = findElement(deck, args.elementId);
    if (typeof element === "string") return fail(element);
    const patch = elementPatch(args);
    const keys = Object.keys(patch);
    if (keys.length === 0) return fail("Pass text, image, or shape fields to change");
    if (keys.some((key) => key !== element.type)) {
      return fail(`Element ${element.id} is a ${element.type}; use ${EDIT_HINT[element.type]}`);
    }
    const result = applyOne(ctx, { op: "update_element", id: element.id, patch });
    if (!result.ok) return fail(result.error);
    return done(`Edited ${element.type} ${element.id} on ${slideLabel(deck, element.slideId)}`, [element.id]);
  },
});

const deleteElement = defineTool({
  name: "delete_element",
  description: "Delete an element.",
  args: z.object({ elementId: ElementIdArg }),
  run({ elementId }, ctx) {
    const deck = ctx.deck();
    const element = findElement(deck, elementId);
    if (typeof element === "string") return fail(element);
    const result = applyOne(ctx, { op: "delete_element", id: elementId });
    if (!result.ok) return fail(result.error);
    return done(`Deleted ${element.type} ${elementId} from ${slideLabel(deck, element.slideId)}`, []);
  },
});

const moveElement = defineTool({
  name: "move_element",
  description:
    "Move an element on its slide (x, y) and/or to another slide (toSlideId). copy=true keeps the original and returns the new id. Positions are clamped into the artboard.",
  args: z.object({
    elementId: ElementIdArg,
    toSlideId: SlideIdArg.optional().describe("Destination slide"),
    x: z.number().optional(),
    y: z.number().optional(),
    copy: z.boolean().optional().describe("Copy instead of move"),
  }),
  run(args, ctx) {
    const element = findElement(ctx.deck(), args.elementId);
    if (typeof element === "string") return fail(element);
    if (args.toSlideId === undefined && args.x === undefined && args.y === undefined && !args.copy) {
      return fail("Pass toSlideId and/or x, y");
    }
    const box = { ...(args.x !== undefined && { x: args.x }), ...(args.y !== undefined && { y: args.y }) };
    const moved = applyCreate(ctx, { op: "move_element", id: element.id, toSlideId: args.toSlideId, box, copy: args.copy });
    if ("error" in moved) return fail(moved.error);
    const where = args.toSlideId ? ` to ${slideLabel(ctx.deck(), args.toSlideId)}` : "";
    const verb = args.copy ? "Copied" : "Moved";
    return done(`${verb} ${element.type} ${element.id}${where}`, [moved.id], args.copy ? { elementId: moved.id } : undefined);
  },
});

const resizeElement = defineTool({
  name: "resize_element",
  description: "Set an element's size, and optionally its position. Clamped into the artboard.",
  args: z.object({
    elementId: ElementIdArg,
    w: z.number().positive(),
    h: z.number().positive(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  run({ elementId, w, h, x, y }, ctx) {
    const element = findElement(ctx.deck(), elementId);
    if (typeof element === "string") return fail(element);
    const box = { w, h, ...(x !== undefined && { x }), ...(y !== undefined && { y }) };
    const result = applyOne(ctx, { op: "update_element", id: elementId, patch: { box } });
    return result.ok ? done(`Resized ${element.type} ${elementId}`, [elementId]) : fail(result.error);
  },
});

const Z_VERB = { forward: "Brought %s forward", backward: "Sent %s backward", front: "Brought %s to front", back: "Sent %s to back" };

const reorderElements = defineTool({
  name: "reorder_elements",
  description: "Change an element's stacking order on its slide.",
  args: z.object({
    elementId: ElementIdArg,
    direction: z.enum(["forward", "backward", "front", "back"]).describe("front = on top of everything"),
  }),
  run({ elementId, direction }, ctx) {
    const element = findElement(ctx.deck(), elementId);
    if (typeof element === "string") return fail(element);
    const result = applyOne(ctx, { op: "reorder_element", id: elementId, direction });
    if (!result.ok) return fail(result.error);
    return done(Z_VERB[direction].replace("%s", `${element.type} ${elementId}`), [elementId]);
  },
});

export const elementTools = [addElement, updateElement, deleteElement, moveElement, resizeElement, reorderElements];
```

- [ ] **Step 7: Chart and table tools** — `src/lib/agent/tools/chartTableTools.ts`

```ts
import { z } from "zod";
import { ChartKindSchema } from "@/lib/deck/schema";
import { placeBox } from "../placement";
import { applyCreate, applyOne, BoxArg, defineTool, done, ElementIdArg, fail, findElement, slideLabel, SlideIdArg } from "./shared";

const SeriesArg = z
  .array(z.object({ name: z.string(), data: z.array(z.number()), color: z.string().optional() }))
  .min(1)
  .describe("Each series needs exactly one number per category");

const RowsArg = z.array(z.array(z.string())).min(1).describe("Rows of cell text; the first row is the header when headerRow is true");

function seriesError(categories: string[], series: { name: string; data: number[] }[]): string | null {
  const bad = series.find((s) => s.data.length !== categories.length);
  return bad ? `Series "${bad.name}" has ${bad.data.length} values but there are ${categories.length} categories` : null;
}

function padRows(rows: string[][]): string[][] {
  const width = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => [...row, ...Array<string>(width - row.length).fill("")]);
}

const addChart = defineTool({
  name: "add_chart",
  description: "Add a chart to a slide.",
  args: z.object({
    slideId: SlideIdArg,
    kind: ChartKindSchema,
    title: z.string(),
    categories: z.array(z.string()).min(1),
    series: SeriesArg,
    showLegend: z.boolean().optional().describe("Defaults to true when there are several series"),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    box: BoxArg.optional(),
  }),
  run({ slideId, box, showLegend, ...chart }, ctx) {
    const deck = ctx.deck();
    if (!deck.slides[slideId]) return fail(`Slide ${slideId} not found`);
    const error = seriesError(chart.categories, chart.series);
    if (error) return fail(error);
    const created = applyCreate(ctx, {
      op: "add_element",
      slideId,
      element: {
        type: "chart",
        box: box ?? placeBox(deck, slideId, "body"),
        chart: { ...chart, showLegend: showLegend ?? chart.series.length > 1 },
      },
    });
    if ("error" in created) return fail(created.error);
    return done(`Added ${chart.kind} chart "${chart.title}" to ${slideLabel(deck, slideId)}`, [created.id], { elementId: created.id });
  },
});

const updateChartData = defineTool({
  name: "update_chart_data",
  description:
    "Change a chart's data or labels. categories and series replace the existing arrays entirely. The chart type is kept.",
  args: z.object({
    elementId: ElementIdArg,
    title: z.string().optional(),
    categories: z.array(z.string()).min(1).optional(),
    series: SeriesArg.optional(),
    showLegend: z.boolean().optional(),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
  }),
  run({ elementId, ...patch }, ctx) {
    const element = findElement(ctx.deck(), elementId, "chart");
    if (typeof element === "string") return fail(element);
    if (Object.keys(patch).length === 0) return fail("Pass at least one field to change");
    const error = seriesError(patch.categories ?? element.chart.categories, patch.series ?? element.chart.series);
    if (error) return fail(error);
    const result = applyOne(ctx, { op: "update_element", id: elementId, patch: { chart: patch } });
    return result.ok ? done(`Updated chart ${elementId}`, [elementId]) : fail(result.error);
  },
});

const changeChartType = defineTool({
  name: "change_chart_type",
  description: "Switch a chart to another type. Data is kept.",
  args: z.object({ elementId: ElementIdArg, kind: ChartKindSchema }),
  run({ elementId, kind }, ctx) {
    const element = findElement(ctx.deck(), elementId, "chart");
    if (typeof element === "string") return fail(element);
    if (element.chart.kind === kind) return done(`Chart ${elementId} is already a ${kind} chart`, [elementId]);
    const result = applyOne(ctx, { op: "update_element", id: elementId, patch: { chart: { kind } } });
    return result.ok ? done(`Changed chart ${elementId} to ${kind}`, [elementId]) : fail(result.error);
  },
});

const addTable = defineTool({
  name: "add_table",
  description: "Add a table to a slide. Short rows are padded with empty cells.",
  args: z.object({
    slideId: SlideIdArg,
    rows: RowsArg,
    headerRow: z.boolean().optional().describe("Defaults to true"),
    box: BoxArg.optional(),
  }),
  run({ slideId, rows, headerRow, box }, ctx) {
    const deck = ctx.deck();
    if (!deck.slides[slideId]) return fail(`Slide ${slideId} not found`);
    const table = padRows(rows);
    if ((table[0]?.length ?? 0) === 0) return fail("A table needs at least one cell");
    const created = applyCreate(ctx, {
      op: "add_element",
      slideId,
      element: { type: "table", box: box ?? placeBox(deck, slideId, "body"), table: { rows: table, headerRow: headerRow ?? true } },
    });
    if ("error" in created) return fail(created.error);
    const size = `${table.length}x${table[0]?.length ?? 0}`;
    return done(`Added ${size} table to ${slideLabel(deck, slideId)}`, [created.id], { elementId: created.id });
  },
});

const updateTable = defineTool({
  name: "update_table",
  description: "Edit a table: replace all rows, or change individual cells, and/or toggle the header row.",
  args: z.object({
    elementId: ElementIdArg,
    rows: RowsArg.optional().describe("Replaces the whole table, header row included"),
    cells: z
      .array(z.object({ row: z.number().int().min(0).max(200), col: z.number().int().min(0).max(50), text: z.string() }))
      .optional()
      .describe("Change single cells; row 0 is the first row (the header when present)"),
    headerRow: z.boolean().optional(),
  }),
  run({ elementId, rows: newRows, cells, headerRow }, ctx) {
    const element = findElement(ctx.deck(), elementId, "table");
    if (typeof element === "string") return fail(element);
    if (!newRows && !cells && headerRow === undefined) return fail("Pass rows, cells, or headerRow");

    let rows = newRows ? padRows(newRows) : element.table.rows.map((row) => [...row]);
    if (cells) {
      rows = rows.map((row) => [...row]);
      const width = rows[0]?.length ?? 0;
      for (const cell of cells) {
        const row = rows[cell.row];
        if (!row || cell.col >= row.length) {
          return fail(`Cell (${cell.row}, ${cell.col}) is outside the table (${rows.length} rows, ${width} columns)`);
        }
        row[cell.col] = cell.text;
      }
    }
    const patch = {
      ...((newRows || cells) && { rows }),
      ...(headerRow !== undefined && { headerRow }),
    };
    const result = applyOne(ctx, { op: "update_element", id: elementId, patch: { table: patch } });
    return result.ok ? done(`Updated table ${elementId}`, [elementId]) : fail(result.error);
  },
});

export const chartTableTools = [addChart, updateChartData, changeChartType, addTable, updateTable];
```

- [ ] **Step 8: Registry** — `src/lib/agent/tools/index.ts`

```ts
import { z } from "zod";
import { chartTableTools } from "./chartTableTools";
import { elementTools } from "./elementTools";
import type { AgentTool } from "./shared";
import { slideTools } from "./slideTools";

export type { AgentTool, ToolContext, ToolOutcome } from "./shared";

export type OpenAiTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export const AGENT_TOOLS: AgentTool[] = [...slideTools, ...elementTools, ...chartTableTools];

const BY_NAME = new Map(AGENT_TOOLS.map((tool) => [tool.name, tool]));

export const findTool = (name: string): AgentTool | undefined => BY_NAME.get(name);

export function toOpenAiTools(tools: AgentTool[] = AGENT_TOOLS): OpenAiTool[] {
  return tools.map((tool) => {
    const parameters = z.toJSONSchema(tool.args) as Record<string, unknown>;
    delete parameters.$schema;
    return { type: "function", function: { name: tool.name, description: tool.description, parameters } };
  });
}
```

- [ ] **Step 9: Execute one tool call** (S4-g) — `src/lib/agent/executeTool.ts`

```ts
import type { Op } from "@/lib/deck/ops";
import { useDeckStore } from "@/lib/deck/store";
import type { ToolCall } from "./protocol";
import { findTool, type ToolContext } from "./tools";

export type ToolExecution = {
  callId: string;
  name: string;
  ok: boolean;
  summary: string;
  touched: string[];
  content: string;
};

export function executeToolCall(call: ToolCall, meta: { txnId: string; label: string }): ToolExecution {
  const base = { callId: call.id, name: call.function.name };
  const tool = findTool(call.function.name);
  if (!tool) return failed(base, `Unknown tool ${call.function.name}`);

  let args: unknown;
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch {
    return failed(base, "Arguments are not valid JSON");
  }

  const ctx: ToolContext = {
    deck: () => useDeckStore.getState().deck,
    apply: (ops: Op[]) => useDeckStore.getState().applyOps(ops, { source: "ai", label: meta.label, txnId: meta.txnId }),
  };

  try {
    const outcome = tool.execute(args, ctx);
    if (!outcome.ok) return failed(base, outcome.error);
    return {
      ...base,
      ok: true,
      summary: outcome.summary,
      touched: outcome.touched,
      content: JSON.stringify({ ok: true, ...outcome.data }),
    };
  } catch (error) {
    return failed(base, `Tool crashed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function failed(base: { callId: string; name: string }, error: string): ToolExecution {
  return { ...base, ok: false, summary: error, touched: [], content: JSON.stringify({ ok: false, error }) };
}
```

- [ ] **Step 10: Dev console helpers** — `src/lib/agent/devtools.ts`

```ts
import { useDeckStore } from "@/lib/deck/store";
import { resolveCurrentSlideId, useUiStore } from "@/lib/ui/store";
import { executeToolCall } from "./executeTool";
import { serializeForAI } from "./snapshot";
import { toOpenAiTools } from "./tools";

function snapshot(): string {
  const { deck } = useDeckStore.getState();
  return serializeForAI(deck, resolveCurrentSlideId(deck, useUiStore.getState().currentSlideId));
}

function run(name: string, args: unknown) {
  const call = { id: "console", type: "function" as const, function: { name, arguments: JSON.stringify(args) } };
  return executeToolCall(call, { txnId: crypto.randomUUID(), label: `Tool: ${name}` });
}

const agentDevtools = { snapshot, run, definitions: () => toOpenAiTools() };

declare global {
  interface Window {
    agent?: typeof agentDevtools;
  }
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.agent = agentDevtools;
}
```

In `src/components/shell/EditorShell.tsx` add, after the other imports:

```ts
import "@/lib/agent/devtools";
```

- [ ] **Step 11: Verify** — `npm run typecheck` and `npm run lint` pass. With `npm run dev` running, in the browser console (no credits spent):

```js
console.log(agent.snapshot())
// 5 slides, e.g. "[3] s3 "Revenue by Quarter" layout=chart-forward ..." and
// "  e13 chart/bar @80,220 1440x620 title="Revenue ($M)" categories=["Q1","Q2","Q3","Q4"] series: 2025=[1.2,1.5,1.9,2.4]; ..."
JSON.stringify(agent.definitions()).length            // under ~14000 characters (≈3.5k tokens)
agent.run("change_chart_type", { elementId: "e13", kind: "line" })      // ok, slide 3 chart becomes a line chart
agent.run("update_chart_data", { elementId: "e13", categories: ["Q1", "Q2"] })  // ok:false, 'Series "2025" has 4 values but there are 2 categories'
agent.run("update_element", { elementId: "e13", text: { content: ["x"] } })    // ok:false, "...use update_chart_data or change_chart_type"
agent.run("add_slide", { title: "Pricing", layout: "content", afterSlideId: "s4" })  // ok, data { slideId: "s19", titleElementId: "e20" }; new slide 5 shows a title
agent.run("add_table", { slideId: "s19", rows: [["Plan", "Price"], ["Pro", "$20"], ["Team"]] })  // ok, 3x2 table placed in the body slot
agent.run("update_table", { elementId: "e21", cells: [{ row: 2, col: 1, text: "$45" }] })       // ok, only that cell changes
agent.run("move_element", { elementId: "e13", toSlideId: "s19", copy: true })  // ok, a copy of the chart lands on s19 (overlapping is fine)
agent.run("nope", {})                                  // ok:false, "Unknown tool nope"
```

Each successful call adds an undo entry labelled "Tool: …"; ⌘Z reverts each.

- [ ] **Step 12: Commit** — `git add -A src/lib/agent src/components/shell/EditorShell.tsx && git commit -m "feat(agent): zod tool set, deck snapshot, and placement helper"`

---

### Task 2: Proxy route with guards, record, and replay

**Files:**

- Create: `src/lib/server/prompts.ts`, `src/lib/server/rateLimit.ts`, `src/lib/server/sarvam.ts`, `src/lib/server/replay.ts`, `src/app/api/chat/route.ts`
- Modify: `.env.example`

**Interfaces:**

- Consumes: `ChatRequestSchema`, `ChatRequest`, `ChatMessage`, `ChatErrorBody`, `MAX_BODY_BYTES` (Task 1); `toOpenAiTools()` (Task 1).
- Produces: `POST /api/chat` taking `ChatRequest`, answering `text/event-stream` (Sarvam's OpenAI-style chunks) or JSON `ChatErrorBody` with status 400 / 413 / 429 (+ `retry-after`) / 500 / 502.

- [ ] **Step 1: System prompt** — `src/lib/server/prompts.ts`

```ts
export function editSystemPrompt(snapshot: string): string {
  return `You are the editing assistant inside a slide deck editor. You change the deck only by calling tools.

Rules:
- Make targeted changes. Edit existing elements with the update tools using ids from the snapshot. Never delete and re-create content to change it, and never rebuild slides the user did not ask about.
- Keep the position and size of every element you were not asked to move. When adding an element, omit box so the editor places it, unless the user asked for a specific spot.
- "Slide N" is the slide shown as [N] in the snapshot. "This slide" is the current slide. "The chart" or "the table" is the one on the current slide, or the only one in the deck.
- A slide's title field is metadata. To change the heading people see, update the title text element.
- Chart series need exactly one number per category. Changing chart type keeps the data.
- The artboard is 1600x900, origin top-left. Keep about 80 units of margin.
- If a tool returns an error, fix the arguments and retry, or explain the problem.
- If the request is ambiguous, ask one short question instead of calling tools.
- When finished, reply with one short sentence saying what you changed. Do not mention ids.

Current deck (elements listed back to front; refreshed after every tool round):
${snapshot}`;
}
```

- [ ] **Step 2: Rate limit** (S4-i) — `src/lib/server/rateLimit.ts`

```ts
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export const RATE_LIMITS = { perMinute: 40, perDay: 400 };

type Bucket = { recent: number[]; dayStart: number; dayCount: number };

const buckets = new Map<string, Bucket>();

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

export function takeToken(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  const bucket = buckets.get(key) ?? { recent: [], dayStart: now, dayCount: 0 };
  buckets.set(key, bucket);
  if (now - bucket.dayStart >= DAY_MS) {
    bucket.dayStart = now;
    bucket.dayCount = 0;
  }
  bucket.recent = bucket.recent.filter((t) => now - t < MINUTE_MS);

  if (bucket.dayCount >= RATE_LIMITS.perDay) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.dayStart + DAY_MS - now) / 1000) };
  }
  const oldest = bucket.recent[0];
  if (oldest !== undefined && bucket.recent.length >= RATE_LIMITS.perMinute) {
    return { ok: false, retryAfterSec: Math.ceil((oldest + MINUTE_MS - now) / 1000) };
  }
  bucket.recent.push(now);
  bucket.dayCount += 1;
  return { ok: true };
}
```

- [ ] **Step 3: Sarvam request** — `src/lib/server/sarvam.ts`

```ts
import type { ChatRequest } from "@/lib/agent/protocol";
import { toOpenAiTools } from "@/lib/agent/tools";
import { editSystemPrompt } from "./prompts";

const SARVAM_URL = "https://api.sarvam.ai/v2/chat/completions";
const REASONING_MODELS = new Set(["glm5.3", "deepseekv4.1-flash"]);
const EDIT_MAX_TOKENS = 1500;
const TOOLS = toOpenAiTools();

export function buildCompletionBody(request: ChatRequest) {
  const model = process.env.SARVAM_MODEL || "sarvam-105b";
  return {
    model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: EDIT_MAX_TOKENS,
    temperature: 0.2,
    tool_choice: "auto",
    ...(REASONING_MODELS.has(model) && { reasoning_effort: "low" }),
    messages: [{ role: "system", content: editSystemPrompt(request.deckSnapshot) }, ...request.messages],
    tools: TOOLS,
  };
}

export function callSarvam(body: unknown, apiKey: string, signal: AbortSignal): Promise<Response> {
  return fetch(SARVAM_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "api-subscription-key": apiKey },
    body: JSON.stringify(body),
    signal,
  });
}
```

- [ ] **Step 4: Record and replay** (S4-j) — `src/lib/server/replay.ts`

```ts
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
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "empty";
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
      await writeFile(path.join(FIXTURE_DIR, name), text);
    })
    .catch((error: unknown) => console.warn(`[replay] could not record ${name}`, error));
  return toClient;
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
```

- [ ] **Step 5: Route** (D5, S4-i) — `src/app/api/chat/route.ts`

```ts
import { z } from "zod";
import { ChatRequestSchema, MAX_BODY_BYTES, type ChatErrorBody } from "@/lib/agent/protocol";
import { clientKey, takeToken } from "@/lib/server/rateLimit";
import { fixtureName, recordEnabled, recordStream, replayEnabled, replayResponse, SSE_HEADERS } from "@/lib/server/replay";
import { buildCompletionBody, callSarvam } from "@/lib/server/sarvam";

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

  const name = fixtureName(parsed.data.messages);
  if (replayEnabled()) return replayResponse(name);

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return errorResponse(500, { code: "not_configured", error: "SARVAM_API_KEY is not set on the server" });

  let upstream: Response;
  try {
    upstream = await callSarvam(buildCompletionBody(parsed.data), apiKey, request.signal);
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return errorResponse(502, { code: "upstream", error: `Could not reach Sarvam: ${networkCause(error)}` });
  }
  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.text()).slice(0, 500);
    return errorResponse(502, {
      code: "upstream",
      error: detail || `Sarvam returned HTTP ${upstream.status}`,
      upstreamStatus: upstream.status,
    });
  }

  const body = recordEnabled() ? recordStream(upstream.body, name) : upstream.body;
  return new Response(body, { headers: SSE_HEADERS });
}

function errorResponse(status: number, body: ChatErrorBody, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

function tooLarge(): Response {
  return errorResponse(413, { code: "too_large", error: `Request is larger than ${MAX_BODY_BYTES / 1000} KB` });
}

function networkCause(error: unknown): string {
  const code = error instanceof Error ? (error.cause as { code?: string } | undefined)?.code : undefined;
  if (code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY") return `${code} (start the dev server with NODE_USE_SYSTEM_CA=1)`;
  return code ?? (error instanceof Error ? error.message : String(error));
}
```

- [ ] **Step 6: Env example** — append to `.env.example`:

```bash
# Dev only: save each Sarvam stream to fixtures/agent/ (AGENT_RECORD=1),
# or serve those recordings instead of calling Sarvam (AGENT_REPLAY=1).
AGENT_RECORD=
AGENT_REPLAY=
```

- [ ] **Step 7: Verify the guards** (no credits spent). Restart `npm run dev` (with `NODE_USE_SYSTEM_CA=1`), then:

```bash
# 400: clients cannot send system messages
curl -s -X POST localhost:3000/api/chat -H 'content-type: application/json' \
  -d '{"mode":"edit","messages":[{"role":"system","content":"x"}],"deckSnapshot":""}'
# expect {"code":"bad_request",...}

# 413: body over 200 KB
node -e 'process.stdout.write(JSON.stringify({mode:"edit",messages:[{role:"user",content:"hi"}],deckSnapshot:"a".repeat(210000)}))' \
  | curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/chat -H 'content-type: application/json' --data-binary @-
# expect 413

# 429: the 41st request in a minute (invalid bodies still count, so this is free)
for i in $(seq 1 41); do curl -s -o /dev/null -w '%{http_code} ' -X POST localhost:3000/api/chat -d '{}'; done; echo
# expect forty 400s then 429
```

Restart the dev server to reset the limiter. Then `AGENT_REPLAY=1 npm run dev` and send a valid body:

```bash
curl -sN -X POST localhost:3000/api/chat -H 'content-type: application/json' \
  -d '{"mode":"edit","messages":[{"role":"user","content":"hello"}],"deckSnapshot":"x"}'
# expect a dripped "No recording named hello.step0.sse ..." event and data: [DONE]
```

- [ ] **Step 8: Verify the message format with one real round trip** (one small request). Normal `npm run dev`, then send an assistant tool call with `content: null` followed by its tool result:

```bash
curl -sN -X POST localhost:3000/api/chat -H 'content-type: application/json' -d '{
  "mode":"edit","deckSnapshot":"Deck \"Demo\", 1 slides, artboard 1600x900, current slide: s1\n[1] s1 \"Intro\" layout=title bg=#ffffff",
  "messages":[
    {"role":"user","content":"Rename slide 1 to Hello"},
    {"role":"assistant","content":null,"tool_calls":[{"id":"call_0_0","type":"function","function":{"name":"update_slide","arguments":"{\"slideId\":\"s1\",\"title\":\"Hello\"}"}}]},
    {"role":"tool","tool_call_id":"call_0_0","content":"{\"ok\":true}"}
  ]}'
```

Expected: a stream of `data:` chunks ending in a short text reply ("Renamed slide 1 to Hello.") and `[DONE]`. If Sarvam rejects `content: null`, change `runAgent` (Task 3, Step 3) to send `content: result.text` (an empty string) and make `content` in the assistant schema `z.string()`.

- [ ] **Step 9: Commit** — `git add src/lib/server src/app/api/chat .env.example && git commit -m "feat(api): sarvam chat proxy with guards, record and replay"`

---

### Task 3: Client agent loop and chat store

**Files:**

- Create: `src/lib/agent/sse.ts`, `src/lib/agent/runAgent.ts`, `src/lib/agent/reveal.ts`, `src/lib/chat/store.ts`
- Modify: `src/lib/ui/store.ts`, `src/lib/agent/devtools.ts`

**Interfaces:**

- Consumes: `executeToolCall`, `ToolExecution`, `serializeForAI`, `clip`, protocol types and limits (Task 1); `POST /api/chat` (Task 2); `resolveCurrentSlideId`, `useUiStore` (existing).
- Produces:
  - `readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown>`
  - `createTurnAccumulator(step: number, events: { onText(delta: string): void; onToolCall(call: ToolCall): void })` → `{ push(event: unknown): void; finish(): { text: string; toolCalls: ToolCall[]; usage: unknown } }`
  - `runAgent(prompt: string): Promise<void>`, `stopAgent(): void`
  - `revealAiChanges(ids: string[]): void`
  - UI store: `aiHighlights: Record<string, number>`, `flashAiHighlights(ids: string[]): void`, `AI_HIGHLIGHT_MS = 1500`
  - Chat store: `ChatItem`, `useChatStore` with `items`, `history`, `draft`, `abort`, `setDraft`, `pushItem`, `appendText`, `beginTurn`, `endTurn`; `selectRunning`

- [ ] **Step 1: SSE reader and accumulator** (S4-g) — `src/lib/agent/sse.ts`

```ts
import type { ToolCall } from "./protocol";

type ToolCallDelta = { index?: number; id?: string; function?: { name?: string; arguments?: string } };

type StreamChunk = {
  choices?: { delta?: { content?: string | null; tool_calls?: ToolCallDelta[] }; finish_reason?: string | null }[];
  usage?: unknown;
  error?: { message?: string };
};

export async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
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

export function createTurnAccumulator(
  step: number,
  events: { onText: (delta: string) => void; onToolCall: (call: ToolCall) => void },
) {
  let text = "";
  let usage: unknown;
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
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) return;
      if (delta.content) {
        text += delta.content;
        events.onText(delta.content);
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
        if (part.function?.arguments) call.function.arguments += part.function.arguments;
      }
    },
    finish() {
      closeOpen();
      return { text, toolCalls: calls.filter(Boolean), usage };
    },
  };
}
```

- [ ] **Step 2: Chat store** (S4-f, S4-l) — `src/lib/chat/store.ts`

```ts
import { create } from "zustand";
import { HISTORY_MESSAGES, type ChatMessage } from "@/lib/agent/protocol";

export type ChatItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "tool"; ok: boolean; summary: string }
  | { id: string; kind: "notice"; tone: "info" | "error"; text: string; retryPrompt?: string };

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
export type NewChatItem = WithoutId<ChatItem>;

type ChatState = {
  items: ChatItem[];
  history: ChatMessage[];
  draft: string;
  abort: AbortController | null;
  setDraft: (draft: string) => void;
  pushItem: (item: NewChatItem) => string;
  appendText: (id: string, delta: string) => void;
  beginTurn: (abort: AbortController) => void;
  endTurn: (exchange: ChatMessage[]) => void;
};

let nextItemId = 1;

export const useChatStore = create<ChatState>()((set) => ({
  items: [],
  history: [],
  draft: "",
  abort: null,
  setDraft: (draft) => set({ draft }),
  pushItem(item) {
    const id = `c${nextItemId++}`;
    set((s) => ({ items: [...s.items, { ...item, id } as ChatItem] }));
    return id;
  },
  appendText: (id, delta) =>
    set((s) => ({
      items: s.items.map((item) => (item.id === id && item.kind === "assistant" ? { ...item, text: item.text + delta } : item)),
    })),
  beginTurn: (abort) => set({ abort }),
  endTurn: (exchange) => set((s) => ({ abort: null, history: [...s.history, ...exchange].slice(-HISTORY_MESSAGES) })),
}));

export const selectRunning = (s: ChatState) => s.abort !== null;
```

- [ ] **Step 3: Agent loop** (D4, S4-f, S4-k) — `src/lib/agent/runAgent.ts`

```ts
import { useChatStore } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";
import { resolveCurrentSlideId, useUiStore } from "@/lib/ui/store";
import { executeToolCall, type ToolExecution } from "./executeTool";
import { MAX_AGENT_STEPS, type ChatErrorBody, type ChatMessage, type ChatRequest, type ToolCall } from "./protocol";
import { revealAiChanges } from "./reveal";
import { clip, serializeForAI } from "./snapshot";
import { createTurnAccumulator, readSseEvents } from "./sse";

type TurnMeta = { txnId: string; label: string };
type StepResult = { text: string; toolCalls: ToolCall[]; executions: ToolExecution[] };

class AgentRequestError extends Error {
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

export function stopAgent(): void {
  useChatStore.getState().abort?.abort();
}

export async function runAgent(prompt: string): Promise<void> {
  const text = prompt.trim();
  const chat = useChatStore.getState();
  if (!text || chat.abort) return;

  const abort = new AbortController();
  chat.beginTurn(abort);
  chat.pushItem({ kind: "user", text });
  const meta: TurnMeta = { txnId: crypto.randomUUID(), label: `AI: ${clip(text, 40)}` };
  const turn: ChatMessage[] = [{ role: "user", content: text }];
  let reply = "";

  try {
    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      const result = await runStep(step, [...useChatStore.getState().history, ...turn], abort.signal, meta);
      reply = result.text;
      turn.push({
        role: "assistant",
        content: result.text || null,
        ...(result.toolCalls.length > 0 && { tool_calls: result.toolCalls }),
      });
      for (const execution of result.executions) {
        turn.push({ role: "tool", tool_call_id: execution.callId, content: execution.content });
      }
      if (result.toolCalls.length === 0) return;
    }
    notice("info", `Stopped after ${MAX_AGENT_STEPS} steps. Changes so far are applied; ⌘Z undoes them.`);
  } catch (error) {
    if (abort.signal.aborted) notice("info", "Stopped. Changes made so far are kept; ⌘Z undoes them.");
    else notice("error", describeError(error), text);
  } finally {
    useChatStore.getState().endTurn([
      { role: "user", content: text },
      { role: "assistant", content: reply || "(no reply)" },
    ]);
  }
}

async function runStep(step: number, messages: ChatMessage[], signal: AbortSignal, meta: TurnMeta): Promise<StepResult> {
  const { deck } = useDeckStore.getState();
  const currentSlideId = resolveCurrentSlideId(deck, useUiStore.getState().currentSlideId);
  const request: ChatRequest = { mode: "edit", messages, deckSnapshot: serializeForAI(deck, currentSlideId) };

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

  const executions: ToolExecution[] = [];
  let assistantItemId: string | null = null;
  const accumulator = createTurnAccumulator(step, {
    onText(delta) {
      const chat = useChatStore.getState();
      assistantItemId ??= chat.pushItem({ kind: "assistant", text: "" });
      chat.appendText(assistantItemId, delta);
    },
    onToolCall(call) {
      const execution = executeToolCall(call, meta);
      executions.push(execution);
      useChatStore.getState().pushItem({
        kind: "tool",
        ok: execution.ok,
        summary: execution.ok ? execution.summary : `${call.function.name} failed: ${execution.summary}`,
      });
      if (execution.ok) revealAiChanges(execution.touched);
    },
  });

  for await (const event of readSseEvents(res.body)) accumulator.push(event);
  const { text, toolCalls, usage } = accumulator.finish();
  if (process.env.NODE_ENV !== "production" && usage) console.debug(`[agent] step ${step + 1} usage`, usage);
  return { text, toolCalls, executions };
}

function notice(tone: "info" | "error", text: string, retryPrompt?: string): void {
  useChatStore.getState().pushItem({ kind: "notice", tone, text, ...(retryPrompt && { retryPrompt }) });
}

function describeError(error: unknown): string {
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
```

- [ ] **Step 4: AI highlight state** (S4-h) — in `src/lib/ui/store.ts`

Add to `UiState`:

```ts
  aiHighlights: Record<string, number>;
  flashAiHighlights: (ids: string[]) => void;
```

Above `useUiStore`:

```ts
export const AI_HIGHLIGHT_MS = 1500;
let highlightSeq = 0;
```

Add to the initial state and actions:

```ts
  aiHighlights: {},
  flashAiHighlights(ids) {
    if (ids.length === 0) return;
    const seq = ++highlightSeq;
    set((s) => ({ aiHighlights: { ...s.aiHighlights, ...Object.fromEntries(ids.map((id) => [id, seq])) } }));
    setTimeout(() => {
      set((s) => ({ aiHighlights: Object.fromEntries(Object.entries(s.aiHighlights).filter(([, v]) => v !== seq)) }));
    }, AI_HIGHLIGHT_MS);
  },
```

- [ ] **Step 5: Reveal** (S4-h) — `src/lib/agent/reveal.ts`

```ts
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";

export function revealAiChanges(ids: string[]): void {
  if (ids.length === 0) return;
  const { deck } = useDeckStore.getState();
  const slideIds = ids.map((id) => (deck.slides[id] ? id : deck.elements[id]?.slideId)).filter((id): id is string => !!id);
  const ui = useUiStore.getState();
  ui.flashAiHighlights([...new Set([...ids, ...slideIds])]);

  const target = slideIds.at(-1);
  const busy = ui.dragPreview || ui.marquee || ui.draggingSlideId || ui.renamingSlideId;
  if (target && !busy) ui.goToSlide(target);
}
```

- [ ] **Step 6: Console helpers** — in `src/lib/agent/devtools.ts`, import `runAgent`, `stopAgent` from `./runAgent` and `revealAiChanges` from `./reveal`; make `run` reveal its changes and expose `ask`/`stop`:

```ts
function run(name: string, args: unknown) {
  const call = { id: "console", type: "function" as const, function: { name, arguments: JSON.stringify(args) } };
  const execution = executeToolCall(call, { txnId: crypto.randomUUID(), label: `Tool: ${name}` });
  if (execution.ok) revealAiChanges(execution.touched);
  return execution;
}

const agentDevtools = { snapshot, run, ask: runAgent, stop: stopAgent, definitions: () => toOpenAiTools() };
```

- [ ] **Step 7: Verify** — `npm run typecheck` and `npm run lint` pass. Reload the page; in the console:

```js
agent.run("change_chart_type", { elementId: "e13", kind: "area" })  // canvas jumps to slide 3
await agent.ask("Make slide 2 more concise")   // real request; the chat UI comes in Task 4
```

Expected for `agent.ask`: the editor jumps to slide 2, the bullets (e10) get shorter, title and image keep their boxes, the console logs `[agent] step 1 usage {...}` (and step 2), and the Undo tooltip reads "Undo: AI: Make slide 2 more concise". One ⌘Z restores the original bullets. Run `agent.ask("Switch the revenue chart to a line chart")`, then call `agent.stop()` while it is running: no error is thrown and changes already applied stay.

- [ ] **Step 8: Commit** — `git add src/lib/agent src/lib/chat src/lib/ui/store.ts && git commit -m "feat(agent): client agent loop with streaming tool calls and one undo step per reply"`

---

### Task 4: Chat panel and AI highlights

**Files:**

- Create: `src/components/chat/ChatPanel.tsx`, `src/components/chat/ChatTranscript.tsx`, `src/components/chat/ChatComposer.tsx`, `src/components/canvas/AiHighlightOverlay.tsx`
- Modify: `src/components/shell/EditorShell.tsx`, `src/components/canvas/CanvasStage.tsx`, `src/components/filmstrip/SlideThumbnail.tsx`, `src/app/globals.css`

**Interfaces:**

- Consumes: `runAgent`, `stopAgent` (Task 3); `useChatStore`, `selectRunning`, `ChatItem` (Task 3); `aiHighlights` (Task 3); `MAX_PROMPT_CHARS` (Task 1).
- Produces: `<ChatPanel />`, `<AiHighlightOverlay slideId />`.

- [ ] **Step 1: Pulse keyframes** — append to `src/app/globals.css`:

```css
@keyframes ai-pulse {
  0% {
    opacity: 1;
    box-shadow: 0 0 0 0 rgb(16 185 129 / 0.6);
  }
  70% {
    opacity: 1;
    box-shadow: 0 0 0 calc(16px / var(--artboard-scale, 1)) rgb(16 185 129 / 0);
  }
  100% {
    opacity: 0;
    box-shadow: 0 0 0 0 rgb(16 185 129 / 0);
  }
}

.ai-pulse {
  outline: calc(2px / var(--artboard-scale, 1)) solid rgb(16 185 129);
  animation: ai-pulse 1.5s ease-out forwards;
}

.ai-pulse-thumb {
  box-shadow: inset 0 0 0 2px rgb(16 185 129);
  animation: ai-pulse-fade 1.5s ease-out forwards;
}

@keyframes ai-pulse-fade {
  0%,
  60% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
```

- [ ] **Step 2: Canvas overlay** — `src/components/canvas/AiHighlightOverlay.tsx`

```tsx
"use client";

import { useShallow } from "zustand/react/shallow";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";

const HIGHLIGHT_Z = 9999;

export function AiHighlightOverlay({ slideId }: { slideId: string }) {
  const highlights = useUiStore((s) => s.aiHighlights);
  const ids = useDeckStore(
    useShallow((s) => (s.deck.slides[slideId]?.elementOrder ?? []).filter((id) => highlights[id] !== undefined)),
  );
  const boxes = useDeckStore(useShallow((s) => ids.map((id) => s.deck.elements[id]?.box)));

  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: HIGHLIGHT_Z }}>
      {ids.map((id, i) => {
        const box = boxes[i];
        if (!box) return null;
        return (
          <div
            key={`${id}-${highlights[id]}`}
            className="ai-pulse absolute rounded-sm"
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          />
        );
      })}
    </div>
  );
}
```

In `src/components/canvas/CanvasStage.tsx`, import it and render it between `SlideRenderer` and `SelectionOverlay`:

```tsx
        <SlideRenderer slideId={slideId} previewBoxes={previewBoxes} />
        <AiHighlightOverlay slideId={slideId} />
        <SelectionOverlay />
```

- [ ] **Step 3: Thumbnail pulse** — in `src/components/filmstrip/SlideThumbnail.tsx`, inside `SlideThumbnail`:

```tsx
  const aiPulse = useUiStore((s) => s.aiHighlights[slideId]);
```

Add `relative` to the artboard button's class list (`className={\`relative block overflow-hidden rounded-sm ...`), and render the pulse after` ` inside the button:

```tsx
            {aiPulse !== undefined && (
              <span key={aiPulse} aria-hidden className="ai-pulse-thumb pointer-events-none absolute inset-0 rounded-sm" />
            )}
```

- [ ] **Step 4: Transcript** (S4-l) — `src/components/chat/ChatTranscript.tsx`

```tsx
"use client";

import { useEffect, useRef } from "react";
import { runAgent } from "@/lib/agent/runAgent";
import { selectRunning, useChatStore, type ChatItem } from "@/lib/chat/store";

const EXAMPLES = [
  "Make slide 2 more concise",
  "Switch the revenue chart to a line chart",
  "Add a 2027 forecast series to the revenue chart",
  "Add a slide about pricing before Next Steps",
];

export function ChatTranscript() {
  const items = useChatStore((s) => s.items);
  const running = useChatStore(selectRunning);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items, running]);

  if (items.length === 0) return <EmptyChat />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4 text-sm">
      {items.map((item) => (
        <ChatRow key={item.id} item={item} running={running} />
      ))}
      {running && items.at(-1)?.kind !== "assistant" && <p className="animate-pulse text-xs text-zinc-400">Thinking…</p>}
      <div ref={endRef} />
    </div>
  );
}

function EmptyChat() {
  const setDraft = useChatStore((s) => s.setDraft);
  return (
    <div className="flex flex-1 flex-col justify-center gap-3 p-6 text-sm text-zinc-500">
      <p>Ask the AI to change this deck. It edits the slides in place, and ⌘Z undoes a whole reply.</p>
      <ul className="flex flex-col gap-1.5">
        {EXAMPLES.map((example) => (
          <li key={example}>
            <button
              type="button"
              onClick={() => {
                setDraft(example);
                document.getElementById("chat-input")?.focus();
              }}
              className="w-full rounded border border-chrome-border px-3 py-2 text-left text-zinc-700 hover:border-accent hover:text-accent"
            >
              {example}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatRow({ item, running }: { item: ChatItem; running: boolean }) {
  switch (item.kind) {
    case "user":
      return <p className="ml-8 self-end rounded-lg bg-accent px-3 py-2 whitespace-pre-wrap text-white">{item.text}</p>;
    case "assistant":
      return <p className="mr-8 whitespace-pre-wrap text-zinc-800">{item.text}</p>;
    case "tool":
      return (
        <p className={`text-xs ${item.ok ? "text-emerald-700" : "text-amber-700"}`}>
          {item.ok ? "✓" : "✗"} {item.summary}
        </p>
      );
    case "notice": {
      const retry = item.retryPrompt;
      return (
        <div className={`rounded px-3 py-2 text-xs ${item.tone === "error" ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-600"}`}>
          <p>{item.text}</p>
          {retry && !running && (
            <button type="button" onClick={() => void runAgent(retry)} className="mt-1 font-medium underline">
              Retry
            </button>
          )}
        </div>
      );
    }
  }
}
```

- [ ] **Step 5: Composer** (S4-l) — `src/components/chat/ChatComposer.tsx`

```tsx
"use client";

import { MAX_PROMPT_CHARS } from "@/lib/agent/protocol";
import { runAgent, stopAgent } from "@/lib/agent/runAgent";
import { selectRunning, useChatStore } from "@/lib/chat/store";

export function ChatComposer() {
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const running = useChatStore(selectRunning);

  function send() {
    if (running || !draft.trim()) return;
    void runAgent(draft);
    setDraft("");
  }

  return (
    <form
      className="flex items-end gap-2 border-t border-chrome-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <textarea
        id="chat-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            send();
          }
        }}
        rows={2}
        maxLength={MAX_PROMPT_CHARS}
        placeholder="Ask the AI to change the deck…"
        className="min-h-10 flex-1 resize-none rounded border border-chrome-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      {running ? (
        <button
          type="button"
          onClick={stopAgent}
          className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
        >
          Stop
        </button>
      ) : (
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      )}
    </form>
  );
}
```

- [ ] **Step 6: Panel and shell** — `src/components/chat/ChatPanel.tsx`

```tsx
"use client";

import { ChatComposer } from "./ChatComposer";
import { ChatTranscript } from "./ChatTranscript";

export function ChatPanel() {
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-chrome-border bg-white">
      <h2 className="border-b border-chrome-border px-4 py-3 text-xs font-medium tracking-wide text-zinc-500 uppercase">
        Chat
      </h2>
      <ChatTranscript />
      <ChatComposer />
    </aside>
  );
}
```

In `src/components/shell/EditorShell.tsx`, replace the placeholder chat `<aside>…</aside>` with `<ChatPanel />` and import it from `@/components/chat/ChatPanel`.

- [ ] **Step 7: Verify** — `npm run typecheck` and `npm run lint` pass; run checklist items 1–9 below.

- [ ] **Step 8: Commit** — `git add src/components src/app/globals.css && git commit -m "feat(chat): chat panel with streaming replies, tool receipts, and AI highlights"`

---

### Task 5: Record fixtures, walk the checklist, update the design doc

**Files:**

- Create: `fixtures/agent/*.sse`
- Modify: `docs/superpowers/specs/2026-10-23-ai-presentation-builder-design.md`

- [ ] **Step 1: Record** — `AGENT_RECORD=1 NODE_USE_SYSTEM_CA=1 npm run dev`. Reload (fresh sample deck) before each prompt and send the four example prompts from the empty chat. Check `fixtures/agent/` has `make-slide-2-more-concise.step0.sse`, `.step1.sse`, and so on.
- [ ] **Step 2: Replay** — restart with `AGENT_REPLAY=1`, reload, send "Make slide 2 more concise": same receipts and result, no Sarvam request (no usage spent on the dashboard).
- [ ] **Step 3: Design doc** — in the design doc: D5 rate limit becomes "40/min, 400/day per IP"; section 5.1 guards likewise; section 5.6 becomes "Dev replay is server-side: `AGENT_RECORD=1` saves Sarvam streams to `fixtures/agent/`, `AGENT_REPLAY=1` serves them instead of calling Sarvam"; section 5.5 notes `update_table` and that the layout helper exists from stage 4.
- [ ] **Step 4:** Run the full checklist below and fix anything that fails. `npm run typecheck` and `npm run lint` are clean.
- [ ] **Step 5: Commit** — `git add fixtures docs && git commit -m "chore(agent): record replay fixtures; docs: stage 4 decisions"` (plus `fix(agent): stage 4 checklist fixes` if anything needed fixing).

---

## Stage 4 manual checklist (for you)

Run `npm run dev` with `NODE_USE_SYSTEM_CA=1` exported and `SARVAM_API_KEY` in `.env.local`; open http://localhost:3000. Reload before each numbered item so the sample deck is fresh. Items 1–7 spend a few credits each; use `AGENT_REPLAY=1` to repeat them for free.

**Chat and patching**

1. The chat panel shows an intro line and four example prompts. Clicking one fills the input without sending. Enter sends; Shift+Enter adds a new line. While typing, Backspace and the arrow keys don't delete elements or switch slides.
2. "Make slide 2 more concise": a "Thinking…" line appears, then a receipt like "✓ Edited text e10 on slide 2", and a one-sentence reply. The canvas jumps to slide 2, the bullets pulse green and are shorter; the title and image are unchanged and in the same place. Hovering Undo shows "Undo: AI: Make slide 2 more concise"; one ⌘Z restores all the original bullets.
3. "Switch the revenue chart to a line chart": slide 3's chart becomes a line chart with the same numbers and the same size and position. Only `change_chart_type` appears in the receipts.
4. "Add a 2027 forecast series to the revenue chart": a third series appears with four values. If the model gets the count wrong, an amber receipt shows the error and the model retries.
5. "Add a slide about pricing before Next Steps": a new slide appears between "Plan Comparison" and "Next Steps" with a title and content (placed in the body, not overlapping the title). Its thumbnail pulses. One ⌘Z removes the slide and its content together.
6. Drag the slide 3 chart to the right and make it smaller by hand, then ask "Make the chart title say Revenue in $M": only the chart title changes, and your new position and size are kept (the AI saw the moved chart).
7. "Move the plan comparison table to the last slide": the table leaves slide 4 and appears on slide 5; the canvas follows it.

**Stop, errors, and concurrency**

8. Send "Rewrite every slide in a more formal tone" and press Stop after the first receipt: the reply stops, a note says changes so far are kept, and one ⌘Z reverts everything the AI did. Send stays disabled while a reply is running.
9. During a reply, drag an element on the canvas: no crash, your move is kept, and undo walks back through the AI changes and your move in order (S4-k).
10. Remove `SARVAM_API_KEY` from `.env.local` and restart: sending shows a red "The server has no SARVAM_API_KEY…" notice with a Retry button. Restore the key, restart, click Retry: it works.
11. The proxy guard curls from Task 2 Step 7 return 400, 413, and finally 429 with a `retry-after` header.

**Replay**

12. `AGENT_REPLAY=1 npm run dev`, reload, send "Make slide 2 more concise": the same receipts and result as item 2 stream in, and no credits are used. An unrecorded prompt replies "No recording named …".
13. `npm run typecheck` and `npm run lint` are clean.
