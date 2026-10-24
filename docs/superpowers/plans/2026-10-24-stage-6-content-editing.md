# Stage 6: Content Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Automated tests are deferred to stage 9 (design doc D14); each task ends with a manual check instead.

**Goal:** The user can edit content by hand. Double-clicking a text box edits it in place. Double-clicking a table cell edits that cell, and Tab and Enter move between cells. A Format tab next to Chat edits chart data, type, legend, and axes, adds or removes table rows and columns, and replaces images. An insert toolbar adds a text box, an uploaded image, a chart, a table, or a shape to the current slide. Every change goes through `applyOps` and is undoable.

**Architecture:** No new deck ops and no schema changes. Every edit compiles to `update_element` or `add_element`. Editing state (which element or cell is being edited, the active right-panel tab) lives in the UI store and never enters history. The text editor and the cell editor are overlays inside `CanvasStage`, drawn over the element in artboard units, so `SlideRenderer`, thumbnails, and print stay read-only. Pure data helpers for charts and tables live in `src/lib/content/` (stage 9 unit-tests them), and the actions that call `applyOps` sit next to them, the same way as `src/lib/canvas/actions.ts` and `src/lib/slides/actions.ts`.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Tailwind 4, Zustand 5, Immer 11, Recharts 3. No new dependencies.

## Before starting

The working tree has uncommitted stage 5 follow-ups (changes to `generateDeck.ts`, `protocol.ts`, `chat/store.ts`, `prompts.ts`, `sarvam.ts`, `EmptyDeck.tsx`, `slides/actions.ts`, plus new fixtures under `fixtures/agent/`). Finish and commit those first, so stage 6 commits contain only stage 6.

## Global Constraints

- Every deck mutation goes through `applyOps`. Components never write `deck` directly.
- No new ops, no schema changes. Chart, table, text, image, and shape edits are `update_element` patches; inserts are `add_element`.
- Typing in a text box or a table cell never writes the deck. A text box commits once when editing ends. A table session (from double-click until leaving the table) is one undo step.
- Inspector fields apply live as you type. Everything typed while one field has focus is one undo step (shared `txnId`); each button, toggle, or segmented choice is its own step.
- Editing state (`editing`, `rightPanel`) is UI state: not in history, not persisted.
- Editor shortcuts stay ignored while focus is in an `input`, `textarea`, `select`, or `[contenteditable]` (existing `isEditableTarget`). The canvas gesture ignores pointer downs inside `[data-editor]`.
- Thumbnails (and the stage 8 print view) never show editors, placeholders, or editing chrome.
- While the user edits an element, AI tool calls that target that element, or delete its slide, fail with a message to the model. Manual and AI edits never overwrite each other.
- No automated tests in this stage (D14).

## Decisions introduced in this stage (to confirm)

| # | Decision | Why |
|---|----------|-----|
| S6-a | Double-click a text box, or select it and press Enter, to edit it in place. The editor is a `contentEditable` overlay at the element's box with the same styling, and the element underneath is hidden while editing. There is one block per paragraph or bullet, and Enter adds a new one. Paste is plain text. ⌘B / ⌘I / ⌘U do nothing, because style applies to the whole element (D13). The browser's own undo works while typing. Escape, clicking elsewhere, or switching slides finishes the edit as one "Edit text" undo step. A finish with no changes adds no step | D13 and design section 6. An overlay keeps `SlideRenderer` read-only and leaves thumbnails untouched until commit |
| S6-b | Double-click puts the caret where you clicked. Enter selects all the text | Matches Keynote and Slides. Enter is the keyboard path, and selecting all makes replacing placeholder text quick |
| S6-c | While typing, the editor grows downward to show all the text. On commit, if the text changed and no longer fits, the box height grows to fit (at most 900; clamping moves it up if needed). Boxes never shrink | Overflow is hidden on the canvas, so text typed past the box would otherwise disappear |
| S6-d | While an element is being edited (text or a table cell), AI tool calls that target it, or `delete_slide` on its slide, return "The user is editing eN right now…" to the model. The canvas doesn't follow the AI to another slide while editing (it already doesn't while dragging or renaming). Populate's layout helper can still move the box; the editor follows it | Spec: "neither path may clobber the other". Without the guard, committing the user's draft would overwrite an AI rewrite of the same element, or the AI would delete the element under the caret |
| S6-e | Double-click a table cell to edit it in an input placed over the cell. Enter commits and moves down (on the last row it finishes). Tab and Shift+Tab move right and left, wrapping between rows. Tab in the last cell adds a row and moves into it. Escape or clicking elsewhere finishes. Cells are single-line | Spreadsheet keys. One `txnId` per session keeps a burst of cell edits as one undo step |
| S6-f | The right panel gets two tabs, **Chat** and **Format** (your choice). The chat stays mounted on the hidden tab, so streaming keeps going. When the AI is replying and Format is open, the Chat tab shows a pulsing dot. Format opens when you double-click a chart or image, click **Format** in the selection toolbar, or insert a chart or table. Selecting an element alone doesn't switch tabs. When a reply or generation starts, Chat comes back to the front | The canvas keeps its size (no layout jump on select). Auto-switching on every click would hide the chat whenever you touch the slide |
| S6-g | The Format tab shows controls for the selected element. **Chart:** title, type, legend, X/Y axis labels, data grid. **Table:** header row, add or delete a row or column. **Image:** replace. **Text:** a hint to double-click or press Enter. **Shape:** "Nothing to format for this element yet." With nothing selected it says "Select an element…"; with several selected it says "Select one element…". No position or size fields | Spec requires that chart data and table rows, columns, and cells be really editable. Text style and shape colors aren't in the stage 6 spec (the AI can change them); add panels when someone needs them by hand. Position and size already have handles, snapping, and nudging |
| S6-h | Inspector edits apply live. Each focused field is one undo step. Number fields keep a draft while focused: text that isn't a number in range (for example "1." or "-") is not applied, and the field shows the stored value again on blur | Live charts make data editing feel direct, and the session `txnId` keeps undo readable |
| S6-i | Chart data grid: one row per category, one column per series. Series headers have a color swatch, a name, and ×; rows have × and a category name. "+ Category" adds "Item N" with 0 in every series; "+ Series" adds "Series N" with all 0s. At least one category and one series remain. Changing the type never touches data. Pie shows a note: it uses only the first series and no axes, and the rest is kept. `ChartView` switches to index-based data keys (`s0`, `s1`, …), so empty or duplicate series names still render | Spec: editable data, type, legend, axes, optional colors; changing type keeps data. Recharts keys series by `dataKey`, so two series both named "Series 1" would collide |
| S6-j | Table rows and columns: Add row and Delete row act at the bottom, Add column and Delete column at the right. Adding or deleting a row grows or shrinks the box by one row's height. At least 1 × 1 remains | Spec: "rows/cols, cell text". Acting at a chosen cell would need a cell cursor in UI state; add it when mid-table inserts are needed. Growing the box keeps row height steady, so text doesn't get squeezed |
| S6-k | An insert toolbar sits above the canvas: **Text, Chart, Table, Rectangle, Ellipse, Line, Image**. Inserted elements are centered at a default size (text 640×120 "New text"; chart 960×540 bar chart with Q1–Q4 sample data; table 960×240, 3×3 with a header row; rectangle 320×200; ellipse 240×240; line 480×20). If another element already sits at that exact spot, the new one is offset by 20/20 (up to 10 times). The new element is selected so it can be dragged immediately. Each insert is one undo step ("Insert chart") | Spec: "land on the canvas with a default size and can be moved immediately". The offset keeps a second insert from hiding behind the first |
| S6-l | Image upload: file picker, `image/*` only, at most 10 MB. Raster images whose longest edge is over 1600 px, or whose file is over 1.5 MB, are re-encoded at up to 1600 px (PNG stays PNG, everything else becomes JPEG at 0.85). SVG and GIF are stored unchanged. The image is stored as a data URL, its box keeps the image's aspect ratio within 800×500, and the alt text comes from the file name. Errors show next to the button until the next pick | Data URLs need no backend. Downscaling keeps undo history and stage 8 persistence small. The AI snapshot already prints uploaded images as `src=uploaded` (S4-e) |
| S6-m | **Replace image** in the image Format panel uses the same picker. It keeps the box and fit, and replaces `src` and `alt` | Nice-to-have from the spec (your pick); reuses S6-l |
| S6-n | A text box whose text is all blank shows a faint "Empty text" on the canvas only, never in thumbnails or print | Without it, an emptied text box is invisible and hard to find again |

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/ui/store.ts` (modify) | `editing`, `rightPanel` state and setters; clear `editing` when the current slide vanishes |
| `src/lib/content/chartData.ts` | Pure chart data helpers: add/remove category and series, set a value, name, or color |
| `src/lib/content/tableData.ts` | Pure table helpers: size, set a cell, insert/delete a row or column |
| `src/lib/content/actions.ts` | `editElement`, `startEditing`, `commitText`, `commitCell`, `editTableStructure`, `replaceImage` |
| `src/lib/content/image.ts` | `readImageFile`: validate, decode, downscale, and return a data URL with its size and alt text |
| `src/lib/content/insert.ts` | Default elements, cascade placement, `insertDefault`, `insertImage` |
| `src/lib/canvas/actions.ts` (modify) | `singleSelectedId` |
| `src/lib/agent/executeTool.ts` (modify) | Editing guard (S6-d) |
| `src/lib/agent/reveal.ts` (modify) | Don't follow the AI while editing |
| `src/components/slide/SlideRenderer.tsx` (modify) | `hiddenId` prop hides the element being edited |
| `src/components/slide/elements/TextView.tsx` (modify) | Exports `textCss`; "Empty text" placeholder on the canvas |
| `src/components/slide/elements/ElementView.tsx` (modify) | Passes `variant` to `TextView` |
| `src/components/slide/elements/TableView.tsx` (modify) | `data-cell="row:col"` on cells |
| `src/components/slide/elements/ChartView.tsx` (modify) | Index-based series keys |
| `src/components/canvas/TextEditor.tsx` | In-place text editor overlay |
| `src/components/canvas/TableCellEditor.tsx` | Cell input overlay with Enter/Tab navigation |
| `src/components/canvas/CanvasStage.tsx` (modify) | Double-click routing; renders the editors |
| `src/components/canvas/useCanvasGesture.ts` (modify) | Ignores pointer downs in editors; finishes an edit before a new gesture |
| `src/components/canvas/SelectionOverlay.tsx` (modify) | Hides resize handles while editing |
| `src/components/shell/useEditorShortcuts.ts` (modify) | Enter starts editing the selected element |
| `src/components/shell/RightPanel.tsx` | Chat / Format tabs |
| `src/components/shell/SelectionToolbar.tsx` (modify) | "Format" button |
| `src/components/shell/EditorShell.tsx` (modify) | Uses `RightPanel`; insert toolbar above the canvas |
| `src/components/chat/ChatPanel.tsx` (modify) | Becomes the Chat tab body (no `aside`, no heading) |
| `src/components/chat/ChatTranscript.tsx` (modify) | Scrolls to the end when the Chat tab is shown again |
| `src/components/inspector/fields.tsx` | Shared inspector controls and `useEditSession` |
| `src/components/inspector/Inspector.tsx` | Picks the panel for the selection |
| `src/components/inspector/TableInspector.tsx`, `ChartInspector.tsx`, `ImageInspector.tsx` | Per-type panels |
| `src/components/insert/ImagePickerButton.tsx` | Button + hidden file input + inline error |
| `src/components/insert/InsertToolbar.tsx` | The insert toolbar |

---

### Task 1: Editing state, content helpers, and the AI guard

**Files:**
- Modify: `src/lib/ui/store.ts`, `src/lib/canvas/actions.ts`, `src/lib/agent/executeTool.ts`, `src/lib/agent/reveal.ts`
- Create: `src/lib/content/chartData.ts`, `src/lib/content/tableData.ts`, `src/lib/content/actions.ts`

**Interfaces:**
- Consumes: `useDeckStore` (`deck`, `applyOps`), `ElementPatch` from `src/lib/deck/ops.ts`, `currentSelection` (private) in canvas actions.
- Produces:
  - UI store types: `TextCaret = { x: number; y: number } | "all"`, `CellEditing = { kind: "cell"; elementId: string; row: number; col: number; txnId: string }`, `Editing = { kind: "text"; elementId: string; caret: TextCaret } | CellEditing`, `RightPanelTab = "chat" | "format"`
  - UI store state: `editing: Editing | null`, `rightPanel: RightPanelTab`, `setEditing(editing)`, `setRightPanel(tab)`
  - `singleSelectedId(): string | null`
  - `chartData.ts`: `type ChartData = Pick<ChartPayload, "categories" | "series">`; `addCategory(chart)`, `removeCategory(chart, index)`, `addSeries(chart)`, `removeSeries(chart, index)`, `setCategory(chart, index, name)`, `setSeriesName(chart, index, name)`, `setSeriesColor(chart, index, color)`, `setValue(chart, seriesIndex, categoryIndex, value)`, all returning `ChartData`
  - `tableData.ts`: `type Rows = string[][]`; `tableSize(rows): { rows: number; cols: number }`, `setCell(rows, row, col, text)`, `insertRow(rows, at)`, `deleteRow(rows, at)`, `insertColumn(rows, at)`, `deleteColumn(rows, at)`, all returning `Rows` except `tableSize`
  - `actions.ts`: `getElement(id, type)`, `editElement(id, patch, label, txnId?)`, `startEditing(id, at?: { caret?: { x: number; y: number }; cell?: { row: number; col: number } })`, `commitText(id, content, height)`, `commitCell(id, row, col, text, txnId)`, `type TableEdit = "add-row" | "delete-row" | "add-column" | "delete-column"`, `editTableStructure(id, edit, txnId?)`

- [ ] **Step 1: UI store state**

In `src/lib/ui/store.ts`, add the exported types above `UiState`:

```ts
export type TextCaret = { x: number; y: number } | "all";
export type CellEditing = { kind: "cell"; elementId: string; row: number; col: number; txnId: string };
export type Editing = { kind: "text"; elementId: string; caret: TextCaret } | CellEditing;
export type RightPanelTab = "chat" | "format";
```

Add to `UiState`:

```ts
  editing: Editing | null;
  rightPanel: RightPanelTab;
  setEditing: (editing: Editing | null) => void;
  setRightPanel: (tab: RightPanelTab) => void;
```

Add to the initial state:

```ts
  editing: null,
  rightPanel: "chat",
  setEditing: (editing) => set({ editing }),
  setRightPanel: (tab) => set({ rightPanel: tab }),
```

In the `useDeckStore.subscribe` block at the bottom, clear editing too:

```ts
  useUiStore.setState({ currentSlideId: next, selectedIds: [], renamingSlideId: null, editing: null });
```

- [ ] **Step 2: Single selection helper** — append to `src/lib/canvas/actions.ts`:

```ts
export function singleSelectedId(): string | null {
  const selection = currentSelection();
  return selection?.ids.length === 1 ? selection.ids[0]! : null;
}
```

- [ ] **Step 3: Chart data helpers** (decision S6-i)

```ts
// src/lib/content/chartData.ts
import type { ChartPayload } from "@/lib/deck/schema";

export type ChartData = Pick<ChartPayload, "categories" | "series">;
type Series = ChartPayload["series"][number];

const mapSeries = (chart: ChartData, index: number, fn: (series: Series) => Series): ChartData => ({
  categories: chart.categories,
  series: chart.series.map((s, j) => (j === index ? fn(s) : s)),
});

export function addCategory(chart: ChartData): ChartData {
  return {
    categories: [...chart.categories, `Item ${chart.categories.length + 1}`],
    series: chart.series.map((s) => ({ ...s, data: [...s.data, 0] })),
  };
}

export function removeCategory(chart: ChartData, index: number): ChartData {
  if (chart.categories.length <= 1) return chart;
  return {
    categories: chart.categories.filter((_, i) => i !== index),
    series: chart.series.map((s) => ({ ...s, data: s.data.filter((_, i) => i !== index) })),
  };
}

export function addSeries(chart: ChartData): ChartData {
  return {
    categories: chart.categories,
    series: [...chart.series, { name: `Series ${chart.series.length + 1}`, data: chart.categories.map(() => 0) }],
  };
}

export function removeSeries(chart: ChartData, index: number): ChartData {
  if (chart.series.length <= 1) return chart;
  return { categories: chart.categories, series: chart.series.filter((_, j) => j !== index) };
}

export function setCategory(chart: ChartData, index: number, name: string): ChartData {
  return { categories: chart.categories.map((c, i) => (i === index ? name : c)), series: chart.series };
}

export function setSeriesName(chart: ChartData, index: number, name: string): ChartData {
  return mapSeries(chart, index, (s) => ({ ...s, name }));
}

export function setSeriesColor(chart: ChartData, index: number, color: string): ChartData {
  return mapSeries(chart, index, (s) => ({ ...s, color }));
}

export function setValue(chart: ChartData, seriesIndex: number, categoryIndex: number, value: number): ChartData {
  return mapSeries(chart, seriesIndex, (s) => ({
    ...s,
    data: chart.categories.map((_, i) => (i === categoryIndex ? value : (s.data[i] ?? 0))),
  }));
}
```

`setValue` rebuilds `data` from `categories`, so a series that came in short gets padded with zeros instead of keeping a hole.

- [ ] **Step 4: Table helpers** (decision S6-j)

```ts
// src/lib/content/tableData.ts
export type Rows = string[][];

export function tableSize(rows: Rows): { rows: number; cols: number } {
  return { rows: rows.length, cols: Math.max(0, ...rows.map((row) => row.length)) };
}

export function setCell(rows: Rows, row: number, col: number, text: string): Rows {
  return rows.map((cells, r) => (r === row ? cells.map((cell, c) => (c === col ? text : cell)) : cells));
}

export function insertRow(rows: Rows, at: number): Rows {
  const next = [...rows];
  next.splice(at, 0, Array<string>(tableSize(rows).cols).fill(""));
  return next;
}

export function deleteRow(rows: Rows, at: number): Rows {
  return rows.length <= 1 ? rows : rows.filter((_, r) => r !== at);
}

export function insertColumn(rows: Rows, at: number): Rows {
  return rows.map((cells) => [...cells.slice(0, at), "", ...cells.slice(at)]);
}

export function deleteColumn(rows: Rows, at: number): Rows {
  return tableSize(rows).cols <= 1 ? rows : rows.map((cells) => cells.filter((_, c) => c !== at));
}
```

- [ ] **Step 5: Content actions** (decisions S6-a, S6-c, S6-e, S6-j)

```ts
// src/lib/content/actions.ts
import { ARTBOARD_HEIGHT } from "@/lib/deck/constants";
import type { ElementPatch } from "@/lib/deck/ops";
import type { ElementOf, ElementType } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";
import { deleteColumn, deleteRow, insertColumn, insertRow, setCell, tableSize } from "./tableData";

export type TableEdit = "add-row" | "delete-row" | "add-column" | "delete-column";

const TABLE_EDIT_LABEL: Record<TableEdit, string> = {
  "add-row": "Add table row",
  "delete-row": "Delete table row",
  "add-column": "Add table column",
  "delete-column": "Delete table column",
};

export function getElement<T extends ElementType>(id: string, type: T): ElementOf<T> | null {
  const element = useDeckStore.getState().deck.elements[id];
  return element?.type === type ? (element as ElementOf<T>) : null;
}

export function editElement(id: string, patch: ElementPatch, label: string, txnId?: string): void {
  useDeckStore
    .getState()
    .applyOps([{ op: "update_element", id, patch }], { source: "user", label, ...(txnId && { txnId }) });
}

export function startEditing(
  id: string,
  at: { caret?: { x: number; y: number }; cell?: { row: number; col: number } } = {},
): void {
  const element = useDeckStore.getState().deck.elements[id];
  if (!element) return;
  const ui = useUiStore.getState();
  ui.setSelection([id]);
  switch (element.type) {
    case "text":
      ui.setEditing({ kind: "text", elementId: id, caret: at.caret ?? "all" });
      return;
    case "table": {
      const cell = at.cell ?? { row: 0, col: 0 };
      ui.setEditing({ kind: "cell", elementId: id, row: cell.row, col: cell.col, txnId: crypto.randomUUID() });
      return;
    }
    case "chart":
    case "image":
      ui.setRightPanel("format");
  }
}

const sameLines = (a: string[], b: string[]) => a.length === b.length && a.every((line, i) => line === b[i]);

export function commitText(id: string, content: string[], height: number): void {
  const element = getElement(id, "text");
  if (!element || sameLines(content, element.text.content)) return;
  const grow = height > element.box.h ? { box: { h: Math.min(Math.ceil(height), ARTBOARD_HEIGHT) } } : {};
  editElement(id, { text: { content }, ...grow }, "Edit text");
}

export function commitCell(id: string, row: number, col: number, text: string, txnId: string): void {
  const element = getElement(id, "table");
  const current = element?.table.rows[row]?.[col];
  if (!element || current === undefined || current === text) return;
  editElement(id, { table: { rows: setCell(element.table.rows, row, col, text) } }, "Edit table", txnId);
}

export function editTableStructure(id: string, edit: TableEdit, txnId?: string): void {
  const element = getElement(id, "table");
  if (!element) return;
  const { rows } = element.table;
  const size = tableSize(rows);
  const rowHeight = element.box.h / size.rows;
  const height = (delta: number) => ({ h: Math.min(Math.round(element.box.h + delta), ARTBOARD_HEIGHT) });

  // ponytail: rows change at the bottom and columns at the right; add a cell cursor if mid-table inserts are needed
  let patch: ElementPatch;
  switch (edit) {
    case "add-row":
      patch = { table: { rows: insertRow(rows, size.rows) }, box: height(rowHeight) };
      break;
    case "delete-row":
      if (size.rows <= 1) return;
      patch = { table: { rows: deleteRow(rows, size.rows - 1) }, box: height(-rowHeight) };
      break;
    case "add-column":
      patch = { table: { rows: insertColumn(rows, size.cols) } };
      break;
    case "delete-column":
      if (size.cols <= 1) return;
      patch = { table: { rows: deleteColumn(rows, size.cols - 1) } };
      break;
  }
  editElement(id, patch, TABLE_EDIT_LABEL[edit], txnId);
}
```

`replaceImage` is added to this file in Task 6.

- [ ] **Step 6: AI guard and reveal** (decision S6-d)

In `src/lib/agent/executeTool.ts`, import `useUiStore` from `@/lib/ui/store`, and right after the `outsideSlide` check add:

```ts
  const conflict = editingConflict(useDeckStore.getState().deck, call.function.name, args);
  if (conflict) return failed(base, conflict);
```

At the bottom of the file:

```ts
function editingConflict(deck: Deck, name: string, args: unknown): string | null {
  const editing = useUiStore.getState().editing;
  if (!editing) return null;
  const { elementId, slideId } = (args ?? {}) as { elementId?: unknown; slideId?: unknown };
  const deletesItsSlide = name === "delete_slide" && slideId === deck.elements[editing.elementId]?.slideId;
  if (elementId !== editing.elementId && !deletesItsSlide) return null;
  return `The user is editing ${editing.elementId} right now. Leave it as it is and continue with the rest of the request.`;
}
```

Every element tool names its target `elementId` (stage 4), so one check covers update, move, resize, delete, reorder, chart, and table tools.

In `src/lib/agent/reveal.ts`, extend `busy`:

```ts
  const busy = ui.dragPreview || ui.marquee || ui.draggingSlideId || ui.renamingSlideId || ui.editing;
```

- [ ] **Step 7: Verify in the console** — `npm run typecheck` and `npm run lint` pass. Load the sample deck, then in the browser console:

```js
uiStore.getState().setEditing({ kind: "text", elementId: "e7", caret: "all" });
uiStore.getState().editing; // { kind: "text", elementId: "e7", ... }
uiStore.getState().setEditing(null);
```

- [ ] **Step 8: Commit** — `git commit -m "feat(content): editing state, chart and table data helpers, and AI editing guard"`

---

### Task 2: Inline text editing

**Files:**
- Create: `src/components/canvas/TextEditor.tsx`
- Modify: `src/components/slide/elements/TextView.tsx`, `src/components/slide/elements/ElementView.tsx`, `src/components/slide/SlideRenderer.tsx`, `src/components/canvas/CanvasStage.tsx`, `src/components/canvas/useCanvasGesture.ts`, `src/components/canvas/SelectionOverlay.tsx`, `src/components/shell/useEditorShortcuts.ts`

**Interfaces:**
- Consumes: `editing`, `setEditing`, `TextCaret` (UI store); `startEditing`, `commitText` (content actions); `singleSelectedId` (canvas actions).
- Produces: `textCss(style: TextStyle): CSSProperties`; `TextView({ element, variant })`; `SlideRenderer` prop `hiddenId?: string`; `TextEditor({ elementId, caret })`. Editors carry `data-editor`.

- [ ] **Step 1: Shared text styling and placeholder** (decision S6-n). Replace `src/components/slide/elements/TextView.tsx`:

```tsx
import type { CSSProperties } from "react";
import type { ElementOf, TextStyle } from "@/lib/deck/schema";
import type { RenderVariant } from "./ElementView";

export function textCss(style: TextStyle): CSSProperties {
  return {
    fontSize: style.fontSize,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? "italic" : "normal",
    textAlign: style.align,
    color: style.color,
  };
}

export function TextView({ element, variant }: { element: ElementOf<"text">; variant: RenderVariant }) {
  const { role, content, style } = element.text;
  const blank = content.every((line) => line.trim() === "");

  return (
    <div className="h-full w-full overflow-hidden leading-tight break-words" style={textCss(style)}>
      {blank && variant === "canvas" ? (
        <p className="italic opacity-40">Empty text</p>
      ) : role === "bullets" ? (
        <ul className="flex list-disc flex-col gap-[0.4em] pl-[1.2em]">
          {content.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : (
        content.map((paragraph, i) => <p key={i}>{paragraph}</p>)
      )}
    </div>
  );
}
```

In `ElementView.tsx`: `return <TextView element={element} variant={variant} />;`

- [ ] **Step 2: Hide the element being edited** — in `SlideRenderer.tsx`, add a `hiddenId?: string` prop to `SlideRenderer`, pass `hidden={element.id === hiddenId}` to each `PositionedElement`, add `hidden: boolean` to its props, and add `visibility: hidden ? "hidden" : undefined` to its wrapper `style`.

- [ ] **Step 3: Text editor overlay** (decisions S6-a, S6-b, S6-c)

```tsx
// src/components/canvas/TextEditor.tsx
"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { textCss } from "@/components/slide/elements/TextView";
import { commitText } from "@/lib/content/actions";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore, type TextCaret } from "@/lib/ui/store";

const EDITOR_Z = 5000;
const FORMAT_KEYS = new Set(["b", "i", "u"]);

export function TextEditor({ elementId, caret }: { elementId: string; caret: TextCaret }) {
  const element = useDeckStore((s) => s.deck.elements[elementId]);
  const [initial] = useState(() => (element?.type === "text" ? element.text : null));
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    placeCaret(node, caret);
  }, [caret]);

  if (element?.type !== "text" || !initial) return null;
  const { box } = element;
  const lines = initial.content.length > 0 ? initial.content : [""];

  return (
    <div
      ref={ref}
      data-editor
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline
      aria-label="Edit text"
      className="absolute cursor-text leading-tight break-words outline-none select-text"
      style={{ ...textCss(element.text.style), left: box.x, top: box.y, width: box.w, minHeight: box.h, zIndex: EDITOR_Z }}
      onBlur={(event) => {
        commitText(elementId, readLines(event.currentTarget), event.currentTarget.offsetHeight);
        useUiStore.getState().setEditing(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if ((event.metaKey || event.ctrlKey) && FORMAT_KEYS.has(event.key.toLowerCase())) {
          event.preventDefault();
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
      }}
      onDrop={(event) => event.preventDefault()}
    >
      {initial.role === "bullets" ? (
        <ul className="flex list-disc flex-col gap-[0.4em] pl-[1.2em]">
          {lines.map((line, i) => (
            <li key={i}>{line || <br />}</li>
          ))}
        </ul>
      ) : (
        lines.map((line, i) => <div key={i}>{line || <br />}</div>)
      )}
    </div>
  );
}

function readLines(node: HTMLElement): string[] {
  const lines = node.innerText.replace(/\u00a0/g, " ").split("\n");
  while (lines.length > 1 && lines.at(-1)!.trim() === "") lines.pop();
  return lines;
}

function placeCaret(node: HTMLElement, caret: TextCaret): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  if (caret !== "all") {
    const point = caretPoint(caret.x, caret.y);
    if (point && node.contains(point.node)) {
      range.setStart(point.node, point.offset);
      range.collapse(true);
    } else {
      range.collapse(false);
    }
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function caretPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Partial<Pick<Document, "caretPositionFromPoint" | "caretRangeFromPoint">>;
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}
```

Notes for the implementer:
- The children are rendered from `initial` (frozen at mount), so React never touches the DOM the user is typing into, even when the element re-renders because populate moved its box.
- Paragraphs are `div`s in the editor (not `p`) because `innerText` puts one line break between `div`s but two between `p`s. Preflight zeroes `p` margins, so the two look the same.
- `document.execCommand("insertText")` is deprecated but is the only way to insert pasted text that keeps the browser's own undo working. If oxlint flags it, keep it and add a line-level disable.

- [ ] **Step 4: Canvas wiring** — replace `src/components/canvas/CanvasStage.tsx`:

```tsx
"use client";

import type { MouseEvent } from "react";
import { ArtboardViewport } from "@/components/canvas/ArtboardViewport";
import { SlideRenderer } from "@/components/slide/SlideRenderer";
import { startEditing } from "@/lib/content/actions";
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/deck/constants";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";
import { AiHighlightOverlay } from "./AiHighlightOverlay";
import { SelectionOverlay } from "./SelectionOverlay";
import { SlideFillOverlay } from "./SlideFillOverlay";
import { TextEditor } from "./TextEditor";
import { useCanvasGesture } from "./useCanvasGesture";

export function CanvasStage({ slideId }: { slideId: string }) {
  const previewBoxes = useUiStore((s) => s.dragPreview?.boxes);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const editing = useUiStore((s) => s.editing);
  const editingHere = useDeckStore((s) => !!editing && s.deck.elements[editing.elementId]?.slideId === slideId);
  const active = editingHere ? editing : null;
  const handlers = useCanvasGesture(slideId);

  return (
    <ArtboardViewport onBackgroundPointerDown={clearSelection}>
      <div
        className="relative touch-none select-none"
        style={{ width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT }}
        {...handlers}
        onDoubleClick={onDoubleClick}
      >
        <SlideRenderer
          slideId={slideId}
          previewBoxes={previewBoxes}
          hiddenId={active?.kind === "text" ? active.elementId : undefined}
        />
        {active?.kind === "text" && <TextEditor key={active.elementId} elementId={active.elementId} caret={active.caret} />}
        <AiHighlightOverlay slideId={slideId} />
        <SlideFillOverlay slideId={slideId} />
        <SelectionOverlay />
      </div>
    </ArtboardViewport>
  );
}

function onDoubleClick(event: MouseEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement;
  if (target.closest("[data-editor]")) return;
  const elementId = target.closest<HTMLElement>("[data-element-id]")?.dataset.elementId;
  if (!elementId) return;
  const cell = target.closest<HTMLElement>("[data-cell]")?.dataset.cell?.split(":").map(Number);
  startEditing(elementId, {
    caret: { x: event.clientX, y: event.clientY },
    ...(cell && { cell: { row: cell[0]!, col: cell[1]! } }),
  });
}
```

(The `data-cell` attribute arrives in Task 3; until then `cell` is always undefined.)

- [ ] **Step 5: Gesture and overlay** — in `useCanvasGesture.ts` `onPointerDown`, right after `event.stopPropagation();`:

```ts
    const target = event.target as HTMLElement;
    if (target.closest("[data-editor]")) return;
    if (useUiStore.getState().editing) (document.activeElement as HTMLElement | null)?.blur();
```

and delete the later `const target = event.target as HTMLElement;` line. Blurring first commits the edit (the editor's `onBlur`) before the gesture reads the deck.

In `SelectionOverlay.tsx`, read `const editing = useUiStore((s) => s.editing !== null);` and render handles only when `boxes.length === 1 && !editing`.

- [ ] **Step 6: Enter starts editing** — in `useEditorShortcuts.ts`, after the Escape branch:

```ts
      if (event.key === "Enter") {
        const id = singleSelectedId();
        if (id && !(event.target instanceof HTMLButtonElement)) {
          event.preventDefault();
          startEditing(id);
        }
        return;
      }
```

Import `singleSelectedId` from `@/lib/canvas/actions` and `startEditing` from `@/lib/content/actions`. The button check keeps Enter on a focused button (a thumbnail, a toolbar button) doing what that button does.

- [ ] **Step 7: Verify** — `npm run typecheck` and `npm run lint` pass; run checklist items 1–7.

- [ ] **Step 8: Commit** — `git commit -m "feat(canvas): edit text in place with caret placement, auto-grow, and one undo step per edit"`

---

### Task 3: Table cell editing

**Files:**
- Create: `src/components/canvas/TableCellEditor.tsx`
- Modify: `src/components/slide/elements/TableView.tsx`, `src/components/canvas/CanvasStage.tsx`

**Interfaces:**
- Consumes: `CellEditing`, `setEditing` (UI store); `commitCell`, `editTableStructure` (content actions); `tableSize`.
- Produces: `TableCellEditor({ editing })`; cells carry `data-cell="row:col"`.

- [ ] **Step 1: Cell addresses** — in `TableView.tsx`, add `data-cell={`${r}:${c}`}` to each `<td>`.

- [ ] **Step 2: Cell editor** (decision S6-e)

```tsx
// src/components/canvas/TableCellEditor.tsx
"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { commitCell, editTableStructure } from "@/lib/content/actions";
import { tableSize } from "@/lib/content/tableData";
import { ARTBOARD_WIDTH } from "@/lib/deck/constants";
import type { Box } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore, type CellEditing } from "@/lib/ui/store";

const EDITOR_Z = 5000;

export function TableCellEditor({ editing }: { editing: CellEditing }) {
  const { elementId, row, col, txnId } = editing;
  const element = useDeckStore((s) => s.deck.elements[elementId]);
  const table = element?.type === "table" ? element.table : null;
  const [initial] = useState(() => table?.rows[row]?.[col] ?? "");
  const [rect, setRect] = useState<Box | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useLayoutEffect(() => {
    const stage = ref.current?.parentElement;
    const cell = stage?.querySelector(`[data-element-id="${elementId}"] [data-cell="${row}:${col}"]`);
    if (!stage || !cell) return;
    const s = stage.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    const scale = s.width / ARTBOARD_WIDTH;
    setRect({ x: (c.left - s.left) / scale, y: (c.top - s.top) / scale, w: c.width / scale, h: c.height / scale });
  }, [elementId, row, col, element]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, []);

  if (!table) return null;
  const size = tableSize(table.rows);
  const header = table.headerRow && row === 0;

  function commit() {
    if (committed.current || !ref.current) return;
    committed.current = true;
    commitCell(elementId, row, col, ref.current.value, txnId);
  }

  function moveTo(nextRow: number, nextCol: number) {
    commit();
    useUiStore.getState().setEditing({ kind: "cell", elementId, row: nextRow, col: nextCol, txnId });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (row + 1 < size.rows) moveTo(row + 1, col);
      else event.currentTarget.blur();
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    const index = row * size.cols + col + (event.shiftKey ? -1 : 1);
    if (index < 0) return;
    if (index >= size.rows * size.cols) {
      commit();
      editTableStructure(elementId, "add-row", txnId);
      moveTo(size.rows, 0);
      return;
    }
    moveTo(Math.floor(index / size.cols), index % size.cols);
  }

  return (
    <input
      ref={ref}
      data-editor
      defaultValue={initial}
      aria-label={`Row ${row + 1}, column ${col + 1}`}
      className={`absolute border-0 px-4 py-2 text-[22px] outline-solid outline-accent select-text ${
        header ? "bg-indigo-50 font-semibold text-slate-900" : "bg-white text-slate-700"
      }`}
      style={{
        zIndex: EDITOR_Z,
        outlineWidth: "calc(2px / var(--artboard-scale))",
        ...(rect ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : { opacity: 0 }),
      }}
      onKeyDown={onKeyDown}
      onBlur={() => {
        commit();
        const ui = useUiStore.getState();
        if (ui.editing === editing) ui.setEditing(null);
      }}
    />
  );
}
```

Notes:
- The cell lookup is scoped to the stage (`parentElement`), because thumbnails render the same `data-element-id`, and the filmstrip comes first in the DOM.
- When the editor moves to another cell, it remounts (keyed by cell). `committed` makes the commit happen once even if the browser fires `blur` while the old input is removed, and `ui.editing === editing` keeps that late blur from ending the new cell's session.
- Tab in the last cell: `add-row` appends after the last row, inside the same `txnId`.

- [ ] **Step 3: Render it** — in `CanvasStage`, import `TableCellEditor` and add, after the `TextEditor` line:

```tsx
        {active?.kind === "cell" && (
          <TableCellEditor key={`${active.elementId}:${active.row}:${active.col}`} editing={active} />
        )}
```

- [ ] **Step 4: Verify** — `npm run typecheck` and `npm run lint` pass; run checklist items 8–12 (item 12 tests the Task 1 guard).

- [ ] **Step 5: Commit** — `git commit -m "feat(canvas): edit table cells in place with Enter and Tab navigation"`

---

### Task 4: Chat / Format tabs and the table inspector

**Files:**
- Create: `src/components/shell/RightPanel.tsx`, `src/components/inspector/fields.tsx`, `src/components/inspector/Inspector.tsx`, `src/components/inspector/TableInspector.tsx`
- Modify: `src/components/chat/ChatPanel.tsx`, `src/components/chat/ChatTranscript.tsx`, `src/components/shell/EditorShell.tsx`, `src/components/shell/SelectionToolbar.tsx`

**Interfaces:**
- Consumes: `rightPanel`, `setRightPanel` (UI store); `editElement`, `editTableStructure`; `tableSize`; `useSelectedIds`; `selectRunning`.
- Produces: `RightPanel`; `Inspector`; from `fields.tsx`: `smallButtonClass`, `useEditSession()`, `Section`, `Field`, `Hint`, `TextInput`, `NumberInput`, `ColorInput`, `Segmented`. Change callbacks have the shape `(value: T, txnId?: string) => void`.

- [ ] **Step 1: Shared fields** (decision S6-h)

```tsx
// src/components/inspector/fields.tsx
"use client";

import { useRef, useState, type ReactNode } from "react";

const inputClass =
  "w-full rounded border border-chrome-border px-2 py-1 text-sm text-zinc-800 outline-none focus:border-accent disabled:bg-zinc-50 disabled:text-zinc-400";
export const smallButtonClass =
  "rounded border border-chrome-border px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent";

type Change<T> = (value: T, txnId?: string) => void;

/** Edits made while one field keeps focus share a txnId, so they undo as one step. */
export function useEditSession() {
  const txnId = useRef("");
  return {
    begin: () => {
      txnId.current = crypto.randomUUID();
    },
    txnId: () => (txnId.current ||= crypto.randomUUID()),
  };
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-chrome-border px-4 py-4">
      <h3 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 text-xs text-zinc-500">{children}</p>;
}

export function TextInput({
  value,
  onChange,
  ariaLabel,
  disabled,
  className = inputClass,
}: {
  value: string;
  onChange: Change<string>;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const session = useEditSession();
  return (
    <input
      type="text"
      value={value}
      aria-label={ariaLabel}
      disabled={disabled}
      className={className}
      onFocus={session.begin}
      onChange={(event) => onChange(event.target.value, session.txnId())}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function parseNumber(text: string, min = -Infinity, max = Infinity): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function NumberInput({
  value,
  onChange,
  ariaLabel,
  min,
  max,
  className = inputClass,
}: {
  value: number;
  onChange: Change<number>;
  ariaLabel: string;
  min?: number;
  max?: number;
  className?: string;
}) {
  const session = useEditSession();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft ?? String(value)}
      aria-label={ariaLabel}
      className={className}
      onFocus={() => {
        session.begin();
        setDraft(String(value));
      }}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const parsed = parseNumber(text, min, max);
        if (parsed !== null && parsed !== value) onChange(parsed, session.txnId());
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function toHex6(color: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#000000";
}

export function ColorInput({
  value,
  onChange,
  ariaLabel,
  className = "h-8 w-10",
}: {
  value: string;
  onChange: Change<string>;
  ariaLabel: string;
  className?: string;
}) {
  const session = useEditSession();
  return (
    <input
      type="color"
      value={toHex6(value)}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`${className} shrink-0 cursor-pointer rounded border border-chrome-border bg-white p-0.5`}
      onFocus={session.begin}
      onChange={(event) => onChange(event.target.value, session.txnId())}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex rounded border border-chrome-border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          className={`flex-1 rounded px-2 py-1 text-xs ${
            option.value === value ? "bg-accent text-white" : "text-zinc-700 hover:bg-zinc-100"
          }`}
          onClick={() => {
            if (option.value !== value) onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

`Field` is a `div`, not a `label`: a `label` wrapping a group of buttons would forward clicks on its text to the first button. Each control has its own `aria-label`.

- [ ] **Step 2: Table inspector** (decision S6-j)

```tsx
// src/components/inspector/TableInspector.tsx
"use client";

import { editElement, editTableStructure } from "@/lib/content/actions";
import { tableSize } from "@/lib/content/tableData";
import type { ElementOf } from "@/lib/deck/schema";
import { Hint, Section, smallButtonClass } from "./fields";

export function TableInspector({ element }: { element: ElementOf<"table"> }) {
  const { id, table } = element;
  const size = tableSize(table.rows);

  return (
    <>
      <Section title="Table">
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="accent-accent"
            checked={table.headerRow}
            onChange={(event) => editElement(id, { table: { headerRow: event.target.checked } }, "Format table")}
          />
          Header row
        </label>
        <p className="text-xs text-zinc-500 tabular-nums">
          {size.rows} {size.rows === 1 ? "row" : "rows"} × {size.cols} {size.cols === 1 ? "column" : "columns"}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={smallButtonClass} onClick={() => editTableStructure(id, "add-row")}>
            Add row
          </button>
          <button type="button" className={smallButtonClass} disabled={size.rows <= 1} onClick={() => editTableStructure(id, "delete-row")}>
            Delete row
          </button>
          <button type="button" className={smallButtonClass} onClick={() => editTableStructure(id, "add-column")}>
            Add column
          </button>
          <button type="button" className={smallButtonClass} disabled={size.cols <= 1} onClick={() => editTableStructure(id, "delete-column")}>
            Delete column
          </button>
        </div>
        <p className="text-xs text-zinc-500">Rows are added and removed at the bottom, columns at the right.</p>
      </Section>
      <Hint>Double-click a cell on the slide to edit it. Enter moves down, Tab moves right, and Tab in the last cell adds a row.</Hint>
    </>
  );
}
```

- [ ] **Step 3: Inspector switch** (decision S6-g)

```tsx
// src/components/inspector/Inspector.tsx
"use client";

import { useDeckStore } from "@/lib/deck/store";
import { useSelectedIds } from "@/lib/ui/useSelectedIds";
import { Hint } from "./fields";
import { TableInspector } from "./TableInspector";

export function Inspector() {
  const ids = useSelectedIds();
  const element = useDeckStore((s) => (ids.length === 1 ? s.deck.elements[ids[0]!] : undefined));

  if (ids.length === 0) return <Hint>Select an element on the slide to format it.</Hint>;
  if (!element) return <Hint>{ids.length} elements selected. Select one element to format it.</Hint>;

  switch (element.type) {
    case "text":
      return <Hint>Double-click the text on the slide, or press Enter, to edit it.</Hint>;
    case "table":
      return <TableInspector key={element.id} element={element} />;
    default:
      return <Hint>Nothing to format for this element yet.</Hint>;
  }
}
```

Tasks 5 and 6 add the `chart` and `image` cases; `default` stays for shapes. `key={element.id}` resets field drafts and edit sessions when the selection moves to another element.

- [ ] **Step 4: Right panel with tabs** (decision S6-f)

```tsx
// src/components/shell/RightPanel.tsx
"use client";

import { useEffect, type ReactNode } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Inspector } from "@/components/inspector/Inspector";
import { selectRunning, useChatStore } from "@/lib/chat/store";
import { useUiStore, type RightPanelTab } from "@/lib/ui/store";

export function RightPanel() {
  const tab = useUiStore((s) => s.rightPanel);
  const setRightPanel = useUiStore((s) => s.setRightPanel);
  const running = useChatStore(selectRunning);

  useEffect(() => {
    if (running) setRightPanel("chat");
  }, [running, setRightPanel]);

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-chrome-border bg-white">
      <div role="tablist" aria-label="Side panel" className="flex border-b border-chrome-border px-2">
        <TabButton tab="chat" current={tab} onSelect={setRightPanel}>
          Chat
          {running && tab !== "chat" && (
            <span className="ml-1.5 inline-block size-1.5 animate-pulse rounded-full bg-accent" aria-label="AI is replying" />
          )}
        </TabButton>
        <TabButton tab="format" current={tab} onSelect={setRightPanel}>
          Format
        </TabButton>
      </div>
      <div role="tabpanel" id="panel-chat" aria-labelledby="tab-chat" hidden={tab !== "chat"} className="flex min-h-0 flex-1 flex-col">
        <ChatPanel />
      </div>
      <div role="tabpanel" id="panel-format" aria-labelledby="tab-format" hidden={tab !== "format"} className="min-h-0 flex-1 overflow-y-auto">
        <Inspector />
      </div>
    </aside>
  );
}

function TabButton({
  tab,
  current,
  onSelect,
  children,
}: {
  tab: RightPanelTab;
  current: RightPanelTab;
  onSelect: (tab: RightPanelTab) => void;
  children: ReactNode;
}) {
  const selected = tab === current;
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${tab}`}
      aria-controls={`panel-${tab}`}
      aria-selected={selected}
      onClick={() => onSelect(tab)}
      className={`-mb-px flex items-center border-b-2 px-3 py-3 text-xs font-medium tracking-wide uppercase ${
        selected ? "border-accent text-accent" : "border-transparent text-zinc-500 hover:text-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
```

Tailwind 4's preflight hides `[hidden]` with `!important`, so `hidden` wins over the `flex` class. The chat stays mounted on the hidden tab.

- [ ] **Step 5: Chat panel becomes the tab body** — replace `src/components/chat/ChatPanel.tsx`:

```tsx
"use client";

import { ChatComposer } from "./ChatComposer";
import { ChatTranscript } from "./ChatTranscript";

export function ChatPanel() {
  return (
    <>
      <ChatTranscript />
      <ChatComposer />
    </>
  );
}
```

In `ChatTranscript`, import `useUiStore` and scroll to the end again when the tab is shown (scrolling does nothing while it's hidden):

```tsx
  const visible = useUiStore((s) => s.rightPanel === "chat");

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items, running, visible]);
```

- [ ] **Step 6: Shell and Format button** — in `EditorShell.tsx`, replace `import { ChatPanel }` and `<ChatPanel />` with `RightPanel` from `./RightPanel`. In `SelectionToolbar.tsx`, before Forward:

```tsx
      {count === 1 && (
        <button type="button" className={buttonClass} title="Format the selected element" onClick={() => useUiStore.getState().setRightPanel("format")}>
          Format
        </button>
      )}
```

(import `useUiStore` from `@/lib/ui/store`).

- [ ] **Step 7: Verify** — `npm run typecheck` and `npm run lint` pass; run checklist items 13–15.

- [ ] **Step 8: Commit** — `git commit -m "feat(inspector): chat and format tabs with the table panel"`

---

### Task 5: Chart inspector

**Files:**
- Create: `src/components/inspector/ChartInspector.tsx`
- Modify: `src/components/inspector/Inspector.tsx`, `src/components/slide/elements/ChartView.tsx`

**Interfaces:**
- Consumes: chart data helpers (Task 1); fields (Task 4); `editElement`; `CHART_PALETTE`.
- Produces: `ChartInspector({ element })`.

- [ ] **Step 1: Index-based series keys** (decision S6-i) — in `ChartView.tsx`, `CartesianChartView`:

```tsx
  const data = chart.categories.map((category, i) => ({
    category,
    ...Object.fromEntries(chart.series.map((s, j) => [`s${j}`, s.data[i] ?? 0])),
  }));
```

and in each of the `Line`, `Area`, and `Bar` maps, use `key={i}`, `dataKey={`s${i}`}`, and `name={s.name}` (the legend and tooltip read `name`). `PieChartView` is unchanged.

- [ ] **Step 2: Chart inspector**

```tsx
// src/components/inspector/ChartInspector.tsx
"use client";

import { editElement } from "@/lib/content/actions";
import {
  addCategory,
  addSeries,
  removeCategory,
  removeSeries,
  setCategory,
  setSeriesColor,
  setSeriesName,
  setValue,
} from "@/lib/content/chartData";
import { CHART_PALETTE } from "@/lib/deck/constants";
import type { ChartKind, ChartPayload, ElementOf } from "@/lib/deck/schema";
import { ColorInput, Field, NumberInput, Section, Segmented, smallButtonClass, TextInput } from "./fields";

const KINDS: { value: ChartKind; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "pie", label: "Pie" },
  { value: "area", label: "Area" },
  { value: "stacked-bar", label: "Stacked" },
];

const cellClass =
  "w-20 rounded border border-chrome-border px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-accent";

type ChartChange = (patch: Partial<ChartPayload>, txnId?: string) => void;

export function ChartInspector({ element }: { element: ElementOf<"chart"> }) {
  const { id, chart } = element;
  const edit: ChartChange = (patch, txnId) => editElement(id, { chart: patch }, "Edit chart", txnId);
  const pie = chart.kind === "pie";

  return (
    <>
      <Section title="Chart">
        <Field label="Title">
          <TextInput ariaLabel="Chart title" value={chart.title} onChange={(title, txnId) => edit({ title }, txnId)} />
        </Field>
        <Field label="Type">
          <Segmented ariaLabel="Chart type" value={chart.kind} options={KINDS} onChange={(kind) => edit({ kind })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="accent-accent"
            checked={chart.showLegend}
            onChange={(event) => edit({ showLegend: event.target.checked })}
          />
          Show legend
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X axis label">
            <TextInput ariaLabel="X axis label" value={chart.xLabel ?? ""} disabled={pie} onChange={(xLabel, txnId) => edit({ xLabel }, txnId)} />
          </Field>
          <Field label="Y axis label">
            <TextInput ariaLabel="Y axis label" value={chart.yLabel ?? ""} disabled={pie} onChange={(yLabel, txnId) => edit({ yLabel }, txnId)} />
          </Field>
        </div>
        {pie && (
          <p className="text-xs text-zinc-500">
            Pie charts show only the first series and no axes. The other series and the axis labels are kept for when you switch back.
          </p>
        )}
      </Section>
      <Section title="Data">
        <DataGrid chart={chart} onChange={edit} />
      </Section>
    </>
  );
}

function DataGrid({ chart, onChange }: { chart: ChartPayload; onChange: ChartChange }) {
  const { categories, series } = chart;
  const seriesLabel = (j: number) => series[j]?.name || `Series ${j + 1}`;
  const categoryLabel = (i: number) => categories[i] || `row ${i + 1}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="text-left font-medium text-zinc-500">Category</th>
              {series.map((s, j) => (
                <th key={j} className="font-normal">
                  <div className="flex items-center gap-1">
                    <ColorInput
                      ariaLabel={`${seriesLabel(j)} color`}
                      className="h-6 w-7"
                      value={s.color ?? CHART_PALETTE[j % CHART_PALETTE.length]!}
                      onChange={(color, txnId) => onChange(setSeriesColor(chart, j, color), txnId)}
                    />
                    <TextInput
                      ariaLabel={`Series ${j + 1} name`}
                      className={cellClass}
                      value={s.name}
                      onChange={(name, txnId) => onChange(setSeriesName(chart, j, name), txnId)}
                    />
                    <RemoveButton label={`Remove ${seriesLabel(j)}`} disabled={series.length <= 1} onClick={() => onChange(removeSeries(chart, j))} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((category, i) => (
              <tr key={i}>
                <td>
                  <div className="flex items-center gap-1">
                    <RemoveButton label={`Remove ${categoryLabel(i)}`} disabled={categories.length <= 1} onClick={() => onChange(removeCategory(chart, i))} />
                    <TextInput
                      ariaLabel={`Category ${i + 1}`}
                      className={cellClass}
                      value={category}
                      onChange={(name, txnId) => onChange(setCategory(chart, i, name), txnId)}
                    />
                  </div>
                </td>
                {series.map((s, j) => (
                  <td key={j}>
                    <NumberInput
                      ariaLabel={`${seriesLabel(j)}, ${categoryLabel(i)}`}
                      className={cellClass}
                      value={s.data[i] ?? 0}
                      onChange={(value, txnId) => onChange(setValue(chart, j, i, value), txnId)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button type="button" className={smallButtonClass} onClick={() => onChange(addCategory(chart))}>
          + Category
        </button>
        <button type="button" className={smallButtonClass} onClick={() => onChange(addSeries(chart))}>
          + Series
        </button>
      </div>
    </div>
  );
}

function RemoveButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded px-1 text-zinc-400 hover:text-red-600 disabled:invisible"
    >
      ×
    </button>
  );
}
```

- [ ] **Step 3: Wire it** — in `Inspector.tsx`, add `case "chart": return <ChartInspector key={element.id} element={element} />;`.

- [ ] **Step 4: Verify** — `npm run typecheck` and `npm run lint` pass; run checklist items 16–20.

- [ ] **Step 5: Commit** — `git commit -m "feat(inspector): chart data grid, type, legend, axes, and series colors"`

---

### Task 6: Insert toolbar, image upload, and replace image

**Files:**
- Create: `src/lib/content/image.ts`, `src/lib/content/insert.ts`, `src/components/insert/ImagePickerButton.tsx`, `src/components/insert/InsertToolbar.tsx`, `src/components/inspector/ImageInspector.tsx`
- Modify: `src/lib/content/actions.ts`, `src/components/inspector/Inspector.tsx`, `src/components/shell/EditorShell.tsx`

**Interfaces:**
- Consumes: `textStyle` from `@/lib/agent/placement`; `translateBox` from `@/lib/canvas/geometry`; `resolveCurrentSlideId`; `editElement`; fields.
- Produces: `type PickedImage = { src: string; alt: string; width: number; height: number }`, `readImageFile(file: File): Promise<PickedImage>`; `type InsertKind = "text" | "chart" | "table" | "rect" | "ellipse" | "line"`, `defaultElement(kind)`, `imageElement(image)`, `insertElement(element, label): string | null`, `insertDefault(kind)`, `insertImage(image)`; `replaceImage(id, image)`; `ImagePickerButton`, `InsertToolbar`, `ImageInspector`.

- [ ] **Step 1: Reading an image file** (decision S6-l)

```ts
// src/lib/content/image.ts
export type PickedImage = { src: string; alt: string; width: number; height: number };

const MAX_BYTES = 10 * 1024 * 1024;
const REENCODE_BYTES = 1.5 * 1024 * 1024;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;
const KEEP_AS_IS = new Set(["image/svg+xml", "image/gif"]);
const FALLBACK_SIZE = { width: 800, height: 500 };

export async function readImageFile(file: File): Promise<PickedImage> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  if (file.size > MAX_BYTES) throw new Error("Images must be 10 MB or smaller.");

  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  const width = img.naturalWidth || FALLBACK_SIZE.width;
  const height = img.naturalHeight || FALLBACK_SIZE.height;
  const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Uploaded image";
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

  if (KEEP_AS_IS.has(file.type) || (scale === 1 && file.size <= REENCODE_BYTES)) {
    return { src: original, alt, width, height };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Couldn't read that image.");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  return { src: canvas.toDataURL(type, JPEG_QUALITY), alt, width: canvas.width, height: canvas.height };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = src;
  });
}
```

- [ ] **Step 2: Inserting elements** (decision S6-k)

```ts
// src/lib/content/insert.ts
import { textStyle } from "@/lib/agent/placement";
import { translateBox } from "@/lib/canvas/geometry";
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/deck/constants";
import type { NewElement } from "@/lib/deck/ops";
import type { Box } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { resolveCurrentSlideId, useUiStore } from "@/lib/ui/store";
import type { PickedImage } from "./image";

export type InsertKind = "text" | "chart" | "table" | "rect" | "ellipse" | "line";

const CASCADE_STEP = 20;
const CASCADE_TRIES = 10;
const IMAGE_MAX = { w: 800, h: 500 };
const SHAPE_FILL = "#e0e7ff";
const LINE_COLOR = "#334155";

const INSERT_LABEL: Record<InsertKind, string> = {
  text: "Insert text",
  chart: "Insert chart",
  table: "Insert table",
  rect: "Insert rectangle",
  ellipse: "Insert ellipse",
  line: "Insert line",
};

function centered(w: number, h: number): Box {
  return { x: Math.round((ARTBOARD_WIDTH - w) / 2), y: Math.round((ARTBOARD_HEIGHT - h) / 2), w, h };
}

export function defaultElement(kind: InsertKind): NewElement {
  switch (kind) {
    case "text":
      return { type: "text", box: centered(640, 120), text: { role: "body", content: ["New text"], style: textStyle("body") } };
    case "chart":
      return {
        type: "chart",
        box: centered(960, 540),
        chart: {
          kind: "bar",
          title: "Chart title",
          categories: ["Q1", "Q2", "Q3", "Q4"],
          series: [{ name: "Series 1", data: [4, 6, 5, 8] }],
          showLegend: false,
        },
      };
    case "table":
      return {
        type: "table",
        box: centered(960, 240),
        table: { headerRow: true, rows: [["Column 1", "Column 2", "Column 3"], ["", "", ""], ["", "", ""]] },
      };
    case "rect":
      return { type: "shape", box: centered(320, 200), shape: { kind: "rect", fill: SHAPE_FILL } };
    case "ellipse":
      return { type: "shape", box: centered(240, 240), shape: { kind: "ellipse", fill: SHAPE_FILL } };
    case "line":
      return { type: "shape", box: centered(480, 20), shape: { kind: "line", fill: LINE_COLOR } };
  }
}

export function imageElement(image: PickedImage): NewElement {
  const scale = Math.min(1, IMAGE_MAX.w / image.width, IMAGE_MAX.h / image.height);
  return {
    type: "image",
    box: centered(Math.round(image.width * scale), Math.round(image.height * scale)),
    image: { src: image.src, alt: image.alt, fit: "cover" },
  };
}

export function insertElement(element: NewElement, label: string): string | null {
  const { deck, applyOps } = useDeckStore.getState();
  const slideId = resolveCurrentSlideId(deck, useUiStore.getState().currentSlideId);
  if (!slideId) return null;
  const taken = (deck.slides[slideId]?.elementOrder ?? []).flatMap((id) => {
    const box = deck.elements[id]?.box;
    return box ? [box] : [];
  });
  let box = element.box;
  for (let i = 0; i < CASCADE_TRIES && taken.some((b) => b.x === box.x && b.y === box.y); i++) {
    box = translateBox(box, CASCADE_STEP, CASCADE_STEP);
  }
  const [result] = applyOps([{ op: "add_element", slideId, element: { ...element, box } }], { source: "user", label });
  if (!result?.ok || !result.id) return null;
  useUiStore.getState().setSelection([result.id]);
  return result.id;
}

export function insertDefault(kind: InsertKind): void {
  const id = insertElement(defaultElement(kind), INSERT_LABEL[kind]);
  if (id && (kind === "chart" || kind === "table")) useUiStore.getState().setRightPanel("format");
}

export function insertImage(image: PickedImage): void {
  insertElement(imageElement(image), "Insert image");
}
```

If TypeScript rejects `{ ...element, box }` as a `NewElement` (spreading a union), write it as `Object.assign({}, element, { box })`. Check `translateBox` in `src/lib/canvas/geometry.ts` takes `(box, dx, dy)` (it's used that way in `canvas/actions.ts`).

- [ ] **Step 3: Replace image** (decision S6-m) — append to `src/lib/content/actions.ts`:

```ts
export function replaceImage(id: string, image: PickedImage): void {
  if (!getElement(id, "image")) return;
  editElement(id, { image: { src: image.src, alt: image.alt } }, "Replace image");
}
```

with `import type { PickedImage } from "./image";`.

- [ ] **Step 4: Picker button**

```tsx
// src/components/insert/ImagePickerButton.tsx
"use client";

import { useRef, useState } from "react";
import { readImageFile, type PickedImage } from "@/lib/content/image";

export function ImagePickerButton({
  label,
  title,
  className,
  onPicked,
}: {
  label: string;
  title: string;
  className: string;
  onPicked: (image: PickedImage) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button type="button" className={className} title={title} onClick={() => inputRef.current?.click()}>
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          setError(null);
          if (!file) return;
          try {
            onPicked(await readImageFile(file));
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Couldn't read that image.");
          }
        }}
      />
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </>
  );
}
```

Resetting `event.target.value` lets the user pick the same file twice in a row.

- [ ] **Step 5: Insert toolbar**

```tsx
// src/components/insert/InsertToolbar.tsx
"use client";

import { insertDefault, insertImage, type InsertKind } from "@/lib/content/insert";
import { ImagePickerButton } from "./ImagePickerButton";

const buttonClass = "rounded px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100";

const ITEMS: { kind: InsertKind; label: string }[] = [
  { kind: "text", label: "Text" },
  { kind: "chart", label: "Chart" },
  { kind: "table", label: "Table" },
  { kind: "rect", label: "Rectangle" },
  { kind: "ellipse", label: "Ellipse" },
  { kind: "line", label: "Line" },
];

export function InsertToolbar() {
  return (
    <div role="toolbar" aria-label="Insert" className="flex h-10 shrink-0 items-center gap-0.5 border-b border-chrome-border bg-white px-3">
      <span className="mr-1 text-xs font-medium tracking-wide text-zinc-500 uppercase">Insert</span>
      {ITEMS.map((item) => (
        <button key={item.kind} type="button" className={buttonClass} onClick={() => insertDefault(item.kind)}>
          {item.label}
        </button>
      ))}
      <ImagePickerButton label="Image" title="Upload an image from your computer" className={buttonClass} onPicked={insertImage} />
    </div>
  );
}
```

- [ ] **Step 6: Image inspector**

```tsx
// src/components/inspector/ImageInspector.tsx
"use client";

import { ImagePickerButton } from "@/components/insert/ImagePickerButton";
import { replaceImage } from "@/lib/content/actions";
import type { ElementOf } from "@/lib/deck/schema";
import { Section, smallButtonClass } from "./fields";

export function ImageInspector({ element }: { element: ElementOf<"image"> }) {
  return (
    <Section title="Image">
      <div className="flex flex-wrap items-center gap-2">
        <ImagePickerButton
          label="Replace image…"
          title="Choose another image; the size and position stay"
          className={smallButtonClass}
          onPicked={(picked) => replaceImage(element.id, picked)}
        />
      </div>
    </Section>
  );
}
```

In `Inspector.tsx`, add `case "image": return <ImageInspector key={element.id} element={element} />;`.

- [ ] **Step 7: Shell** — in `EditorShell.tsx`, import `InsertToolbar` from `@/components/insert/InsertToolbar` and change the slide branch of `CanvasArea`:

```tsx
function CanvasArea() {
  const slideId = useCurrentSlideId();
  const planning = useGenerationStore((s) => s.phase === "planning");
  if (!slideId) return planning ? <PlanningState /> : <EmptyDeck />;
  return (
    <div className="flex h-full flex-col">
      <InsertToolbar />
      <div className="min-h-0 flex-1">
        <CanvasStage slideId={slideId} />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Verify** — `npm run typecheck` and `npm run lint` pass; run checklist items 21–27.

- [ ] **Step 9: Commit** — `git commit -m "feat(insert): insert toolbar, image upload with downscaling, and replace image"`

---

### Task 7: Walk the checklist, update the design doc, and hand off

- [ ] **Step 1:** Run the full checklist below in the browser and fix anything that fails.
- [ ] **Step 2:** `npm run typecheck` and `npm run lint` are clean.
- [ ] **Step 3:** Update `docs/superpowers/specs/2026-10-23-ai-presentation-builder-design.md` with the decisions you accepted:
  - Section 4, `useUiStore` line: "current slide, selection, drag preview, AI highlights, editing (text element or table cell), right-panel tab, chat state. Never in history."
  - Section 5.4, add a bullet: "While the user edits an element, tool calls that target it (or delete its slide) fail with 'The user is editing eN right now…' and the canvas doesn't follow the AI."
  - Section 6, replace the "Editing" bullet with: "Editing: double-click text (or Enter) → a `contentEditable` overlay styled like the element, with the element hidden underneath. Plain-text paste, one block per paragraph/bullet, grows the box on commit, one undo step. Double-click a table cell → an input over the cell, with Enter moving down, Tab/Shift+Tab moving across, and Tab in the last cell adding a row; one undo step per table session. Charts (data, type, legend, axes), table rows and columns (at the bottom/right), and image replacement live in the Format tab next to Chat. Its fields apply live, one undo step per focused field."
  - Section 6, replace the "Insert toolbar" bullet with: "Insert toolbar above the canvas: text, image (file picker; downscaled to 1600 px and stored as a data URL), chart (sample bar), table (3×3), rectangle, ellipse, line. Inserted centered (offset 20/20 if that spot is taken), default size, auto-selected. Replace image in the Format tab."
- [ ] **Step 4:** Commit: `git commit -m "docs: stage 6 decisions"` (plus `fix(content): stage 6 checklist fixes` first if there were fixes).

---

## Stage 6 manual checklist (for you)

Run `npm run dev` (with `NODE_USE_SYSTEM_CA=1` exported), open http://localhost:3000, and click "load the sample deck".

**Text (Task 2)**

1. On slide 2, double-click in the middle of a bullet: the caret lands where you clicked, the resize handles disappear, and the selection outline stays. Type a few words, then click empty canvas: the text is saved, the thumbnail updates, and the Undo tooltip reads "Undo: Edit text". ⌘Z restores the old text in one step.
2. Double-click the bullets again, put the caret at the end of the last bullet, and press Enter: a new bullet appears. Type "Launch partner portal" and press Escape: editing ends, the element stays selected, and there are 5 bullets.
3. Select the title on slide 2 and press Enter: all of its text is selected. Type a new title and click another element: it saves, and the filmstrip label (slide title metadata, S3-h) does not change.
4. Edit a text box and type until the text runs past the bottom: the editor grows while you type, and after committing, the box is tall enough (the selection outline shows the new height). Enter and leave a text box without changing anything: no new undo entry.
5. Copy some formatted text from a web page and paste it into a text box: it arrives as plain text in the box's own style. ⌘B while editing does nothing. While typing, Backspace, Delete, and arrows edit text only (no element deleted, no slide change), and ⌘Z undoes typing inside the box.
6. Edit a text box, delete all the text, and click away: the canvas shows a faint "Empty text"; the thumbnail shows nothing. Double-click it to type again.
7. Start editing a text box, then click a different thumbnail: the edit is saved before the slide changes.

**Tables (Task 3)**

8. On slide 4, double-click the "Pro" cell: an input over the cell has its text selected. Type "Team" and press Tab: the next cell ("Enterprise") is selected for editing. Shift+Tab goes back. Press Enter: you move down one row.
9. Edit a few cells with Tab/Enter, then press Escape: the Undo tooltip reads "Undo: Edit table", and one ⌘Z reverts all of those cell edits.
10. Double-click the last cell ("Dedicated") and press Tab: a new empty row appears below, the table box grows by one row, and the first cell of the new row is being edited. ⌘Z after leaving removes the row and the edits together.
11. Edit a header cell: the input is bold on the indigo header background. Edit a cell, then drag the table by its edge: the edit is saved first, and the drag works.
**AI guard (Task 1)**

12. Clicking the chat box ends any edit, so test the guard from the console. Stay on slide 1 so no editor is on screen, and run `uiStore.getState().setEditing({ kind: "text", elementId: "<id of the slide 2 bullets>", caret: "all" })`. Send "make slide 2 more concise" in chat: the reply shows a ✗ receipt "The user is editing … right now" for the bullets, any other changes apply, and the canvas stays on slide 1. Run `uiStore.getState().setEditing(null)` afterwards.

**Format tab (Task 4)**

13. The right panel has Chat and Format tabs. Select the table on slide 4 and click **Format** in the top selection toolbar: the Format tab shows the Table section. Selecting alone, without clicking Format, does not switch tabs. Untick Header row: the first row loses its header styling, and one ⌘Z brings it back.
14. With Format open, select the bullets on slide 2: a hint says to double-click or press Enter. Select the ellipse on slide 5: "Nothing to format for this element yet." Select two elements: "2 elements selected. Select one element to format it." Click empty canvas: "Select an element on the slide to format it."
15. Ask the AI something in Chat and switch to Format while it replies: the Chat tab shows a pulsing dot. Switch back: the transcript is scrolled to the latest message. With Format open, click New deck and generate from the canvas prompt box: the Chat tab comes to the front by itself.

**Charts (Task 5)**

16. On slide 3, double-click the chart: the Format tab opens with Chart and Data sections. Change the title: the chart title updates live.
17. Change the 2026 / Q3 value to 4.2: the bar updates. Type "4." along the way: nothing breaks; blur shows 4.2. One ⌘Z reverts the value edit. Type "abc" into a value: nothing changes, and on blur the field shows the stored value again.
18. Click "+ Category": a row "Item 5" with 0s appears and the chart gets a fifth group. Click "+ Series": "Series 3" with 0s. Rename it to "2025" (same as an existing series): both still render, and the legend shows both. Change its color with the swatch. Remove it with ×. The last category and the last series can't be removed (× hidden).
19. Switch type to Line, Area, Stacked, and Pie: the data never changes. On Pie, the axis label fields are disabled with a note, and switching back to Bar restores both series and the axis labels. Toggle the legend.
20. Ask the AI "switch the chart to a line chart" after your edits: it patches the chart and keeps your edited data.

**Insert and images (Task 6)**

21. On slide 5, click Insert **Text**: "New text" appears centered and selected. Drag it right away: it moves. Click Text again: the second one is offset 20/20 rather than stacked exactly on the first. The Undo tooltip reads "Undo: Insert text".
22. Insert a **Chart**: a bar chart with Q1–Q4 sample data appears, selected, and the Format tab opens. Insert a **Table**: a 3×3 table with a header row, and Format opens. Insert **Rectangle**, **Ellipse**, and **Line**: each lands centered and selected.
23. On the table you inserted, click "Add row" in Format: a row appears at the bottom and the box grows by one row. "Add column" adds a column at the right. "Delete row" and "Delete column" remove the last row and column, and the table shrinks back. With a 1×1 table, the delete buttons are disabled.
24. Click Insert **Image** and pick a large photo (over 1600 px): it appears centered with its aspect ratio, at most 800×500, selected. In the console, `deckStore.getState().deck.elements[uiStore.getState().selectedIds[0]].image.src.length` is well under 1 MB for a typical photo.
25. Rename a `.txt` file to `.png` and pick it: "Couldn't read that image." appears in red next to the button and stays until the next pick; nothing is inserted.
26. Select the uploaded image, open Format, and click "Replace image…": pick another image, and the element keeps its box and fit. The Undo tooltip reads "Undo: Replace image".
27. Ask the AI "what's on slide 5?": it lists the inserted elements, and shows the uploaded image as `uploaded` (no base64 in the request; check the request payload size in the Network tab stays small).

**Regression**

28. Stage 2–5 still work: select, marquee, drag with guides, resize, ⌘D, Delete, z-order, nudge, slide drag reorder, rename, AI edit replies, and generating a new deck from the empty state.
29. `npm run typecheck` and `npm run lint` are clean.
