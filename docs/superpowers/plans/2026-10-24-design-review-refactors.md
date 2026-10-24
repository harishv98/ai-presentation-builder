# Design Review Refactors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Automated tests are deferred to stage 9 (design doc D14); each task ends with a manual check instead.

**Goal:** Adding a new element type becomes a compiler-driven checklist instead of a search through nine files, and three small issues from the stage 0–8 design review are closed. No user-visible behaviour changes.

**Architecture:** One new module, `src/lib/deck/elements.ts`, holds the per-type logic (AI description, patch merge, layout class, double-click action) in a map typed `{ [K in ElementType]: ElementDef<K> }`, so a missing type is a type error. React views and inspectors stay where they are but move from `switch` statements to maps of the same mapped type in `ElementView.tsx` and `Inspector.tsx`. The logic map imports no React, because `src/lib/server/sarvam.ts` pulls in the tool modules and must not bundle Recharts. Agent tools stay outside the registry: `add_chart` and `add_table` are separate tools on purpose.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Zustand 5, zod 4, Immer 11. No new dependencies.

## Global Constraints

- No behaviour change: the AI snapshot text, the tool JSON schemas sent to Sarvam, rendering, inspectors, and double-click behaviour are identical before and after.
- `applyOps` stays the only deck writer; `ops.ts` keeps its `switch` over ops (11 fixed ops, already compiler-checked).
- Every per-type map is keyed by `ElementType` with a mapped type, never `Partial` and never a `default:` branch, so the compiler lists every place a new type must be handled.
- `npm run lint` and `npm run typecheck` pass after every task.
- No replay mode: every agent request goes to Sarvam. Do not add replay or recording, `fixtures/`, or browser-console test hooks (`window.agent`, `window.deckStore`); checks use the editor UI, `git diff`, and live AI requests.

## Decisions introduced (to confirm)

| # | Decision | Why |
|---|----------|-----|
| R-a | Element registry is a typed `Record`, not a runtime `register()` call | Exhaustiveness is checked at compile time; there are no third-party element types to load dynamically |
| R-b | Logic map in `lib/deck/elements.ts`; view and inspector maps stay in `ElementView.tsx` and `Inspector.tsx` | Keeps React out of the server bundle and avoids a components ↔ lib import tangle; the compiler still points at all three files |
| R-c | `clip` moves to `lib/deck/elements.ts`; `lib/agent/snapshot.ts` re-exports it | `describe` needs it, and importing it from `snapshot.ts` would make `snapshot` ↔ `elements` a cycle. Existing `clip` imports keep working |
| R-d | Persistence: new deck fields get a zod `.default()` so older saved decks still parse; a `version` field and migrations only when a change can't be expressed as a default | Today a failed parse wipes the user's deck (it is kept only in `deck-backup`). Doc rule only, no code |
| R-e | Rate limiter sweeps expired buckets once the map reaches 5,000 keys | `buckets` only grows today; a day-expired bucket is reset on its next request anyway, so deleting it loses nothing |
| R-f | Out of scope (no current need): op handler registry, LLM provider abstraction, injecting stores into the agent loop, all-or-nothing op batches | Each adds indirection with no second implementation or failing case behind it |

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/deck/elements.ts` (new) | `ELEMENTS` map, `elementDef()`, `clip()` |
| `src/lib/deck/ops.ts` (modify) | `update_element` merges via `elementDef(...).merge`; `mergePayload` deleted |
| `src/lib/agent/snapshot.ts` (modify) | `describeElement` delegates to the registry; re-exports `clip` |
| `src/lib/agent/arrange.ts` (modify) | `visual` from the registry |
| `src/lib/content/actions.ts` (modify) | `startEditing` switches on the registry's `activate` |
| `src/components/slide/elements/ElementView.tsx` (modify) | `VIEWS` map |
| `src/components/inspector/Inspector.tsx` (modify) | `INSPECTORS` map, `shape: null` |
| `src/lib/agent/tools/shared.ts` (modify) | `TextStyleArg` derived from `TextStyleSchema` |
| `src/lib/server/rateLimit.ts` (modify) | expired-bucket sweep |
| `docs/superpowers/specs/2026-10-23-ai-presentation-builder-design.md` (modify) | element types section, persistence rule, image memory limit |

---

## Task 1: Element logic registry

**Files:** `src/lib/deck/elements.ts` (new), `src/lib/deck/ops.ts`, `src/lib/agent/snapshot.ts`, `src/lib/agent/arrange.ts`, `src/lib/content/actions.ts`

**Interfaces:**
- Produces: `ELEMENTS: { [K in ElementType]: ElementDef<K> }`, `elementDef(element: { type: ElementType }): ElementDef<ElementType>`, `clip(text: string, max: number): string`, `type Activate = "edit-text" | "edit-cell" | "inspector" | "none"`.

- [ ] **Step 1: Baseline.** `npm run dev`, load the sample deck, and note how each slide looks on the canvas. Step 7 compares against this and against `git diff`.

- [ ] **Step 2: Registry.** New `src/lib/deck/elements.ts`. The `describe` bodies are moved verbatim from `snapshot.ts`; the `merge` bodies from `ops.ts` `mergePayload`:

```ts
import type { Draft } from "immer";
import type { ElementPatch } from "./ops";
import type { ElementOf, ElementType } from "./schema";

const TEXT_LIMIT = 600;
const TABLE_ROW_LIMIT = 20;

export type Activate = "edit-text" | "edit-cell" | "inspector" | "none";

type ElementDef<K extends ElementType> = {
  describe: (element: ElementOf<K>, at: string) => string;
  merge: (element: Draft<ElementOf<K>>, patch: Omit<ElementPatch, "box">) => void;
  visual: boolean;
  activate: Activate;
};

export const ELEMENTS: { [K in ElementType]: ElementDef<K> } = {
  text: {
    describe(element, at) {
      const { role, content, style } = element.text;
      const flags = [`size=${style.fontSize}`, style.bold && "bold", style.italic && "italic", style.align, style.color]
        .filter(Boolean)
        .join(" ");
      return `${element.id} text/${role} ${at} ${flags} ${JSON.stringify(clipParagraphs(content))}`;
    },
    merge(element, patch) {
      const { style, ...rest } = patch.text ?? {};
      Object.assign(element.text, rest);
      if (style) Object.assign(element.text.style, style);
    },
    visual: false,
    activate: "edit-text",
  },
  image: {
    describe(element, at) {
      const src = element.image.src.startsWith("data:") ? "uploaded" : element.image.src;
      return `${element.id} image ${at} alt=${JSON.stringify(element.image.alt)} src=${src}`;
    },
    merge(element, patch) {
      Object.assign(element.image, patch.image);
    },
    visual: true,
    activate: "inspector",
  },
  chart: {
    describe(element, at) {
      const c = element.chart;
      const series = c.series.map((s) => `${s.name}=${JSON.stringify(s.data)}`).join("; ");
      const axes = [c.xLabel && `x=${JSON.stringify(c.xLabel)}`, c.yLabel && `y=${JSON.stringify(c.yLabel)}`]
        .filter(Boolean)
        .join(" ");
      return `${element.id} chart/${c.kind} ${at} title=${JSON.stringify(c.title)} categories=${JSON.stringify(c.categories)} series: ${series} legend=${c.showLegend} ${axes}`.trimEnd();
    },
    merge(element, patch) {
      Object.assign(element.chart, patch.chart);
    },
    visual: true,
    activate: "inspector",
  },
  table: {
    describe(element, at) {
      const { rows, headerRow } = element.table;
      const shown = rows.slice(0, TABLE_ROW_LIMIT);
      const more = rows.length > shown.length ? ` (+${rows.length - shown.length} more rows)` : "";
      return `${element.id} table ${at} header=${headerRow} rows=${JSON.stringify(shown)}${more}`;
    },
    merge(element, patch) {
      Object.assign(element.table, patch.table);
    },
    visual: true,
    activate: "edit-cell",
  },
  shape: {
    describe: (element, at) => `${element.id} shape/${element.shape.kind} ${at} fill=${element.shape.fill}`,
    merge(element, patch) {
      Object.assign(element.shape, patch.shape);
    },
    visual: true,
    activate: "none",
  },
};

// TypeScript can't correlate `element.type` with the matching map entry, so callers go through this one cast.
export const elementDef = (element: { type: ElementType }) => ELEMENTS[element.type] as ElementDef<ElementType>;

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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

`import type` from `./ops` is erased at runtime, so `ops.ts` importing `elementDef` back is not a cycle.

- [ ] **Step 3: Ops.** In `src/lib/deck/ops.ts`, add `import { elementDef } from "./elements";`, replace `mergePayload(element, payloadPatch);` in `update_element` with `elementDef(element).merge(element, payloadPatch);`, and delete the `mergePayload` function. Keep the `key !== element.type` check above it: `merge` relies on only receiving its own payload key.

- [ ] **Step 4: Snapshot.** In `src/lib/agent/snapshot.ts`:
  - Delete `TEXT_LIMIT`, `TABLE_ROW_LIMIT`, `clip`, and `clipParagraphs` (keep `NOTES_LIMIT`).
  - Add at the top:

```ts
import { clip, elementDef } from "@/lib/deck/elements";

export { clip };
```

  - Replace `describeElement` with:

```ts
export function describeElement(element: Element): string {
  const { x, y, w, h } = element.box;
  return elementDef(element).describe(element, `@${x},${y} ${w}x${h}`);
}
```

The existing `clip` imports in `runAgent.ts`, `generateDeck.ts`, and `SlideFillOverlay.tsx` keep working through the re-export.

- [ ] **Step 5: Arrange.** In `src/lib/agent/arrange.ts`, add `import { elementDef } from "@/lib/deck/elements";` and change the `arrangeBoxes` call in `arrangeSlide` to:

```ts
const boxes = arrangeBoxes(layout, elements.map((element) => ({ id: element.id, visual: elementDef(element).visual })));
```

`bodyElements` keeps its title-text check; that is about the slide title, not the element type.

- [ ] **Step 6: Double-click action.** In `src/lib/content/actions.ts`, add `import { elementDef } from "@/lib/deck/elements";` and replace the `switch (element.type)` in `startEditing` with:

```ts
switch (elementDef(element).activate) {
  case "edit-text":
    ui.setEditing({ kind: "text", elementId: id, caret: at.caret ?? "all" });
    return;
  case "edit-cell": {
    const cell = at.cell ?? { row: 0, col: 0 };
    ui.setEditing({ kind: "cell", elementId: id, row: cell.row, col: cell.col, txnId: crypto.randomUUID() });
    return;
  }
  case "inspector":
    ui.setRightPanel("format");
}
```

- [ ] **Step 7: Check.** `npm run lint` and `npm run typecheck` pass. With the dev server running and the sample deck on slide 1:
  1. `git diff` on `snapshot.ts` and `elements.ts`: each `describe` body matches the deleted `describeElement` branch line for line, and `TEXT_LIMIT` and `TABLE_ROW_LIMIT` keep their values.
  2. Select a bullets text box and toggle Bold in the Format panel: it turns bold and keeps its size, align, and color. ⌘Z reverts it.
  3. Select the chart and switch its type to Line in the Format panel: same data, now a line chart. ⌘Z reverts it.
  4. Double-click a text box: in-place editor. Double-click a table cell: cell editor. Double-click the chart and the image: the Format tab opens. Double-click a shape: nothing happens, as before.
  5. In the chat, ask "make slide 2 more concise": the AI edits only that slide's text. Then start a new deck and generate a short one (e.g. 3 slides): slides are arranged as before (text columns first, visuals after). Both are live Sarvam calls and use a few credits.
  6. Type check: temporarily delete the `shape` entry from `ELEMENTS`; `npm run typecheck` fails on `ELEMENTS`. Restore it.

- [ ] **Step 8: Commit.** `refactor(deck): element registry for description, patch merge, layout class, and double-click action`

---

## Task 2: Compiler-checked view and inspector maps

**Files:** `src/components/slide/elements/ElementView.tsx`, `src/components/inspector/Inspector.tsx`

- [ ] **Step 1: Views.** Replace the body of `src/components/slide/elements/ElementView.tsx` after the imports with:

```tsx
export type RenderVariant = "canvas" | "thumbnail" | "print";

type ViewProps<K extends ElementType> = { element: ElementOf<K>; variant: RenderVariant };

const VIEWS: { [K in ElementType]: ComponentType<ViewProps<K>> } = {
  text: TextView,
  image: ImageView,
  chart: ChartView,
  table: TableView,
  shape: ShapeView,
};

export const ElementView = memo(function ElementView({ element, variant }: ViewProps<ElementType>) {
  const View = VIEWS[element.type] as ComponentType<ViewProps<ElementType>>;
  return <View element={element} variant={variant} />;
});
```

Imports: `import { memo, type ComponentType } from "react";` and `import type { ElementOf, ElementType } from "@/lib/deck/schema";` (drop the unused `Element` import). Views that ignore `variant` (image, table, shape) are still assignable, since a component may take fewer props.

- [ ] **Step 2: Inspectors.** In `src/components/inspector/Inspector.tsx`, add above `Inspector`:

```tsx
const INSPECTORS: { [K in ElementType]: ComponentType<{ element: ElementOf<K> }> | null } = {
  text: TextInspector,
  table: TableInspector,
  chart: ChartInspector,
  image: ImageInspector,
  shape: null,
};
```

and replace the `switch` with:

```tsx
const Panel = INSPECTORS[element.type] as ComponentType<{ element: Element }> | null;
if (!Panel) return <Hint>Nothing to format for this element yet.</Hint>;
return <Panel key={element.id} element={element} />;
```

Imports: `import type { ComponentType } from "react";` and `import type { Element, ElementOf, ElementType } from "@/lib/deck/schema";`. `shape: null` makes "no inspector" an explicit choice instead of a `default:` that would also swallow a new type.

- [ ] **Step 3: Check.** `npm run lint` and `npm run typecheck` pass. On the sample deck:
  1. Every slide looks the same on the canvas, in the filmstrip, and in Export PDF (chart clip paths intact, images present).
  2. Drag the chart onto another thumbnail: the ghost shows the chart.
  3. Select each element type: text, table, chart, and image show their Format panels; a shape shows "Nothing to format for this element yet."; two selected elements show the multi-select hint.
  4. Type check: temporarily delete `shape: null`; `npm run typecheck` fails on `INSPECTORS`. Restore it.

- [ ] **Step 4: Commit.** `refactor(slide): compiler-checked element view and inspector maps`

---

## Task 3: Small fixes from the review

**Files:** `src/lib/agent/tools/shared.ts`, `src/lib/server/rateLimit.ts`

- [ ] **Step 1: Derive `TextStyleArg`.** In `src/lib/agent/tools/shared.ts`, replace `TextStyleArg` with:

```ts
export const TextStyleArg = TextStyleSchema.partial().extend({
  color: TextStyleSchema.shape.color.optional().describe("Hex color, e.g. #0f172a"),
});
```

and change the schema import to `import { TextStyleSchema, type Deck, type ElementOf, type ElementType } from "@/lib/deck/schema";`.

- [ ] **Step 2: Rate limiter sweep.** In `src/lib/server/rateLimit.ts`, add `const SWEEP_AT = 5_000;` under `DAY_MS`, and make this the first line of `takeToken`:

```ts
// ponytail: O(n) sweep only past SWEEP_AT keys; a shared store (Upstash/KV) replaces this map if limits must span instances
if (buckets.size >= SWEEP_AT) for (const [k, b] of buckets) if (now - b.dayStart >= DAY_MS) buckets.delete(k);
```

- [ ] **Step 3: Check.** `npm run lint` and `npm run typecheck` pass.
  1. `TextStyleArg` has the same fields, bounds, and color description as the hand-written version it replaces (compare with `git diff`). In the chat, ask "make the slide 1 title red and centered": the tool call succeeds.
  2. The limiter still blocks at 40 per minute and the sweep runs without error:

```bash
node --input-type=module -e '
import { takeToken } from "./src/lib/server/rateLimit.ts";
for (let i = 0; i < 5000; i++) takeToken(`ip${i}`, 0);
let blocked = 0;
for (let i = 0; i < 41; i++) if (!takeToken("x", 86_400_001).ok) blocked++;
console.log(blocked === 1 ? "ok" : `FAIL ${blocked}`);
'
```

Expected output: `ok` (Node 24 strips the types itself).

- [ ] **Step 4: Commit.** `refactor(agent): derive text style tool args from the schema; sweep expired rate-limit buckets`

---

## Task 4: Design doc

**Files:** `docs/superpowers/specs/2026-10-23-ai-presentation-builder-design.md`

- [ ] **Step 1:** Under section 3's rules, add:
  - "Per-type behaviour lives in maps keyed by `ElementType`: `ELEMENTS` in `lib/deck/elements.ts` (AI description, patch merge, layout class, double-click action), `VIEWS` in `ElementView.tsx`, `INSPECTORS` in `Inspector.tsx` (`null` = no panel). Adding a type: add it to `ElementSchema`, then fix every type error. Agent tools are added by hand (`add_chart`/`add_table` stay separate tools)."
  - "Schema changes: a new field gets a zod `.default()` so saved decks still parse. Add a deck `version` and a migration only for a change a default can't express; otherwise a failed parse resets the deck (the raw copy stays in `deck-backup`)."
- [ ] **Step 2:** In section 4's persistence bullet, append to "Known gaps": "uploaded images are data URLs inside undo patches, so 100 history entries with large images can hold hundreds of MB; storing images as IndexedDB blobs referenced by id would fix this and the size concern."
- [ ] **Step 3:** In section 5.1's guards bullet, after "in-memory per instance", add "expired buckets swept past 5,000 keys".
- [ ] **Step 4:** Add any decision that changed during the checks to the decisions table.
- [ ] **Step 5: Commit.** `docs: design review decisions`
