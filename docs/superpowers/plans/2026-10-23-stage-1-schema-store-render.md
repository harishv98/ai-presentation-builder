# Stage 1: Schema, Store, and Rendering — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Automated tests are deferred to stage 9 (design doc D14); each task ends with a manual check instead.

**Goal:** A sample 5-slide deck lives in one canonical store, renders on the canvas and in the filmstrip from the element schema (text, image, chart, table, shape), and every write goes through `applyOps` with undo/redo.

**Architecture:** zod schemas define the deck. A pure `applyOpsToDeck` reducer (Immer `produceWithPatches`) applies ops and returns results plus patches. A Zustand store hosts the deck and a transaction history built from those patches. A separate UI store holds the current slide. `SlideRenderer` renders any slide at any scale and is shared by canvas and thumbnails.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 6, Tailwind 4, zod 4, Zustand 5, Immer 11, Recharts 3.

## Global Constraints

- Artboard is 1600 × 900 logical units; every `Box` is in those units (D7). No rotation.
- Every deck mutation goes through `applyOps` (design doc section 4). Components never write `deck` directly.
- Ids: `s<n>` for slides, `e<n>` for elements, from one `deck.nextId` counter.
- `applyOps` never throws on bad input; it returns `{ ok: false, error }` per op.
- Every box is clamped into the artboard by the ops layer.
- Charts use Recharts with explicit pixel sizes, no `ResponsiveContainer`, animations off (D10).
- No automated tests in this stage (D14).

## Decisions introduced in this stage (to confirm)

| # | Decision | Why |
|---|----------|-----|
| S1-a | The editor renders client-only (mounted-guard), not server-rendered | Recharts generates SVG ids that can mismatch during hydration; stage 8 loads the deck from IndexedDB, which only exists in the browser anyway |
| S1-b | Undo/redo buttons and ⌘Z / ⌘⇧Z land now, not in stage 2 | Lets you verify history in this stage; costs a few lines |
| S1-c | In development, `window.deckStore` exposes `applyOps`, `undo`, `redo`, `getState` | The only way to exercise ops (clamping, cross-slide move, delete) before the canvas and AI exist. Stripped in production |
| S1-d | Images use plain `<img>`, not `next/image` | Sources are data URLs and arbitrary hosts; `next/image` needs a host allow-list and adds nothing for a canvas |
| S1-e | A slide's `title` field is metadata (filmstrip label, AI context); the visible title is a normal text element | Titles must be draggable/resizable like any element; the AI updates both via tools |

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/deck/constants.ts` (modify) | Artboard size, minimum element size, default palette |
| `src/lib/deck/schema.ts` | zod schemas and inferred types for Deck, Slide, Element, Box, payloads |
| `src/lib/deck/geometry.ts` | `clampBox` |
| `src/lib/deck/ops.ts` | `Op` type, `OpResult`, pure `applyOpsToDeck` |
| `src/lib/deck/history.ts` | `Txn` type, `recordTxn`, `undoTxn`, `redoTxn` (pure) |
| `src/lib/deck/store.ts` | Zustand `useDeckStore`: deck + history, `applyOps`, `undo`, `redo`; dev `window.deckStore` |
| `src/lib/deck/fixture.ts` | Sample "Q3 Product Roadmap" deck |
| `src/lib/ui/store.ts` | Zustand `useUiStore`: `currentSlideId`, `goToSlide`, `goRelative` |
| `src/lib/ui/useCurrentSlideId.ts` | Current slide id that falls back to the first slide if the stored one was deleted |
| `src/components/slide/SlideRenderer.tsx` | Renders one slide (background + elements in z-order) at 1600 × 900 |
| `src/components/slide/ScaledArtboard.tsx` | Wraps a 1600 × 900 child and scales it to a given factor |
| `src/components/slide/elements/*.tsx` | `TextView`, `ImageView`, `ChartView`, `TableView`, `ShapeView`, `ElementView` dispatcher |
| `src/components/canvas/ArtboardViewport.tsx` (modify) | Computes fit scale; renders `ScaledArtboard` |
| `src/components/filmstrip/Filmstrip.tsx` | Thumbnail list, click to navigate, current highlight |
| `src/components/shell/EditorShell.tsx` (modify) | Client-only editor: header (title, undo/redo), filmstrip, canvas, chat placeholder |
| `src/components/shell/useEditorShortcuts.ts` | Slide navigation keys, ⌘Z / ⌘⇧Z |
| `src/components/shell/ClientOnly.tsx` | Mounted guard |

---

### Task 1: Dependencies and schema

**Files:**
- Modify: `package.json` (via npm), `src/lib/deck/constants.ts`, `.oxlintrc.json`
- Create: `src/lib/deck/schema.ts`

**Interfaces:**
- Produces: types `Deck`, `Slide`, `SlideLayout`, `Box`, `Element`, `ElementType`, `TextPayload`, `TextStyle`, `ImagePayload`, `ChartPayload`, `ChartKind`, `TablePayload`, `ShapePayload`; schemas `DeckSchema`, `ElementSchema`, `BoxSchema`, etc.

- [ ] **Step 1: Install**

```bash
npm install zod zustand immer recharts
```

Expected: zod 4.6.x, zustand 5.0.x, immer 11.2.x, recharts 3.10.x added to `dependencies`.

- [ ] **Step 2: Constants**

```ts
// src/lib/deck/constants.ts
export const ARTBOARD_WIDTH = 1600;
export const ARTBOARD_HEIGHT = 900;
export const MIN_ELEMENT_SIZE = 20;
export const CHART_PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
```

- [ ] **Step 3: Schema**

```ts
// src/lib/deck/schema.ts
import { z } from "zod";

export const BoxSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

export const TextStyleSchema = z.object({
  fontSize: z.number().min(8).max(200),
  bold: z.boolean(),
  italic: z.boolean(),
  align: z.enum(["left", "center", "right"]),
  color: z.string(),
});

export const TextPayloadSchema = z.object({
  role: z.enum(["title", "subtitle", "body", "bullets"]),
  content: z.array(z.string()),
  style: TextStyleSchema,
});

export const ImagePayloadSchema = z.object({
  src: z.string(),
  alt: z.string(),
  fit: z.enum(["cover", "contain"]),
});

export const ChartKindSchema = z.enum(["bar", "line", "pie", "area", "stacked-bar"]);
export const ChartPayloadSchema = z.object({
  kind: ChartKindSchema,
  title: z.string(),
  categories: z.array(z.string()),
  series: z.array(z.object({ name: z.string(), data: z.array(z.number()), color: z.string().optional() })),
  showLegend: z.boolean(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
});

export const TablePayloadSchema = z.object({
  rows: z.array(z.array(z.string())),
  headerRow: z.boolean(),
});

export const ShapePayloadSchema = z.object({
  kind: z.enum(["rect", "ellipse", "line"]),
  fill: z.string(),
  stroke: z.string().optional(),
});

const base = { id: z.string(), slideId: z.string(), box: BoxSchema };

export const ElementSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("text"), text: TextPayloadSchema }),
  z.object({ ...base, type: z.literal("image"), image: ImagePayloadSchema }),
  z.object({ ...base, type: z.literal("chart"), chart: ChartPayloadSchema }),
  z.object({ ...base, type: z.literal("table"), table: TablePayloadSchema }),
  z.object({ ...base, type: z.literal("shape"), shape: ShapePayloadSchema }),
]);

export const SlideLayoutSchema = z.enum(["title", "content", "two-column", "comparison", "section", "chart-forward", "blank"]);

export const SlideSchema = z.object({
  id: z.string(),
  title: z.string(),
  layout: SlideLayoutSchema,
  background: z.object({ color: z.string() }),
  notes: z.string(),
  elementOrder: z.array(z.string()),
});

export const DeckSchema = z.object({
  id: z.string(),
  title: z.string(),
  theme: z.literal("default"),
  aspectRatio: z.literal("16:9"),
  slideOrder: z.array(z.string()),
  slides: z.record(z.string(), SlideSchema),
  elements: z.record(z.string(), ElementSchema),
  nextId: z.number().int(),
});

export type Box = z.infer<typeof BoxSchema>;
export type TextStyle = z.infer<typeof TextStyleSchema>;
export type TextPayload = z.infer<typeof TextPayloadSchema>;
export type ImagePayload = z.infer<typeof ImagePayloadSchema>;
export type ChartKind = z.infer<typeof ChartKindSchema>;
export type ChartPayload = z.infer<typeof ChartPayloadSchema>;
export type TablePayload = z.infer<typeof TablePayloadSchema>;
export type ShapePayload = z.infer<typeof ShapePayloadSchema>;
export type Element = z.infer<typeof ElementSchema>;
export type ElementType = Element["type"];
export type SlideLayout = z.infer<typeof SlideLayoutSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type Deck = z.infer<typeof DeckSchema>;

export type ElementOf<T extends ElementType> = Extract<Element, { type: T }>;
```

- [ ] **Step 4: Lint config** — add `"nextjs/no-img-element": "off"` to `.oxlintrc.json` rules (decision S1-d).

- [ ] **Step 5: Verify** — `npm run typecheck` passes.

- [ ] **Step 6: Commit** — `git commit -m "feat(deck): add zod deck schema and dependencies"`

---

### Task 2: Ops reducer and geometry

**Files:**
- Create: `src/lib/deck/geometry.ts`, `src/lib/deck/ops.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `clampBox(box: Box): Box`
  - `type Op` (union below), `type OpResult = { ok: true; id?: string } | { ok: false; error: string }`
  - `applyOpsToDeck(deck: Deck, ops: Op[]): { deck: Deck; results: OpResult[]; patches: Patch[]; inversePatches: Patch[] }`

- [ ] **Step 1: Geometry**

```ts
// src/lib/deck/geometry.ts
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, MIN_ELEMENT_SIZE } from "./constants";
import type { Box } from "./schema";

export function clampBox(box: Box): Box {
  let w = Math.max(box.w, MIN_ELEMENT_SIZE);
  let h = Math.max(box.h, MIN_ELEMENT_SIZE);
  const shrink = Math.min(1, ARTBOARD_WIDTH / w, ARTBOARD_HEIGHT / h);
  w *= shrink;
  h *= shrink;
  const x = Math.min(Math.max(box.x, 0), ARTBOARD_WIDTH - w);
  const y = Math.min(Math.max(box.y, 0), ARTBOARD_HEIGHT - h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}
```

- [ ] **Step 2: Op types**

```ts
// src/lib/deck/ops.ts (types)
export type ElementPatch = {
  box?: Partial<Box>;
  text?: Partial<Omit<TextPayload, "style">> & { style?: Partial<TextStyle> };
  image?: Partial<ImagePayload>;
  chart?: Partial<ChartPayload>;
  table?: Partial<TablePayload>;
  shape?: Partial<ShapePayload>;
};

export type NewElement = DistributiveOmit<Element, "id" | "slideId">;

export type Op =
  | { op: "add_slide"; slide?: Partial<Omit<Slide, "id" | "elementOrder">>; index?: number }
  | { op: "update_slide"; id: string; patch: Partial<Pick<Slide, "title" | "layout" | "background" | "notes">> }
  | { op: "delete_slide"; id: string }
  | { op: "reorder_slides"; id: string; toIndex: number }
  | { op: "duplicate_slide"; id: string }
  | { op: "add_element"; slideId: string; element: NewElement; index?: number }
  | { op: "update_element"; id: string; patch: ElementPatch }
  | { op: "move_element"; id: string; toSlideId?: string; box?: Partial<Box>; copy?: boolean }
  | { op: "delete_element"; id: string }
  | { op: "reorder_element"; id: string; direction: "forward" | "backward" | "front" | "back" };
```

`DistributiveOmit<T, K> = T extends unknown ? Omit<T, K> : never` so `NewElement` stays a discriminated union.

- [ ] **Step 3: Reducer** — `applyOpsToDeck` calls `enablePatches()` once at module load, then `produceWithPatches(deck, draft => { for each op: results.push(applyOne(draft, op)) })`. Each `applyOne` is a `switch` on `op.op`; an op that fails validation returns `{ ok: false, error }` and leaves the draft untouched for that op (earlier ops in the batch stay applied). Behaviour per op:

| Op | Behaviour | Error cases (exact messages) |
|----|-----------|------------------------------|
| `add_slide` | New id `s<nextId++>`; defaults `title: "Untitled"`, `layout: "blank"`, `background: { color: "#ffffff" }`, `notes: ""`, `elementOrder: []`; inserted at `index` (clamped to `[0, length]`) or appended. Returns `{ ok: true, id }` | — |
| `update_slide` | Shallow-merge `patch` | `Slide <id> not found` |
| `delete_slide` | Delete the slide and all of its elements; remove from `slideOrder` | `Slide <id> not found` |
| `reorder_slides` | Move id to `toIndex` (clamped) | `Slide <id> not found` |
| `duplicate_slide` | Deep-copy slide + elements with fresh ids, insert right after; returns new slide id | `Slide <id> not found` |
| `add_element` | New id `e<nextId++>`, `slideId` set, box clamped, inserted into `elementOrder` at `index` or on top; returns id | `Slide <id> not found` |
| `update_element` | `box` merged then clamped; payload key must match element type (`text` patch on a chart → error); `text.style` merged one level deeper; other payload fields shallow-merged | `Element <id> not found`; `Element <id> is a <type>, cannot apply <key> patch` |
| `move_element` | Without `toSlideId` or same slide: merge + clamp box. With another slide: move = change `slideId`, remove from old `elementOrder`, push onto new; copy = deep-copy with new id onto target, original untouched; returns the (new) id | `Element <id> not found`; `Slide <toSlideId> not found` |
| `delete_element` | Remove from map and its slide's `elementOrder` | `Element <id> not found` |
| `reorder_element` | `forward`/`backward` swap with neighbour; `front`/`back` move to end/start of `elementOrder` | `Element <id> not found` |

Helper signatures inside `ops.ts`: `newId(draft: Deck, prefix: "s" | "e"): string`, `cloneElementInto(draft: Deck, el: Element, slideId: string): string`.

- [ ] **Step 4: Verify** — `npm run typecheck` passes.

- [ ] **Step 5: Commit** — `git commit -m "feat(deck): add pure applyOps reducer with clamping"`

---

### Task 3: History and deck store

**Files:**
- Create: `src/lib/deck/history.ts`, `src/lib/deck/store.ts`, `src/lib/deck/fixture.ts`

**Interfaces:**
- Consumes: `applyOpsToDeck`, `Op`, `OpResult`, `Deck`.
- Produces:
  - `type TxnMeta = { source: "user" | "ai"; label: string; txnId?: string }`
  - `type Txn = { id: string; label: string; source: "user" | "ai"; patches: Patch[]; inversePatches: Patch[] }`
  - `useDeckStore` with state `{ deck: Deck; past: Txn[]; future: Txn[] }` and actions `applyOps(ops: Op[], meta: TxnMeta): OpResult[]`, `undo(): void`, `redo(): void`, `canUndo(): boolean`, `canRedo(): boolean`
  - `createSampleDeck(): Deck`

- [ ] **Step 1: History (pure)**

```ts
// src/lib/deck/history.ts
import { applyPatches, type Patch } from "immer";
import type { Deck } from "./schema";

export const HISTORY_LIMIT = 100;

export type TxnMeta = { source: "user" | "ai"; label: string; txnId?: string };
export type Txn = { id: string; label: string; source: "user" | "ai"; patches: Patch[]; inversePatches: Patch[] };

export function recordTxn(past: Txn[], meta: TxnMeta, patches: Patch[], inversePatches: Patch[]): Txn[] {
  if (patches.length === 0) return past;
  const last = past.at(-1);
  if (meta.txnId && last?.id === meta.txnId) {
    const merged: Txn = {
      ...last,
      patches: [...last.patches, ...patches],
      inversePatches: [...inversePatches, ...last.inversePatches],
    };
    return [...past.slice(0, -1), merged];
  }
  const txn: Txn = { id: meta.txnId ?? crypto.randomUUID(), label: meta.label, source: meta.source, patches, inversePatches };
  return [...past, txn].slice(-HISTORY_LIMIT);
}

export const undoTxn = (deck: Deck, txn: Txn): Deck => applyPatches(deck, txn.inversePatches);
export const redoTxn = (deck: Deck, txn: Txn): Deck => applyPatches(deck, txn.patches);
```

- [ ] **Step 2: Store**

```ts
// src/lib/deck/store.ts
"use client";

import { create } from "zustand";
import { createSampleDeck } from "./fixture";
import { recordTxn, redoTxn, undoTxn, type Txn, type TxnMeta } from "./history";
import { applyOpsToDeck, type Op, type OpResult } from "./ops";
import type { Deck } from "./schema";

type DeckState = {
  deck: Deck;
  past: Txn[];
  future: Txn[];
  applyOps: (ops: Op[], meta: TxnMeta) => OpResult[];
  undo: () => void;
  redo: () => void;
};

export const useDeckStore = create<DeckState>()((set, get) => ({
  deck: createSampleDeck(),
  past: [],
  future: [],

  applyOps(ops, meta) {
    const { deck, results, patches, inversePatches } = applyOpsToDeck(get().deck, ops);
    if (patches.length > 0) {
      set((s) => ({ deck, past: recordTxn(s.past, meta, patches, inversePatches), future: [] }));
    }
    return results;
  },

  undo() {
    const { past, future, deck } = get();
    const txn = past.at(-1);
    if (!txn) return;
    set({ deck: undoTxn(deck, txn), past: past.slice(0, -1), future: [...future, txn] });
  },

  redo() {
    const { past, future, deck } = get();
    const txn = future.at(-1);
    if (!txn) return;
    set({ deck: redoTxn(deck, txn), past: [...past, txn], future: future.slice(0, -1) });
  },
}));

declare global {
  interface Window {
    deckStore?: typeof useDeckStore;
  }
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.deckStore = useDeckStore;
}
```

In the console, `deckStore.getState().applyOps(...)`, `deckStore.getState().undo()`, and `deckStore.getState().deck` are available.

- [ ] **Step 3: Sample deck** — `createSampleDeck()` builds the deck by calling `applyOpsToDeck` on an empty deck (`slideOrder: []`, `nextId: 1`), so the sample uses the same code path and the same ids every load. Content ("Q3 Product Roadmap"):

| Slide | Layout | Elements |
|-------|--------|----------|
| s1 | title | title text "Q3 Product Roadmap" (centered, 88 px, bold), subtitle "Planning review · October 2026", accent rect shape bar |
| s2 | content | title "Q3 Highlights", bullets (4 lines), image (`https://picsum.photos/seed/roadmap/800/600`, cover) on the right |
| s3 | chart-forward | title "Revenue by Quarter", bar chart: categories Q1–Q4, series "2025" [1.2, 1.5, 1.9, 2.4] and "2026" [1.6, 2.1, 2.6, 3.1], y label "$M", legend on |
| s4 | comparison | title "Plan Comparison", table 4 × 4 (Feature / Starter / Pro / Enterprise), header row on |
| s5 | content | title "Next Steps", bullets (3 lines), ellipse shape decoration |

Exact boxes: titles at `{ x: 80, y: 60, w: 1440, h: 120 }` (title slide: `{ x: 160, y: 300, w: 1280, h: 160 }`); body areas start at `y: 220`. Slide ids are `s1`–`s5`; element ids are `e<n>` in creation order, and the checklist looks them up by type rather than hard-coding them.

- [ ] **Step 4: Verify** — `npm run typecheck` passes.

- [ ] **Step 5: Commit** — `git commit -m "feat(deck): add store with transactional undo/redo and sample deck"`

---

### Task 4: Slide rendering

**Files:**
- Create: `src/components/slide/ScaledArtboard.tsx`, `src/components/slide/SlideRenderer.tsx`, `src/components/slide/elements/{ElementView,TextView,ImageView,ChartView,TableView,ShapeView}.tsx`
- Modify: `src/components/canvas/ArtboardViewport.tsx`

**Interfaces:**
- Consumes: `useDeckStore`, `Element`, `ElementOf<T>`.
- Produces: `<SlideRenderer slideId={string} thumbnail?: boolean />`, `<ScaledArtboard scale={number}>{children}</ScaledArtboard>`.

- [ ] **Step 1: ScaledArtboard** — outer div sized `1600*scale × 900*scale`, inner div `1600 × 900` with `transform: scale(scale)` and `transform-origin: top left`. `ArtboardViewport` keeps its ResizeObserver fit logic and renders `<ScaledArtboard scale={scale}>`.

- [ ] **Step 2: SlideRenderer** — selects `slide` with `useDeckStore(s => s.deck.slides[slideId])` and the ordered element list with `useShallow(s => slide.elementOrder.map(id => s.deck.elements[id]))`. Renders a `1600 × 900` relative div with the slide background; each element is an absolutely positioned wrapper at its box (`left/top/width/height` in logical px), `z-index` = index in `elementOrder`, with `data-element-id`. Immer's structural sharing keeps unchanged element objects identical, so `ElementView` is wrapped in `memo` and only changed elements re-render.

- [ ] **Step 3: Element views**
  - `TextView`: `role: "bullets"` → `<ul class="list-disc pl-[1.2em]">` of `<li>`; otherwise one `<p>` per paragraph. Applies `fontSize` (logical px), bold, italic, align, color; `line-height: 1.25`; `overflow: hidden`.
  - `ImageView`: `<img src alt draggable={false}>` filling the box with `object-fit` from `fit`.
  - `ChartView`: title row (28 px) + Recharts chart sized `box.w × (box.h - 40)`. Data rows `categories.map((c, i) => ({ category: c, ...Object.fromEntries(series.map(s => [s.name, s.data[i] ?? 0])) }))`. `bar` → `BarChart`, `stacked-bar` → `BarChart` with `stackId="a"`, `line` → `LineChart`, `area` → `AreaChart`, `pie` → `PieChart` of the first series with one color per category. Colors from `series.color ?? CHART_PALETTE[i % 6]`. `isAnimationActive={false}` everywhere; `<Legend>` only when `showLegend`; axis labels from `xLabel`/`yLabel`. Thumbnails pass through the same component (it's scaled by CSS).
  - `TableView`: `<table class="table-fixed w-full h-full border-collapse">`, 22 px text, first row bold with a tinted background when `headerRow`.
  - `ShapeView`: `rect` → div with `fill` background and optional border; `ellipse` → same with `rounded-full`; `line` → 4 px horizontal bar vertically centered.
  - `ElementView`: `switch (element.type)` dispatch.

- [ ] **Step 4: Verify** — temporarily render `<SlideRenderer slideId="s3" />` in the viewport; the bar chart shows two series with a legend. Run `npm run typecheck`.

- [ ] **Step 5: Commit** — `git commit -m "feat(slide): render slides and all element types from the schema"`

---

### Task 5: Filmstrip, navigation, shell

**Files:**
- Create: `src/lib/ui/store.ts`, `src/lib/ui/useCurrentSlideId.ts`, `src/components/filmstrip/Filmstrip.tsx`, `src/components/shell/useEditorShortcuts.ts`, `src/components/shell/ClientOnly.tsx`
- Modify: `src/components/shell/EditorShell.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: `useDeckStore`, `SlideRenderer`, `ScaledArtboard`.
- Produces: `useUiStore` `{ currentSlideId: string | null; goToSlide(id: string): void }`; `useCurrentSlideId(): string | null`; `goRelative(delta: 1 | -1)` exported from `src/lib/ui/store.ts` (reads both stores via `getState()`).

- [ ] **Step 1: UI store + fallback hook** — `useCurrentSlideId` returns the stored id if it still exists in `deck.slides`, else `deck.slideOrder[0] ?? null`.

- [ ] **Step 2: Filmstrip** — maps `slideOrder` to buttons: slide number, a 168 px-wide thumbnail (`<ScaledArtboard scale={168 / 1600}><SlideRenderer slideId thumbnail /></ScaledArtboard>`), and the slide title below. Current slide gets a 2 px accent ring; the current thumbnail is scrolled into view (`scrollIntoView({ block: "nearest" })`) when it changes. Empty deck shows the existing "No slides yet" placeholder.

- [ ] **Step 3: Shortcuts** — one `keydown` listener on `window`, ignored when the target is an `input`, `textarea`, or `[contenteditable]`:
  - `ArrowDown`, `ArrowRight`, `PageDown` → `goRelative(1)`; `ArrowUp`, `ArrowLeft`, `PageUp` → `goRelative(-1)`. (Stage 2 changes arrows to nudge when something is selected.)
  - `⌘Z` / `Ctrl+Z` → `undo()`; `⌘⇧Z` / `Ctrl+Y` → `redo()`; `preventDefault` on both.

- [ ] **Step 4: Shell** — `EditorShell` becomes a client component wrapped in `ClientOnly` (decision S1-a; `ClientOnly` uses `useSyncExternalStore` with a server snapshot of `false`). Header: deck title on the left; Undo / Redo buttons on the right, disabled when history is empty, with `title` showing the label of the transaction they would undo/redo ("Undo: Move element"). Center: `ArtboardViewport` rendering the current slide, or an empty-state message when the deck has no slides. Right: existing chat placeholder.

- [ ] **Step 5: Verify** — `npm run typecheck` and `npm run lint` pass; walk the checklist below.

- [ ] **Step 6: Commit** — `git commit -m "feat(editor): filmstrip navigation, shortcuts, undo/redo in shell"`

---

## Stage 1 manual checklist (for you)

Run `npm run dev`, open http://localhost:3000.

1. Filmstrip shows 5 thumbnails with real content: title slide, bullets + photo, bar chart, table, bullets + circle.
2. Click each thumbnail: canvas switches, the current one is highlighted. ↑/↓, ←/→, PageUp/PageDown also switch slides.
3. Slide 3's bar chart has two colored series, axis labels, and a legend — on the canvas and in the thumbnail.
4. Resize the window: the canvas rescales, nothing reflows inside the slide (positions are fixed in 1600 × 900).
5. In the browser console (on slide 3), paste this setup once:

   ```js
   const d = deckStore.getState;
   const chartId = Object.values(d().deck.elements).find((e) => e.type === "chart").id;
   ```

   Then run each line and check the result (click on the page before pressing ⌘Z so the console doesn't catch it):
   - `d().applyOps([{ op: "move_element", id: chartId, box: { x: 5000 } }], { source: "user", label: "Move chart" })` → the chart sits flush against the right edge (clamped, not off-canvas). The Undo button tooltip reads "Undo: Move chart". ⌘Z → chart returns.
   - `d().applyOps([{ op: "move_element", id: chartId, toSlideId: "s5" }], { source: "user", label: "Move chart to slide 5" })` → chart leaves slide 3 and appears on slide 5 (thumbnails too), same id. ⌘Z → back on slide 3. ⌘⇧Z → on slide 5 again.
   - `d().applyOps([{ op: "update_element", id: chartId, patch: { chart: { kind: "line" } } }], { source: "ai", label: "Switch to line" })` → same data, now a line chart.
   - `d().applyOps([{ op: "update_element", id: chartId, patch: { text: { content: ["x"] } } }], { source: "user", label: "bad" })` → returns `[{ ok: false, error: "Element <chartId> is a chart, cannot apply text patch" }]`; nothing changes and no undo entry is added.
   - Go to slide 1, then `d().applyOps([{ op: "delete_slide", id: "s1" }], { source: "user", label: "Delete slide" })` → canvas falls back to the new first slide; ⌘Z restores slide 1 and shows it again.
6. `npm run typecheck` and `npm run lint` are clean.
