# Stage 2: Canvas Manipulation — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Automated tests are deferred to stage 9 (design doc D14); each task ends with a manual check instead.

**Goal:** On the current slide the user can select elements (click, shift-click, marquee), drag them singly or as a group with alignment guides and snapping, resize with 8 handles, and delete, duplicate, reorder (z-order) and nudge them from the keyboard or a small toolbar — every change is one undoable transaction.

**Architecture:** Pure geometry (`snapMove`, `snapResize`, `guidesFor`, `resizeBox`, group helpers) lives in `src/lib/canvas/`. Selection, the live drag preview, and the marquee rectangle are UI state in `useUiStore`, never in the deck or history. One pointer-gesture hook on the artboard handles select / move / resize / marquee with pointer capture, writes only the preview while the pointer moves, and commits a single `applyOps` call on pointer-up. Keyboard and toolbar actions are plain functions that read both stores with `getState()` and call `applyOps`.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Tailwind 4, Zustand 5, Immer 11 (no new dependencies).

## Global Constraints

- Artboard is 1600 × 900 logical units; every `Box` is in those units (D7). No rotation.
- Every deck mutation goes through `applyOps`. Components never write `deck` directly.
- Drags and resizes write only `ui.dragPreview` while moving; exactly one transaction is committed on pointer-up; Escape cancels with no transaction (design doc section 4).
- Pointer math: `logical = screen / scale`, where `scale = stageRect.width / 1600`.
- Selection, preview, and marquee are UI state: not in history, not persisted.
- Keyboard shortcuts are ignored while focus is in an `input`, `textarea`, `select`, or `[contenteditable]`.
- No automated tests in this stage (D14).

## Decisions introduced in this stage (to confirm)

| # | Decision | Why |
|---|----------|-----|
| S2-a | A press turns into a drag only after the pointer moves 3 screen px; a press without movement just selects | Clicking to select must not nudge an element by a pixel |
| S2-b | Snap targets are the other elements' edges and centers plus the artboard's edges and center; threshold 6 screen px; no grid. Holding ⌘/Ctrl while dragging turns snapping off | The spec accepts "snap-to-grid or alignment guides"; guides are the more useful one, and a modifier to disable them is standard (Figma, Keynote) |
| S2-c | Shift while moving locks the drag to the horizontal or vertical axis (whichever moved more) | Standard behaviour, a few lines |
| S2-d | Resize handles appear only when exactly one element is selected; a multi-selection shows each outline plus a dashed group box, no handles | Group resize (scaling several boxes and font sizes together) is out of scope |
| S2-e | Shift-resize keeps the aspect ratio on corner handles only; aspect-locked resizes don't snap | Edge handles with a locked ratio would have to grow the other axis around its center, which adds bounds cases for little value |
| S2-f | The marquee selects every element it touches (not only fully enclosed ones); Shift+marquee adds to the selection | Easier to grab elements on a busy slide |
| S2-g | A multi-selection is clamped to the artboard as a unit when moved, nudged, or duplicated | Clamping each box separately would squash the group at the edges |
| S2-h | Arrow keys move the selection 1 unit, Shift+arrow 20 units; nudges less than 800 ms apart merge into one undo step | Holding an arrow key would otherwise fill the history with dozens of steps |
| S2-i | ⌘D duplicates the selection offset by (+20, +20), places the copy on top, and selects the copies | Matches Keynote/Slides; the offset makes the copy visible |
| S2-j | Z-order shortcuts: ⌘] forward, ⌘[ backward, ⌘⇧] to front, ⌘⇧[ to back. ⌘A selects every element on the slide; Escape clears the selection | Keynote/Figma conventions. ⌘[ / ⌘] are browser back/forward, so the handler calls `preventDefault` |
| S2-k | The selection is cleared when the slide changes and is not restored by undo; ids that no longer exist on the current slide are filtered out on read | Selection is view state; filtering on read means undo or a deletion never leaves stale handles |
| S2-l | The header shows a small selection toolbar (count, Forward, Backward, Front, Back, Duplicate, Delete) | Makes z-order and duplicate discoverable and testable with the mouse; the context menu stays in stage 7 |
| S2-m | In development, `window.uiStore` is exposed next to `window.deckStore` | Lets you check the overlay and preview rendering (Task 2) before pointer handling exists |

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/canvas/geometry.ts` | `Point`, `ARTBOARD_BOX`, `translateBox`, `unionBox`, `boxesIntersect`, `rectFromPoints`, `clampGroupDelta`, `sameBox` |
| `src/lib/canvas/resize.ts` | `Handle`, `HANDLES`, `resizeBox` (handle math, minimum size, artboard bounds, aspect lock) |
| `src/lib/canvas/snap.ts` | `Guide`, `snapMove`, `snapResize`, `guidesFor` |
| `src/lib/canvas/actions.ts` | `zOrderOps` (pure), `hasSelection`, `deleteSelection`, `duplicateSelection`, `nudgeSelection`, `reorderSelection`, `selectAllOnSlide` |
| `src/lib/ui/store.ts` (modify) | Adds `selectedIds`, `dragPreview`, `marquee` and their setters; `selectionOnSlide`; `goToSlide` clears the selection; dev `window.uiStore` |
| `src/lib/ui/useSelectedIds.ts` | Selected ids that exist on the current slide, in z-order |
| `src/components/slide/ScaledArtboard.tsx` (modify) | Sets the `--artboard-scale` CSS variable; stops clipping so handles at the artboard edge stay visible |
| `src/components/slide/SlideRenderer.tsx` (modify) | `previewBoxes` prop; hover outline on the canvas |
| `src/components/slide/elements/ElementView.tsx` (modify) | Wrapped in `memo` so moving an element doesn't re-render its content |
| `src/components/canvas/ArtboardViewport.tsx` (modify) | `onBackgroundPointerDown` prop (click on the grey area clears the selection) |
| `src/components/canvas/CanvasStage.tsx` | The interactive canvas: viewport, stage div with gesture handlers, slide, overlay |
| `src/components/canvas/SelectionOverlay.tsx` | Selection outlines, group box, resize handles, snap guides, marquee |
| `src/components/canvas/useCanvasGesture.ts` | Pointer handlers: select, move, resize, marquee, Escape cancel, commit |
| `src/components/shell/SelectionToolbar.tsx` | Header toolbar for the current selection |
| `src/components/shell/useEditorShortcuts.ts` (modify) | Delete, ⌘D, ⌘A, z-order, Escape, arrow nudge |
| `src/components/shell/EditorShell.tsx` (modify) | Uses `CanvasStage`; renders `SelectionToolbar` |

---

### Task 1: Canvas geometry, resize, and snapping (pure)

**Files:**
- Create: `src/lib/canvas/geometry.ts`, `src/lib/canvas/resize.ts`, `src/lib/canvas/snap.ts`

**Interfaces:**
- Consumes: `Box` from `src/lib/deck/schema.ts`; `ARTBOARD_WIDTH`, `ARTBOARD_HEIGHT`, `MIN_ELEMENT_SIZE` from `src/lib/deck/constants.ts`.
- Produces:
  - `type Point = { x: number; y: number }`, `ARTBOARD_BOX: Box`
  - `translateBox(box: Box, dx: number, dy: number): Box`
  - `unionBox(boxes: Box[]): Box` (callers pass a non-empty list)
  - `boxesIntersect(a: Box, b: Box): boolean`
  - `rectFromPoints(a: Point, b: Point): Box`
  - `clampGroupDelta(group: Box, dx: number, dy: number): Point`
  - `sameBox(a: Box, b: Box): boolean`
  - `type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"`, `HANDLES: Handle[]`
  - `resizeBox(start: Box, handle: Handle, dx: number, dy: number, keepAspect: boolean): Box`
  - `type Guide = { axis: "x" | "y"; at: number; from: number; to: number }` — `axis: "x"` is a vertical line at `x = at` spanning `y` from `from` to `to`; `axis: "y"` is a horizontal line at `y = at`
  - `snapMove(box: Box, targets: Box[], threshold: number): Box`
  - `snapResize(box: Box, handle: Handle, targets: Box[], threshold: number): Box`
  - `guidesFor(box: Box, targets: Box[]): Guide[]`

- [ ] **Step 1: Geometry helpers**

```ts
// src/lib/canvas/geometry.ts
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/deck/constants";
import type { Box } from "@/lib/deck/schema";

export type Point = { x: number; y: number };

export const ARTBOARD_BOX: Box = { x: 0, y: 0, w: ARTBOARD_WIDTH, h: ARTBOARD_HEIGHT };

export function translateBox(box: Box, dx: number, dy: number): Box {
  return { ...box, x: box.x + dx, y: box.y + dy };
}

export function unionBox(boxes: Box[]): Box {
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectFromPoints(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function clampGroupDelta(group: Box, dx: number, dy: number): Point {
  return {
    x: Math.min(Math.max(dx, -group.x), ARTBOARD_WIDTH - group.x - group.w),
    y: Math.min(Math.max(dy, -group.y), ARTBOARD_HEIGHT - group.y - group.h),
  };
}

export function sameBox(a: Box, b: Box): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
```

- [ ] **Step 2: Resize math** — the edge opposite each dragged edge stays fixed; the result is always inside the artboard and at least `MIN_ELEMENT_SIZE` (decision S2-e for the aspect lock).

```ts
// src/lib/canvas/resize.ts
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, MIN_ELEMENT_SIZE } from "@/lib/deck/constants";
import type { Box } from "@/lib/deck/schema";

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function resizeBox(start: Box, handle: Handle, dx: number, dy: number, keepAspect: boolean): Box {
  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const right = start.x + start.w;
  const bottom = start.y + start.h;

  const maxW = east ? ARTBOARD_WIDTH - start.x : west ? right : start.w;
  const maxH = south ? ARTBOARD_HEIGHT - start.y : north ? bottom : start.h;
  let w = clamp(east ? start.w + dx : west ? start.w - dx : start.w, MIN_ELEMENT_SIZE, maxW);
  let h = clamp(south ? start.h + dy : north ? start.h - dy : start.h, MIN_ELEMENT_SIZE, maxH);

  if (keepAspect && (east || west) && (north || south)) {
    const ratio = start.w / start.h;
    if (w / ratio >= h) h = w / ratio;
    else w = h * ratio;
    const fit = Math.min(1, maxW / w, maxH / h);
    w *= fit;
    h *= fit;
  }

  w = Math.round(w);
  h = Math.round(h);
  return { x: west ? right - w : start.x, y: north ? bottom - h : start.y, w, h };
}
```

- [ ] **Step 3: Snapping** — each box offers three lines per axis (start, center, end). `snapMove` shifts the whole box by the smallest offset within the threshold, per axis independently. `snapResize` snaps only the edges the handle moves, and skips a snap that would make the box smaller than the minimum. `guidesFor` reports every line of `box` that coincides (within 0.5 units) with a line of a target; guides at the same position are merged into one longer line.

```ts
// src/lib/canvas/snap.ts
import { MIN_ELEMENT_SIZE } from "@/lib/deck/constants";
import type { Box } from "@/lib/deck/schema";
import type { Handle } from "./resize";

export type Guide = { axis: "x" | "y"; at: number; from: number; to: number };

type Axis = "x" | "y";

const ALIGN_EPSILON = 0.5;

function lines(box: Box, axis: Axis): number[] {
  return axis === "x" ? [box.x, box.x + box.w / 2, box.x + box.w] : [box.y, box.y + box.h / 2, box.y + box.h];
}

function bestOffset(moving: number[], targets: Box[], axis: Axis, threshold: number): number | null {
  let best: number | null = null;
  for (const target of targets) {
    for (const t of lines(target, axis)) {
      for (const m of moving) {
        const d = t - m;
        if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
      }
    }
  }
  return best;
}

export function snapMove(box: Box, targets: Box[], threshold: number): Box {
  const dx = bestOffset(lines(box, "x"), targets, "x", threshold) ?? 0;
  const dy = bestOffset(lines(box, "y"), targets, "y", threshold) ?? 0;
  return { ...box, x: box.x + dx, y: box.y + dy };
}

export function snapResize(box: Box, handle: Handle, targets: Box[], threshold: number): Box {
  let { x, y, w, h } = box;
  const snap = (edge: number, axis: Axis) => bestOffset([edge], targets, axis, threshold) ?? 0;

  if (handle.includes("w")) {
    const d = snap(x, "x");
    if (w - d >= MIN_ELEMENT_SIZE) {
      x += d;
      w -= d;
    }
  }
  if (handle.includes("e")) {
    const d = snap(x + w, "x");
    if (w + d >= MIN_ELEMENT_SIZE) w += d;
  }
  if (handle.includes("n")) {
    const d = snap(y, "y");
    if (h - d >= MIN_ELEMENT_SIZE) {
      y += d;
      h -= d;
    }
  }
  if (handle.includes("s")) {
    const d = snap(y + h, "y");
    if (h + d >= MIN_ELEMENT_SIZE) h += d;
  }
  return { x, y, w, h };
}

export function guidesFor(box: Box, targets: Box[]): Guide[] {
  const guides: Guide[] = [];
  for (const axis of ["x", "y"] as const) {
    const cross = axis === "x" ? "y" : "x";
    const span = axis === "x" ? "h" : "w";
    for (const at of lines(box, axis)) {
      for (const target of targets) {
        if (!lines(target, axis).some((t) => Math.abs(t - at) < ALIGN_EPSILON)) continue;
        const from = Math.min(box[cross], target[cross]);
        const to = Math.max(box[cross] + box[span], target[cross] + target[span]);
        const existing = guides.find((g) => g.axis === axis && Math.abs(g.at - at) < ALIGN_EPSILON);
        if (existing) {
          existing.from = Math.min(existing.from, from);
          existing.to = Math.max(existing.to, to);
        } else {
          guides.push({ axis, at, from, to });
        }
      }
    }
  }
  return guides;
}
```

- [ ] **Step 4: Verify** — `npm run typecheck` passes. (Behaviour is checked through the UI in Task 3; unit tests for these functions land in stage 9.)

- [ ] **Step 5: Commit** — `git commit -m "feat(canvas): add pure snapping, resize, and group geometry"`

---

### Task 2: Selection state and overlay rendering

**Files:**
- Modify: `src/lib/ui/store.ts`, `src/components/slide/ScaledArtboard.tsx`, `src/components/slide/SlideRenderer.tsx`, `src/components/slide/elements/ElementView.tsx`, `src/components/canvas/ArtboardViewport.tsx`, `src/components/shell/EditorShell.tsx`
- Create: `src/lib/ui/useSelectedIds.ts`, `src/components/canvas/SelectionOverlay.tsx`, `src/components/canvas/CanvasStage.tsx`

**Interfaces:**
- Consumes: Task 1 `Guide`, `Handle`, `HANDLES`, `unionBox`; `useDeckStore`; `useCurrentSlideId`.
- Produces:
  - `type DragPreview = { boxes: Record<string, Box>; guides: Guide[] }`
  - `useUiStore` gains `selectedIds: string[]`, `dragPreview: DragPreview | null`, `marquee: Box | null`, `setSelection(ids: string[])`, `toggleSelected(id: string)`, `clearSelection()`, `setDragPreview(p: DragPreview | null)`, `setMarquee(box: Box | null)`
  - `selectionOnSlide(deck: Deck, slideId: string, ids: string[]): string[]` — ids on that slide, in z-order (back → front)
  - `useSelectedIds(): string[]`
  - `<SlideRenderer slideId variant? previewBoxes?: Record<string, Box> />`
  - `<ArtboardViewport onBackgroundPointerDown?: () => void>`
  - `<CanvasStage slideId={string} />`, `<SelectionOverlay />`
  - CSS variable `--artboard-scale` on the 1600 × 900 layer, used for constant on-screen line and handle sizes

- [ ] **Step 1: UI store**

```ts
// src/lib/ui/store.ts
import { create } from "zustand";
import type { Guide } from "@/lib/canvas/snap";
import type { Box, Deck } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";

export type DragPreview = { boxes: Record<string, Box>; guides: Guide[] };

type UiState = {
  currentSlideId: string | null;
  selectedIds: string[];
  dragPreview: DragPreview | null;
  marquee: Box | null;
  goToSlide: (id: string) => void;
  setSelection: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  clearSelection: () => void;
  setDragPreview: (preview: DragPreview | null) => void;
  setMarquee: (box: Box | null) => void;
};

export const useUiStore = create<UiState>()((set) => ({
  currentSlideId: null,
  selectedIds: [],
  dragPreview: null,
  marquee: null,
  goToSlide: (id) => set((s) => (s.currentSlideId === id ? s : { currentSlideId: id, selectedIds: [] })),
  setSelection: (ids) => set({ selectedIds: ids }),
  toggleSelected: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id],
    })),
  clearSelection: () => set((s) => (s.selectedIds.length === 0 ? s : { selectedIds: [] })),
  setDragPreview: (preview) => set({ dragPreview: preview }),
  setMarquee: (box) => set({ marquee: box }),
}));

export function selectionOnSlide(deck: Deck, slideId: string, ids: string[]): string[] {
  return deck.slides[slideId]?.elementOrder.filter((id) => ids.includes(id)) ?? [];
}

// resolveCurrentSlideId and goRelative stay as they are.

declare global {
  interface Window {
    uiStore?: typeof useUiStore;
  }
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.uiStore = useUiStore;
}
```

- [ ] **Step 2: `useSelectedIds`**

```ts
// src/lib/ui/useSelectedIds.ts
import { useShallow } from "zustand/react/shallow";
import { useDeckStore } from "@/lib/deck/store";
import { selectionOnSlide, useUiStore } from "./store";
import { useCurrentSlideId } from "./useCurrentSlideId";

export function useSelectedIds(): string[] {
  const slideId = useCurrentSlideId();
  const selectedIds = useUiStore((s) => s.selectedIds);
  return useDeckStore(useShallow((s) => (slideId ? selectionOnSlide(s.deck, slideId, selectedIds) : [])));
}
```

- [ ] **Step 3: `ScaledArtboard`** — remove `overflow-hidden` from the outer div (the slide itself still clips its elements in `SlideRenderer`; thumbnails are clipped by their own wrapper), and set the scale variable on the inner layer:

```tsx
// src/components/slide/ScaledArtboard.tsx
import type { CSSProperties, ReactNode } from "react";
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/deck/constants";

export function ScaledArtboard({ scale, children }: { scale: number; children: ReactNode }) {
  return (
    <div className="relative" style={{ width: ARTBOARD_WIDTH * scale, height: ARTBOARD_HEIGHT * scale }}>
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={
          {
            width: ARTBOARD_WIDTH,
            height: ARTBOARD_HEIGHT,
            transform: `scale(${scale})`,
            "--artboard-scale": scale,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `SlideRenderer` preview boxes + hover outline** — a preview box overrides the element's position. Only when its *size* differs does the element view receive a copy with the new box (charts size themselves from `element.box`); a pure move keeps the original element object, so the memoized `ElementView` skips re-rendering its content.

```tsx
// src/components/slide/SlideRenderer.tsx (changed parts)
export function SlideRenderer({
  slideId,
  variant = "canvas",
  previewBoxes,
}: {
  slideId: string;
  variant?: RenderVariant;
  previewBoxes?: Record<string, Box>;
}) {
  // ...selectors unchanged...
  return (
    <div className="relative overflow-hidden" style={{ width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT, background }}>
      {elements.map((element, z) => (
        <PositionedElement
          key={element.id}
          element={element}
          box={previewBoxes?.[element.id] ?? element.box}
          z={z}
          variant={variant}
        />
      ))}
    </div>
  );
}

const PositionedElement = memo(function PositionedElement({
  element,
  box,
  z,
  variant,
}: {
  element: Element;
  box: Box;
  z: number;
  variant: RenderVariant;
}) {
  const resized = box.w !== element.box.w || box.h !== element.box.h;
  const shown = resized ? { ...element, box } : element;
  return (
    <div
      data-element-id={element.id}
      className={`absolute ${variant === "canvas" ? "outline-accent/40 hover:outline" : ""}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        zIndex: z,
        outlineWidth: "calc(1.5px / var(--artboard-scale))",
      }}
    >
      <ElementView element={shown} variant={variant} />
    </div>
  );
});
```

In `ElementView.tsx`, wrap the component: `export const ElementView = memo(function ElementView({ element, variant }: {...}) { ...switch unchanged... });` (import `memo` from `react`).

- [ ] **Step 5: `ArtboardViewport`** — add an optional `onBackgroundPointerDown?: () => void` prop and put `onPointerDown={onBackgroundPointerDown}` on the root `div`. The stage (Task 3) stops propagation of its own pointer-downs, so only presses on the grey area reach this handler.

- [ ] **Step 6: `SelectionOverlay`** — absolutely positioned over the 1600 × 900 layer at `z-index: 10000`, `pointer-events-none` except for the handles. All line widths and handle sizes are divided by `--artboard-scale` so they stay the same on screen at any zoom.

```tsx
// src/components/canvas/SelectionOverlay.tsx
"use client";

import type { CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { unionBox } from "@/lib/canvas/geometry";
import { HANDLES, type Handle } from "@/lib/canvas/resize";
import type { Guide } from "@/lib/canvas/snap";
import type { Box } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";
import { useSelectedIds } from "@/lib/ui/useSelectedIds";

const OVERLAY_Z = 10000;
const px = (n: number) => `calc(${n}px / var(--artboard-scale))`;

const HANDLE_ANCHOR: Record<Handle, [number, number]> = {
  nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5],
};

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
};

const boxStyle = (b: Box): CSSProperties => ({ left: b.x, top: b.y, width: b.w, height: b.h });

export function SelectionOverlay() {
  const selectedIds = useSelectedIds();
  const preview = useUiStore((s) => s.dragPreview);
  const marquee = useUiStore((s) => s.marquee);
  const deckBoxes = useDeckStore(useShallow((s) => selectedIds.map((id) => s.deck.elements[id]!.box)));
  const boxes = deckBoxes.map((box, i) => preview?.boxes[selectedIds[i]!] ?? box);

  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: OVERLAY_Z }}>
      {boxes.map((box, i) => (
        <div
          key={selectedIds[i]}
          className="absolute outline outline-accent"
          style={{ ...boxStyle(box), outlineWidth: px(1.5) }}
        />
      ))}
      {boxes.length > 1 && (
        <div
          className="absolute border-dashed border-accent/70"
          style={{ ...boxStyle(unionBox(boxes)), borderWidth: px(1) }}
        />
      )}
      {boxes.length === 1 && HANDLES.map((handle) => <ResizeHandle key={handle} handle={handle} box={boxes[0]!} />)}
      {preview?.guides.map((guide) => <GuideLine key={`${guide.axis}${guide.at}`} guide={guide} />)}
      {marquee && (
        <div className="absolute border-accent bg-accent/10" style={{ ...boxStyle(marquee), borderWidth: px(1) }} />
      )}
    </div>
  );
}

function ResizeHandle({ handle, box }: { handle: Handle; box: Box }) {
  const [fx, fy] = HANDLE_ANCHOR[handle];
  return (
    <div
      data-handle={handle}
      className="pointer-events-auto absolute rounded-[2px] border-accent bg-white"
      style={{
        left: box.x + box.w * fx,
        top: box.y + box.h * fy,
        width: px(10),
        height: px(10),
        borderWidth: px(1.5),
        translate: "-50% -50%",
        cursor: HANDLE_CURSOR[handle],
      }}
    />
  );
}

function GuideLine({ guide }: { guide: Guide }) {
  const style: CSSProperties =
    guide.axis === "x"
      ? { left: guide.at, top: guide.from, width: px(1), height: guide.to - guide.from, translate: "-50% 0" }
      : { left: guide.from, top: guide.at, width: guide.to - guide.from, height: px(1), translate: "0 -50%" };
  return <div className="absolute bg-pink-500" style={style} />;
}
```

- [ ] **Step 7: `CanvasStage`** (no gesture handlers yet; Task 3 adds them)

```tsx
// src/components/canvas/CanvasStage.tsx
"use client";

import { ArtboardViewport } from "@/components/canvas/ArtboardViewport";
import { SlideRenderer } from "@/components/slide/SlideRenderer";
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/deck/constants";
import { useUiStore } from "@/lib/ui/store";
import { SelectionOverlay } from "./SelectionOverlay";

export function CanvasStage({ slideId }: { slideId: string }) {
  const previewBoxes = useUiStore((s) => s.dragPreview?.boxes);
  const clearSelection = useUiStore((s) => s.clearSelection);

  return (
    <ArtboardViewport onBackgroundPointerDown={clearSelection}>
      <div className="relative touch-none select-none" style={{ width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT }}>
        <SlideRenderer slideId={slideId} previewBoxes={previewBoxes} />
        <SelectionOverlay />
      </div>
    </ArtboardViewport>
  );
}
```

In `EditorShell.tsx`, `CanvasArea` renders `<CanvasStage slideId={slideId} />` instead of `ArtboardViewport` + `SlideRenderer`.

- [ ] **Step 8: Verify** — `npm run typecheck` and `npm run lint` pass. On slide 3 in the browser console:

```js
const chartId = Object.values(deckStore.getState().deck.elements).find((e) => e.type === "chart").id;
uiStore.getState().setSelection([chartId]);
```

The chart gets an indigo outline and 8 white handles at constant screen size (resize the window: they stay ~10 px). Then:

```js
uiStore.getState().setDragPreview({ boxes: { [chartId]: { x: 100, y: 300, w: 700, h: 400 } }, guides: [{ axis: "x", at: 100, from: 0, to: 900 }] });
```

The chart is drawn at the new box, redrawn at the new size, with a pink vertical guide; the thumbnail is unchanged. `uiStore.getState().setDragPreview(null)` restores it. Hovering any element on the canvas shows a faint outline; thumbnails show none. Clicking a filmstrip thumbnail clears the selection.

- [ ] **Step 9: Commit** — `git commit -m "feat(canvas): selection state, overlay, handles, and drag preview rendering"`

---

### Task 3: Pointer gestures — select, marquee, move, resize

**Files:**
- Create: `src/components/canvas/useCanvasGesture.ts`
- Modify: `src/components/canvas/CanvasStage.tsx`

**Interfaces:**
- Consumes: Task 1 (`snapMove`, `snapResize`, `guidesFor`, `resizeBox`, `Handle`, geometry helpers); Task 2 (`useUiStore` setters, `selectionOnSlide`); `useDeckStore.getState().applyOps`; `Op`.
- Produces: `useCanvasGesture(slideId: string): { onPointerDown; onPointerMove; onPointerUp; onPointerCancel }` (React pointer handlers for the stage div).

Behaviour:

| Press on | Without Shift | With Shift |
|----------|---------------|------------|
| A resize handle (single selection) | Resize gesture | Resize, aspect locked on corners (S2-e) |
| An unselected element | Select only it, then a move gesture for it | Toggle it in the selection; no drag |
| A selected element | Move gesture for the whole selection; if released without moving, select only that element | Toggle it out of the selection; no drag |
| Empty slide area | Clear selection, then marquee | Keep selection, marquee adds to it (S2-f) |

While a gesture is active: ⌘/Ctrl held = no snapping (S2-b); Shift on a move = axis lock (S2-c); Escape cancels (preview cleared, marquee restores the previous selection, no transaction); every other key is swallowed so ⌘Z or Delete can't change the deck under the drag.

- [ ] **Step 1: The hook**

```ts
// src/components/canvas/useCanvasGesture.ts
"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  ARTBOARD_BOX,
  boxesIntersect,
  clampGroupDelta,
  rectFromPoints,
  sameBox,
  translateBox,
  unionBox,
  type Point,
} from "@/lib/canvas/geometry";
import { resizeBox, type Handle } from "@/lib/canvas/resize";
import { guidesFor, snapMove, snapResize } from "@/lib/canvas/snap";
import { ARTBOARD_WIDTH } from "@/lib/deck/constants";
import type { Op } from "@/lib/deck/ops";
import type { Box } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { selectionOnSlide, useUiStore } from "@/lib/ui/store";

const DRAG_THRESHOLD_PX = 3;
const SNAP_THRESHOLD_PX = 6;

type GestureBase = { pointerId: number; scale: number; origin: Point; targets: Box[] };

type Gesture =
  | (GestureBase & {
      kind: "move";
      ids: string[];
      startBoxes: Record<string, Box>;
      group: Box;
      started: boolean;
      pressedId: string;
      wasSelected: boolean;
    })
  | (GestureBase & { kind: "resize"; id: string; handle: Handle; startBox: Box })
  | (GestureBase & { kind: "marquee"; base: string[]; candidates: { id: string; box: Box }[] });

type StageEvent = ReactPointerEvent<HTMLDivElement>;

function toLogical(event: StageEvent, scale: number): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
}

function endGesture(): void {
  const ui = useUiStore.getState();
  ui.setDragPreview(null);
  ui.setMarquee(null);
}

const countLabel = (verb: string, n: number) => (n === 1 ? `${verb} element` : `${verb} ${n} elements`);

export function useCanvasGesture(slideId: string) {
  const gesture = useRef<Gesture | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const g = gesture.current;
      if (!g) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key !== "Escape") return;
      if (g.kind === "marquee") useUiStore.getState().setSelection(g.base);
      gesture.current = null;
      endGesture();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  function onPointerDown(event: StageEvent) {
    if (event.button !== 0 || gesture.current) return;
    event.stopPropagation();

    const { deck } = useDeckStore.getState();
    const ui = useUiStore.getState();
    const slide = deck.slides[slideId];
    if (!slide) return;

    const scale = event.currentTarget.getBoundingClientRect().width / ARTBOARD_WIDTH;
    const origin = toLogical(event, scale);
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle as Handle | undefined;
    const elementId = target.closest<HTMLElement>("[data-element-id]")?.dataset.elementId;
    const selected = selectionOnSlide(deck, slideId, ui.selectedIds);
    const boxOf = (id: string) => deck.elements[id]!.box;
    const targetsExcept = (ids: string[]) => [
      ARTBOARD_BOX,
      ...slide.elementOrder.filter((id) => !ids.includes(id)).map(boxOf),
    ];
    const base = { pointerId: event.pointerId, scale, origin };

    if (handle && selected.length === 1) {
      const id = selected[0]!;
      gesture.current = { ...base, kind: "resize", id, handle, startBox: boxOf(id), targets: targetsExcept([id]) };
    } else if (elementId) {
      if (event.shiftKey) {
        ui.toggleSelected(elementId);
        return;
      }
      const wasSelected = selected.includes(elementId);
      const ids = wasSelected ? selected : [elementId];
      if (!wasSelected) ui.setSelection(ids);
      const startBoxes = Object.fromEntries(ids.map((id) => [id, boxOf(id)]));
      gesture.current = {
        ...base,
        kind: "move",
        ids,
        startBoxes,
        group: unionBox(Object.values(startBoxes)),
        targets: targetsExcept(ids),
        started: false,
        pressedId: elementId,
        wasSelected,
      };
    } else {
      const keep = event.shiftKey ? selected : [];
      ui.setSelection(keep);
      gesture.current = {
        ...base,
        kind: "marquee",
        base: keep,
        candidates: slide.elementOrder.map((id) => ({ id, box: boxOf(id) })),
        targets: [],
      };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: StageEvent) {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointerId) return;
    const point = toLogical(event, g.scale);
    let dx = point.x - g.origin.x;
    let dy = point.y - g.origin.y;
    const ui = useUiStore.getState();
    const threshold = SNAP_THRESHOLD_PX / g.scale;
    const snapping = !(event.metaKey || event.ctrlKey);
    const pastThreshold = Math.hypot(dx, dy) * g.scale >= DRAG_THRESHOLD_PX;

    switch (g.kind) {
      case "move": {
        if (!g.started && !pastThreshold) return;
        g.started = true;
        const lock = event.shiftKey ? (Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical") : null;
        if (lock === "horizontal") dy = 0;
        if (lock === "vertical") dx = 0;
        const moved = translateBox(g.group, Math.round(dx), Math.round(dy));
        const snapped = snapping ? snapMove(moved, g.targets, threshold) : moved;
        const delta = clampGroupDelta(
          g.group,
          lock === "vertical" ? 0 : snapped.x - g.group.x,
          lock === "horizontal" ? 0 : snapped.y - g.group.y,
        );
        const boxes = Object.fromEntries(
          Object.entries(g.startBoxes).map(([id, box]) => [id, translateBox(box, delta.x, delta.y)]),
        );
        const guides = snapping ? guidesFor(translateBox(g.group, delta.x, delta.y), g.targets) : [];
        ui.setDragPreview({ boxes, guides });
        return;
      }
      case "resize": {
        let box = resizeBox(g.startBox, g.handle, dx, dy, event.shiftKey);
        if (snapping && !event.shiftKey) box = snapResize(box, g.handle, g.targets, threshold);
        ui.setDragPreview({ boxes: { [g.id]: box }, guides: snapping ? guidesFor(box, g.targets) : [] });
        return;
      }
      case "marquee": {
        if (!pastThreshold && !ui.marquee) return;
        const rect = rectFromPoints(g.origin, point);
        ui.setMarquee(rect);
        const hits = g.candidates.filter(({ box }) => boxesIntersect(box, rect)).map(({ id }) => id);
        ui.setSelection([...new Set([...g.base, ...hits])]);
        return;
      }
    }
  }

  function onPointerUp(event: StageEvent) {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointerId) return;
    gesture.current = null;
    const preview = useUiStore.getState().dragPreview;
    const { applyOps } = useDeckStore.getState();

    if (g.kind === "move") {
      if (!g.started && g.wasSelected) useUiStore.getState().setSelection([g.pressedId]);
      const ops: Op[] = g.ids.flatMap((id) => {
        const box = preview?.boxes[id];
        return box && !sameBox(box, g.startBoxes[id]!) ? [{ op: "move_element", id, box: { x: box.x, y: box.y } }] : [];
      });
      if (ops.length > 0) applyOps(ops, { source: "user", label: countLabel("Move", ops.length) });
    }
    if (g.kind === "resize") {
      const box = preview?.boxes[g.id];
      if (box && !sameBox(box, g.startBox)) {
        applyOps([{ op: "update_element", id: g.id, patch: { box } }], { source: "user", label: "Resize element" });
      }
    }
    endGesture();
  }

  function onPointerCancel(event: StageEvent) {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointerId) return;
    if (g.kind === "marquee") useUiStore.getState().setSelection(g.base);
    gesture.current = null;
    endGesture();
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
```

`applyOps` runs before `endGesture()` clears the preview; both store updates happen in the same event handler, so React renders once and the element never flashes back to its old position.

- [ ] **Step 2: Wire into `CanvasStage`** — `const handlers = useCanvasGesture(slideId);` and spread `{...handlers}` onto the stage `div` (the one with `touch-none select-none`).

- [ ] **Step 3: Verify** — `npm run typecheck` and `npm run lint` pass; run checklist items 1–7 below.

- [ ] **Step 4: Commit** — `git commit -m "feat(canvas): select, marquee, drag with snapping guides, and resize"`

---

### Task 4: Keyboard actions and selection toolbar

**Files:**
- Create: `src/lib/canvas/actions.ts`, `src/components/shell/SelectionToolbar.tsx`
- Modify: `src/components/shell/useEditorShortcuts.ts`, `src/components/shell/EditorShell.tsx`

**Interfaces:**
- Consumes: `clampGroupDelta`, `translateBox`, `unionBox`; `useDeckStore`, `Op`; `useUiStore`, `resolveCurrentSlideId`, `selectionOnSlide`; `useSelectedIds`.
- Produces:
  - `type ZDirection = "forward" | "backward" | "front" | "back"`
  - `zOrderOps(order: string[], selected: string[], direction: ZDirection): Op[]` (pure)
  - `hasSelection(): boolean`, `deleteSelection(): void`, `duplicateSelection(): void`, `nudgeSelection(dx: number, dy: number): void`, `reorderSelection(direction: ZDirection): void`, `selectAllOnSlide(): void`
  - `<SelectionToolbar />`

- [ ] **Step 1: Actions** — every action works on the current slide's selection in z-order and is one transaction.

`zOrderOps` keeps the selected elements' order relative to each other. Front: apply `front` back-to-front, so the topmost selected element ends up on top. Back: apply `back` front-to-back. Forward/backward: process the element nearest the destination first, on a simulated copy of the order; an element whose neighbour in that direction is missing (already at the end) or is itself blocked does not move, which stops selected elements from swapping with each other.

```ts
// src/lib/canvas/actions.ts
import type { Op } from "@/lib/deck/ops";
import { useDeckStore } from "@/lib/deck/store";
import { resolveCurrentSlideId, selectionOnSlide, useUiStore } from "@/lib/ui/store";
import { clampGroupDelta, translateBox, unionBox } from "./geometry";

export type ZDirection = "forward" | "backward" | "front" | "back";

const DUPLICATE_OFFSET = 20;
const NUDGE_MERGE_MS = 800;

const Z_LABEL: Record<ZDirection, string> = {
  forward: "Bring forward",
  backward: "Send backward",
  front: "Bring to front",
  back: "Send to back",
};

const countLabel = (verb: string, n: number) => (n === 1 ? `${verb} element` : `${verb} ${n} elements`);

export function zOrderOps(order: string[], selected: string[], direction: ZDirection): Op[] {
  const picked = order.filter((id) => selected.includes(id));
  const reorder = (id: string): Op => ({ op: "reorder_element", id, direction });
  if (direction === "front") return picked.map(reorder);
  if (direction === "back") return picked.reverse().map(reorder);

  const step = direction === "forward" ? 1 : -1;
  const sequence = direction === "forward" ? picked.reverse() : picked;
  const simulated = [...order];
  const blocked = new Set<string>();
  const ops: Op[] = [];
  for (const id of sequence) {
    const from = simulated.indexOf(id);
    const neighbour = simulated[from + step];
    if (neighbour === undefined || blocked.has(neighbour)) {
      blocked.add(id);
      continue;
    }
    simulated[from] = neighbour;
    simulated[from + step] = id;
    ops.push(reorder(id));
  }
  return ops;
}

function currentSelection(): { slideId: string; ids: string[] } | null {
  const { deck } = useDeckStore.getState();
  const { currentSlideId, selectedIds } = useUiStore.getState();
  const slideId = resolveCurrentSlideId(deck, currentSlideId);
  if (!slideId) return null;
  const ids = selectionOnSlide(deck, slideId, selectedIds);
  return ids.length > 0 ? { slideId, ids } : null;
}

export function hasSelection(): boolean {
  return currentSelection() !== null;
}

export function deleteSelection(): void {
  const selection = currentSelection();
  if (!selection) return;
  useDeckStore.getState().applyOps(
    selection.ids.map((id) => ({ op: "delete_element", id })),
    { source: "user", label: countLabel("Delete", selection.ids.length) },
  );
  useUiStore.getState().clearSelection();
}

export function duplicateSelection(): void {
  const selection = currentSelection();
  if (!selection) return;
  const { deck, applyOps } = useDeckStore.getState();
  const boxes = selection.ids.map((id) => deck.elements[id]!.box);
  const delta = clampGroupDelta(unionBox(boxes), DUPLICATE_OFFSET, DUPLICATE_OFFSET);
  const results = applyOps(
    selection.ids.map((id, i) => ({ op: "move_element", id, copy: true, box: translateBox(boxes[i]!, delta.x, delta.y) })),
    { source: "user", label: countLabel("Duplicate", selection.ids.length) },
  );
  useUiStore.getState().setSelection(results.flatMap((r) => (r.ok && r.id ? [r.id] : [])));
}

let lastNudge = { txnId: "", at: 0 };

export function nudgeSelection(dx: number, dy: number): void {
  const selection = currentSelection();
  if (!selection) return;
  const { deck, applyOps } = useDeckStore.getState();
  const boxes = selection.ids.map((id) => deck.elements[id]!.box);
  const delta = clampGroupDelta(unionBox(boxes), dx, dy);
  if (delta.x === 0 && delta.y === 0) return;

  const now = performance.now();
  if (now - lastNudge.at > NUDGE_MERGE_MS) lastNudge = { txnId: crypto.randomUUID(), at: now };
  else lastNudge.at = now;

  applyOps(
    selection.ids.map((id, i) => {
      const box = translateBox(boxes[i]!, delta.x, delta.y);
      return { op: "move_element", id, box: { x: box.x, y: box.y } };
    }),
    { source: "user", label: countLabel("Nudge", selection.ids.length), txnId: lastNudge.txnId },
  );
}

export function reorderSelection(direction: ZDirection): void {
  const selection = currentSelection();
  if (!selection) return;
  const { deck, applyOps } = useDeckStore.getState();
  const ops = zOrderOps(deck.slides[selection.slideId]!.elementOrder, selection.ids, direction);
  if (ops.length > 0) applyOps(ops, { source: "user", label: Z_LABEL[direction] });
}

export function selectAllOnSlide(): void {
  const { deck } = useDeckStore.getState();
  const slideId = resolveCurrentSlideId(deck, useUiStore.getState().currentSlideId);
  if (slideId) useUiStore.getState().setSelection([...deck.slides[slideId]!.elementOrder]);
}
```

The `op` literals inside `.map` callbacks need to stay typed as `Op`. If TypeScript widens `"move_element"` to `string`, annotate the callback return type (`(id): Op => ...`).

- [ ] **Step 2: Shortcuts** — extend `useEditorShortcuts`. The order matters: undo/redo first (unchanged), then the modifier shortcuts, then plain keys. Arrows nudge when something is selected and switch slides otherwise; PageUp/PageDown always switch slides.

```ts
// src/components/shell/useEditorShortcuts.ts (keydown body after the existing undo/redo branches)
const NUDGE_SMALL = 1;
const NUDGE_LARGE = 20;

const ARROW_VECTORS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const Z_SHORTCUTS: Record<string, [ZDirection, ZDirection]> = {
  BracketRight: ["forward", "front"],
  BracketLeft: ["backward", "back"],
};

// ...inside onKeyDown:
if (mod && key === "d") {
  event.preventDefault();
  duplicateSelection();
  return;
}
if (mod && key === "a") {
  event.preventDefault();
  selectAllOnSlide();
  return;
}
const z = Z_SHORTCUTS[event.code];
if (mod && z) {
  event.preventDefault();
  reorderSelection(event.shiftKey ? z[1] : z[0]);
  return;
}
if (mod || event.altKey) return;

if (event.key === "Escape") {
  useUiStore.getState().clearSelection();
  return;
}
if (event.key === "Delete" || event.key === "Backspace") {
  event.preventDefault();
  deleteSelection();
  return;
}
const vector = ARROW_VECTORS[event.key];
if (vector && hasSelection()) {
  event.preventDefault();
  const step = event.shiftKey ? NUDGE_LARGE : NUDGE_SMALL;
  nudgeSelection(vector[0] * step, vector[1] * step);
  return;
}
// existing slide-navigation switch follows unchanged
```

`event.code` is used for the brackets because Shift changes `event.key` to `}` / `{` on US layouts.

- [ ] **Step 3: Selection toolbar** — shown in the header between the title and the undo/redo buttons, only when the selection is non-empty.

```tsx
// src/components/shell/SelectionToolbar.tsx
"use client";

import {
  deleteSelection,
  duplicateSelection,
  reorderSelection,
} from "@/lib/canvas/actions";
import { useSelectedIds } from "@/lib/ui/useSelectedIds";

const buttonClass = "rounded px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100";

export function SelectionToolbar() {
  const count = useSelectedIds().length;
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-xs text-zinc-500 tabular-nums">{count} selected</span>
      <button type="button" className={buttonClass} title="Bring forward (⌘])" onClick={() => reorderSelection("forward")}>
        Forward
      </button>
      <button type="button" className={buttonClass} title="Send backward (⌘[)" onClick={() => reorderSelection("backward")}>
        Backward
      </button>
      <button type="button" className={buttonClass} title="Bring to front (⌘⇧])" onClick={() => reorderSelection("front")}>
        Front
      </button>
      <button type="button" className={buttonClass} title="Send to back (⌘⇧[)" onClick={() => reorderSelection("back")}>
        Back
      </button>
      <button type="button" className={buttonClass} title="Duplicate (⌘D)" onClick={duplicateSelection}>
        Duplicate
      </button>
      <button type="button" className={`${buttonClass} text-red-600`} title="Delete (⌫)" onClick={deleteSelection}>
        Delete
      </button>
    </div>
  );
}
```

In `EditorShell`, the header becomes: title (left, `truncate`), `<SelectionToolbar />` (center, `ml-auto mr-4`), `<HistoryButtons />` (right).

- [ ] **Step 4: Verify** — `npm run typecheck` and `npm run lint` pass; run checklist items 8–14 below.

- [ ] **Step 5: Commit** — `git commit -m "feat(canvas): delete, duplicate, z-order, nudge, select-all shortcuts and toolbar"`

---

### Task 5: Walk the checklist and hand off

- [ ] **Step 1:** Run the full checklist below in the browser and fix anything that fails.
- [ ] **Step 2:** `npm run typecheck` and `npm run lint` are clean.
- [ ] **Step 3:** Commit any fixes: `git commit -m "fix(canvas): stage 2 checklist fixes"` (only if there were any).

---

## Stage 2 manual checklist (for you)

Run `npm run dev` (with `NODE_USE_SYSTEM_CA=1` exported), open http://localhost:3000.

**Selection and pointer gestures (Task 3)**

1. On slide 2, click the bullets: indigo outline and 8 handles. Click the photo: selection moves to it. Click empty slide space: nothing is selected. Click the grey area around the slide: nothing is selected.
2. Shift-click the title, the bullets, and the photo: three outlines and a dashed group box, no handles. Shift-click the bullets again: it leaves the selection.
3. On empty slide space, drag a rectangle across the title and part of the bullets: both get selected as soon as the rectangle touches them. Hold Shift and marquee the photo: it is added. Start a marquee and press Escape: the rectangle disappears and the selection goes back to what it was.
4. Drag the photo slowly towards the title's left edge and towards the slide's horizontal center: a pink guide appears and the photo snaps into line. Hold ⌘ while dragging: no guides, no snapping. Hold Shift: the photo only moves horizontally or vertically. Drag it past the slide edge: it stops at the edge.
5. Release the drag: Undo tooltip reads "Undo: Move element", the thumbnail updates, ⌘Z puts the photo back. Drag again, press Escape mid-drag: the photo jumps back and no undo entry is added.
6. Select the title, bullets, and photo and drag one of them: all three move together with one group outline snapping. Push the group against the right edge: none of them squash or overlap more than before. ⌘Z reverts all three in one step ("Undo: Move 3 elements").
7. On slide 3, select the chart and drag the bottom-right handle: the chart redraws at the new size while dragging; the edge snaps to other elements and the artboard center. Hold Shift on a corner: the aspect ratio stays fixed. Drag the left handle past the right edge: the chart stops at 20 units wide. Release: "Undo: Resize element"; ⌘Z restores the size.

**Keyboard and toolbar (Task 4)**

8. Select the photo, press → three times: it moves 3 units. Shift+→: 20 units. Hold → for a second, then ⌘Z: one undo step reverts the whole held press (nudges <800 ms apart merge). With nothing selected, ←/→ switch slides again.
9. Select the photo, ⌘D: a copy appears 20 units down-right, on top, and is selected (the toolbar says "1 selected"). Select two elements, ⌘D: both are copied, the copies are selected. ⌘Z removes the copies in one step.
10. On slide 5, select the circle and press ⌘⇧[: it goes behind the text. ⌘⇧]: back in front. ⌘[ / ⌘]: one step at a time. The browser does not navigate back or forward. The toolbar's Forward / Backward / Front / Back buttons do the same.
11. Select two elements and press Delete (or Backspace): both disappear, the selection clears, the toolbar hides. ⌘Z brings both back.
12. ⌘A selects every element on the current slide; Escape clears it.
13. Select an element, then click another slide's thumbnail: the selection clears. Go back and select something, then press ⌘Z until that element no longer exists: its handles disappear without errors.
14. While dragging, press ⌘Z or Delete: nothing happens (keys are ignored during a gesture).
15. `npm run typecheck` and `npm run lint` are clean.
