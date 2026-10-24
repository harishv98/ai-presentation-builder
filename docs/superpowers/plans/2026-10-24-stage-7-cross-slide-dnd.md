# Stage 7: Cross-Slide Drag and Drop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Automated tests are deferred to stage 9 (design doc D14); each task ends with a manual check instead.

**Goal:** Drag selected elements off the canvas onto a filmstrip thumbnail to move them to that slide (hold Alt to copy). A ghost of the elements follows the cursor, the target thumbnail lights up, and Escape or dropping anywhere else cancels. A "Move to…" dropdown in the selection toolbar does the same without dragging. Each drop is one undo step, and the AI sees the element on its new slide on the next request.

**Architecture:** No new ops, no schema changes, no new dependencies. `move_element` already takes `toSlideId` and `copy`, keeps x/y, and clamps into the artboard. The existing move gesture in `useCanvasGesture` (pointer capture) gains one branch: when the pointer is outside the stage it clears the in-slide preview, hit-tests `[data-drop-slide-id]` with `document.elementFromPoint`, and writes a `crossDrag` value to the UI store. A portal ghost and the thumbnail ring read that value. On pointer-up the drop commits through one shared action, `moveElementsToSlide`, which the toolbar dropdown also uses. `serializeForAI` is rebuilt before every request and lists elements under their slide, so the AI needs no change.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Tailwind 4, Zustand 5. No new dependencies.

## Global Constraints

- Every deck mutation goes through `applyOps`. One drop (move or copy, one or many elements) is one undo step.
- `crossDrag` is UI state: not in history, not persisted, cleared by every gesture end (drop, Escape, pointer cancel).
- Thumbnails stay sortable with `dnd-kit`. Element drags only hit-test them; the two never compete (D9).
- No automated tests in this stage (D14).

## Decisions introduced in this stage (to confirm)

| # | Decision | Why |
|---|----------|-----|
| S7-a | Cross-slide mode starts when the pointer leaves the stage rectangle during an element move. While outside, the elements show back at their original spot on the canvas, and a semi-transparent render of them (at canvas scale, keeping the grab point under the cursor) follows the pointer (your choices) | The original spot makes it clear nothing has moved yet; a real render shows what is being carried |
| S7-b | Drop targets are filmstrip thumbnails only. The target gets an accent ring, and the ghost's label reads "Move to slide N" or "Copy to slide N". Over anything else, or over the current slide's own thumbnail, it reads "Drop on a slide thumbnail" and a drop there cancels | Design section 6. A drop on the source slide would be a no-op |
| S7-c | Alt (Option on macOS) at drop time copies; copies get new ids. The label follows Alt on the next pointer move | `move_element { copy: true }` already exists. Pointer events carry `altKey`, so no extra key listener is needed |
| S7-d | Dropped elements keep their x/y, clamped into the artboard by the op. Multi-selection moves together, keeping z-order (they land on top, in their original order) | Design section 6. Clamping already lives in `applyOps` |
| S7-e | After a drop the canvas goes to the target slide and selects the moved or copied elements (your choice). Undo label: "Move element to slide 3", "Copy 2 elements to slide 3" | The user sees the result right away and can keep adjusting it |
| S7-f | Fallback: a **Move to…** native `<select>` in the selection toolbar lists the other slides ("3. Market size"). Picking one moves the selection (no copy; Alt-drag or Duplicate-then-move covers that). Hidden when the deck has one slide (your choice over a right-click menu) | A native select is accessible and keyboard-usable with no menu code |
| S7-g | Known gaps, accepted: the filmstrip does not auto-scroll while dragging (the target thumbnail must already be visible); undo of a move doesn't navigate back to the source slide | Each is extra code for an edge case; add if the walkthrough trips on it |

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/ui/store.ts` (modify) | `CrossDrag` type, `crossDrag` state and setter |
| `src/lib/canvas/actions.ts` (modify) | `moveElementsToSlide`, `moveSelectionToSlide` |
| `src/components/shell/SelectionToolbar.tsx` (modify) | "Move to…" select |
| `src/components/canvas/useCanvasGesture.ts` (modify) | Outside-stage branch, hit-test, commit on drop, clear on end |
| `src/components/canvas/CrossSlideGhost.tsx` (new) | Portal ghost with label |
| `src/components/canvas/CanvasStage.tsx` (modify) | Renders the ghost |
| `src/components/filmstrip/SlideThumbnail.tsx` (modify) | `data-drop-slide-id` and the drop ring |

---

## Task 1: Shared move action and the toolbar fallback

Build the commit path first and prove it through the dropdown, before any pointer work.

**Files:** `src/lib/ui/store.ts`, `src/lib/canvas/actions.ts`, `src/components/shell/SelectionToolbar.tsx`

- [x] **Step 1: UI store state.** In `src/lib/ui/store.ts`, add next to `DragPreview`:

```ts
export type CrossDrag = {
  ids: string[];
  group: Box;
  scale: number;
  left: number;
  top: number;
  targetSlideId: string | null;
  copy: boolean;
};
```

Add `crossDrag: CrossDrag | null;` and `setCrossDrag: (drag: CrossDrag | null) => void;` to `UiState`, initial `crossDrag: null`, and `setCrossDrag: (drag) => set({ crossDrag: drag }),`.

- [x] **Step 2: Actions.** In `src/lib/canvas/actions.ts`, after `duplicateSelection`:

```ts
export function moveElementsToSlide(ids: string[], toSlideId: string, copy: boolean): void {
  const { deck, applyOps } = useDeckStore.getState();
  const number = deck.slideOrder.indexOf(toSlideId) + 1;
  const results = applyOps(
    ids.map((id): Op => ({ op: "move_element", id, toSlideId, copy })),
    { source: "user", label: `${countLabel(copy ? "Copy" : "Move", ids.length)} to slide ${number}` },
  );
  const landed = results.flatMap((r) => (r.ok && r.id ? [r.id] : []));
  if (landed.length === 0) return;
  const ui = useUiStore.getState();
  ui.goToSlide(toSlideId);
  ui.setSelection(landed);
}

export function moveSelectionToSlide(toSlideId: string): void {
  const selection = currentSelection();
  if (selection) moveElementsToSlide(selection.ids, toSlideId, false);
}
```

`goToSlide` clears the selection, so `setSelection` must come after it.

- [x] **Step 3: Toolbar select.** In `src/components/shell/SelectionToolbar.tsx`, render `<MoveToSlide />` just before the Duplicate button, and add:

```tsx
function MoveToSlide() {
  const currentSlideId = useCurrentSlideId();
  const slideOrder = useDeckStore((s) => s.deck.slideOrder);
  const slides = useDeckStore((s) => s.deck.slides);
  if (slideOrder.length < 2) return null;
  return (
    <select
      aria-label="Move the selection to another slide"
      title="Move to another slide (or drag onto a thumbnail; hold Alt to copy)"
      value=""
      onChange={(event) => moveSelectionToSlide(event.target.value)}
      className={buttonClass}
    >
      <option value="" disabled>
        Move to…
      </option>
      {slideOrder.map((id, index) =>
        id === currentSlideId ? null : (
          <option key={id} value={id}>
            {index + 1}. {slides[id]?.title || "Untitled"}
          </option>
        ),
      )}
    </select>
  );
}
```

Imports: `moveSelectionToSlide` from `@/lib/canvas/actions`, `useDeckStore` from `@/lib/deck/store`, `useCurrentSlideId` from `@/lib/ui/useCurrentSlideId`.

- [x] **Step 4: Check.** `npm run lint` and `npx tsc --noEmit` pass. On the sample deck: select the chart, pick "Move to… → 4." The canvas jumps to slide 4 with the chart selected at the same x/y. ⌘Z puts it back on its slide; ⌘⇧Z moves it again. Select two elements and move them: one undo step. With a one-slide deck the select is gone.

- [x] **Step 5: Commit.** `feat(canvas): move elements to another slide from the selection toolbar`

---

## Task 2: Drag onto a thumbnail

**Files:** `src/components/canvas/useCanvasGesture.ts`, `src/components/canvas/CrossSlideGhost.tsx` (new), `src/components/canvas/CanvasStage.tsx`, `src/components/filmstrip/SlideThumbnail.tsx`

- [x] **Step 1: Thumbnail target.** In `SlideThumbnail`, add `const dropTarget = useUiStore((s) => s.crossDrag?.targetSlideId === slideId);`. On the `<button>` add `data-drop-slide-id={slideId}` and put the drop ring first in the class choice:

```tsx
className={`relative block overflow-hidden rounded-sm ring-offset-1 focus:outline-none ${
  dropTarget
    ? "ring-2 ring-accent ring-offset-2"
    : active
      ? "ring-2 ring-accent"
      : "ring-1 ring-zinc-200 hover:ring-zinc-400 focus-visible:ring-zinc-500"
}`}
```

- [x] **Step 2: Gesture.** In `useCanvasGesture.ts`:

Add `useUiStore.getState().setCrossDrag(null);` to `endGesture()`, so drop, Escape, and pointer cancel all clear it.

Add a helper next to `toLogical`:

```ts
function dropSlideAt(x: number, y: number, sourceSlideId: string): string | null {
  const id = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-slide-id]")?.dataset.dropSlideId;
  return id && id !== sourceSlideId ? id : null;
}
```

The ghost is `pointer-events-none`, so `elementFromPoint` sees through it.

In `onPointerMove`, case `"move"`, right after `g.started = true;`:

```ts
const rect = event.currentTarget.getBoundingClientRect();
const { clientX: x, clientY: y } = event;
if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
  ui.setDragPreview(null);
  ui.setCrossDrag({
    ids: g.ids,
    group: g.group,
    scale: g.scale,
    left: x - (g.origin.x - g.group.x) * g.scale,
    top: y - (g.origin.y - g.group.y) * g.scale,
    targetSlideId: dropSlideAt(x, y, slideId),
    copy: event.altKey,
  });
  return;
}
if (ui.crossDrag) ui.setCrossDrag(null);
```

In `onPointerUp`, replace the `if (g.kind === "move") { … }` block with:

```ts
if (g.kind === "move") {
  const cross = useUiStore.getState().crossDrag;
  if (cross) {
    if (cross.targetSlideId) moveElementsToSlide(g.ids, cross.targetSlideId, event.altKey);
  } else {
    if (!g.started && g.wasSelected) useUiStore.getState().setSelection([g.pressedId]);
    const ops: Op[] = g.ids.flatMap((id): Op[] => {
      const box = preview?.boxes[id];
      return box && !sameBox(box, g.startBoxes[id]!) ? [{ op: "move_element", id, box: { x: box.x, y: box.y } }] : [];
    });
    if (ops.length > 0) applyOps(ops, { source: "user", label: countLabel("Move", ops.length) });
  }
}
```

Import `moveElementsToSlide` from `@/lib/canvas/actions`. Escape needs no change: the existing capture-phase keydown handler already ends the gesture.

- [x] **Step 3: Ghost.** New `src/components/canvas/CrossSlideGhost.tsx`. It must render through a portal: `ScaledArtboard` applies a `transform`, which would turn `position: fixed` into position relative to the artboard.

```tsx
"use client";

import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { ElementView } from "@/components/slide/elements/ElementView";
import type { Element } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";

export function CrossSlideGhost() {
  const drag = useUiStore((s) => s.crossDrag);
  const elements = useDeckStore(
    useShallow((s) => (drag?.ids ?? []).map((id) => s.deck.elements[id]).filter((e): e is Element => e !== undefined)),
  );
  const number = useDeckStore((s) => (drag?.targetSlideId ? s.deck.slideOrder.indexOf(drag.targetSlideId) + 1 : 0));
  if (!drag) return null;
  const { group, scale } = drag;

  return createPortal(
    <div className="pointer-events-none fixed z-50" style={{ left: drag.left, top: drag.top }}>
      <div
        className="relative overflow-hidden opacity-70 shadow-xl ring-1 ring-accent"
        style={{ width: group.w * scale, height: group.h * scale }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={
            {
              transform: `scale(${scale}) translate(${-group.x}px, ${-group.y}px)`,
              "--artboard-scale": scale,
            } as CSSProperties
          }
        >
          {elements.map((element) => (
            <div
              key={element.id}
              className="absolute"
              style={{ left: element.box.x, top: element.box.y, width: element.box.w, height: element.box.h }}
            >
              <ElementView element={element} variant="thumbnail" />
            </div>
          ))}
        </div>
      </div>
      <span className="absolute -top-6 left-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white">
        {drag.targetSlideId ? `${drag.copy ? "Copy" : "Move"} to slide ${number}` : "Drop on a slide thumbnail"}
      </span>
    </div>,
    document.body,
  );
}
```

`variant="thumbnail"` turns off chart animation, so the ghost doesn't replay it on every frame.

- [x] **Step 4: Mount it.** In `CanvasStage`, wrap the return in a fragment and render `<CrossSlideGhost />` after `</ArtboardViewport>`.

- [x] **Step 5: Check.** `npm run lint` and `npx tsc --noEmit` pass. On the sample deck:
  1. Drag the chart left, off the slide. It reappears at its original spot, the ghost follows with the grab point under the cursor, and the label reads "Drop on a slide thumbnail".
  2. Hover slide 4's thumbnail: ring plus "Move to slide 4". Drop: the canvas shows slide 4 with the chart selected at the same x/y, and both thumbnails update. One ⌘Z undoes it.
  3. Hold Alt over a thumbnail and nudge the mouse: "Copy to slide N". Drop: the original stays, the copy lands on the target with a new id.
  4. Press Escape mid-drag, and separately drop on the canvas gray area: nothing changes and the ghost disappears.
  5. Hover the current slide's thumbnail: no ring, and a drop cancels.
  6. Select two elements and drag them over: both move, keeping their positions relative to each other; one undo step.
  7. Make an element nearly full-width on slide 1, then drag it onto a slide: it stays inside the artboard.
  8. Plain in-slide drag, resize, snapping, and marquee still work, as does reordering thumbnails by drag.
  9. Ask the AI "make the chart a line chart" after moving it: it edits the chart on its new slide (check the receipt and the pulse).

- [x] **Step 6: Commit.** `feat(canvas): drag elements onto a filmstrip thumbnail to move or copy them`

---

## Task 3: Decisions note

- [x] **Step 1:** In `docs/superpowers/specs/2026-10-23-ai-presentation-builder-design.md` section 6, replace "Context-menu 'Move to slide…' as a supplementary path." with "A 'Move to…' select in the selection toolbar is the non-drag path." Add any decision that changed during the checklist to the table above.
- [x] **Step 2: Commit.** `docs: stage 7 decisions`
