# Cross-slide drag

Dragging selected elements off the canvas onto a filmstrip thumbnail to move (or, with Alt, copy) them to another slide.

[← Back to the architecture overview](../ARCHITECTURE.md)

## Where it sits in the flow

Part of manual editing (step 4c of the [end-to-end flow](../ARCHITECTURE.md#1-end-to-end-flow)). It is a continuation of the [canvas](canvas-editing.md) move gesture, with [filmstrip](filmstrip.md) thumbnails as drop targets, and it commits `move_element` ops to the [deck model](deck-model.md).

## Files

| File | Purpose |
|---|---|
| `components/canvas/useCanvasGesture.ts` | Detects leaving the artboard, tracks the drop target, commits on pointer up. |
| `components/canvas/CrossSlideGhost.tsx` | The floating preview under the pointer. |
| `components/filmstrip/SlideThumbnail.tsx` | `data-drop-slide-id` on each thumbnail button, and the target ring. |
| `lib/canvas/actions.ts` | `moveElementsToSlide`, `moveSelectionToSlide`. |
| `lib/ui/store.ts` | `crossDrag` state. |

## Two drag systems

| Interaction | Implementation | Why |
|---|---|---|
| Reordering slides in the filmstrip | `@dnd-kit/sortable` | A vertical sortable list is what dnd-kit does well, including the drag overlay and accessibility announcements. |
| Moving, resizing, and marquee-selecting on the canvas, and dragging elements onto another slide | Custom pointer events in `useCanvasGesture` | Needs scale-aware coordinates, snapping, resize handles, axis locking, and one undo entry per drag. A list-oriented library doesn't help with that. |

They never conflict: canvas drags use pointer capture on the stage and find drop targets by hit-testing the DOM, not by registering dnd-kit droppables.

## Sequence

```mermaid
sequenceDiagram
  participant P as Pointer (captured by stage)
  participant G as useCanvasGesture
  participant UI as useUiStore
  participant Ghost as CrossSlideGhost
  participant Th as SlideThumbnail
  participant D as useDeckStore

  P->>G: move inside the artboard
  G->>UI: setDragPreview(boxes) (normal move)
  P->>G: move outside the artboard rect
  G->>UI: setDragPreview(null), setCrossDrag({ids, group, scale, left, top, targetSlideId, copy})
  UI-->>Ghost: render the floating preview at (left, top)
  UI-->>Th: thumbnail where targetSlideId matches shows a drop ring
  P->>G: pointer up
  alt over a thumbnail
    G->>D: moveElementsToSlide(ids, target, altKey) → move_element {toSlideId, copy}
    G->>UI: goToSlide(target), select the moved elements
  else anywhere else
    G->>UI: clear; nothing changes
  end
```

## Switching modes

On every pointer move during a `move` gesture, the hook checks whether the pointer is inside the artboard's bounding rect. When it leaves:

- `dragPreview` is cleared, so the elements reappear at their original positions on the canvas.
- `crossDrag` is set to `{ ids, group, scale, left, top, targetSlideId, copy }`. `scale` is the canvas scale capped at the thumbnail scale (224/1600). `left` and `top` keep the ghost under the pointer at the same grab offset.
- The drop target is `document.elementFromPoint(x, y)?.closest("[data-drop-slide-id]")`. The source slide is ignored, so dropping back onto it does nothing.
- `copy` is `event.altKey` and can change at any time during the drag.

When the pointer returns to the artboard, `crossDrag` is cleared and the normal move preview resumes.

## Feedback

- `CrossSlideGhost` renders the dragged elements with the same `ElementView`s, offset by the group's origin so they keep their relative layout. Its label reads "Move to slide N", "Copy to slide N", or "Drop on a slide thumbnail". It is portaled to `document.body` because the `transform` on `ScaledArtboard` would otherwise make `position: fixed` relative to the artboard.
- The target `SlideThumbnail` shows an offset accent ring.

## Committing

On pointer up with a target, `moveElementsToSlide(ids, targetSlideId, copy)` sends one batch of `move_element` ops labelled, for example, "Move 2 elements to slide 4". In `ops.ts`, `move_element` with `toSlideId`:

- **Move:** removes the id from the source slide's `elementOrder`, appends it to the target's (on top in z-order), and updates `element.slideId`. The id stays the same.
- **Copy:** deep-clones the element with `structuredClone`, gives it a new id, and appends it to the target. The original stays.
- The box is kept and clamped. Every slide uses the same 1600×900 artboard, so elements land where they were on the source slide.

The editor then goes to the target slide and selects the landed elements using the ids from the `OpResult`s. One ⌘Z puts everything back.

## Other ways to do the same thing

- **Move to…** in `SelectionToolbar` calls `moveSelectionToSlide`, the same code path. It is the keyboard-accessible option.
- The AI's `move_element` tool accepts `toSlideId` and `copy` and produces the same op.
