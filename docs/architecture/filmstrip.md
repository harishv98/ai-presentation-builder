# Filmstrip

The left sidebar: live slide thumbnails, slide navigation, add / duplicate / delete / rename, and drag-to-reorder. Thumbnails also act as drop targets for [cross-slide drag](cross-slide-drag.md).

[← Back to the architecture overview](../ARCHITECTURE.md)

## Where it sits in the flow

Step 4c of the [end-to-end flow](../ARCHITECTURE.md#1-end-to-end-flow), alongside [canvas editing](canvas-editing.md). Slide commands write to the [deck model](deck-model.md); thumbnails read it through the shared [renderer](rendering.md).

## Files

| File | Purpose |
|---|---|
| `components/filmstrip/Filmstrip.tsx` | dnd-kit `DndContext` + `SortableContext` over `deck.slideOrder`, and the `DragOverlay`. |
| `components/filmstrip/SlideThumbnail.tsx` | One sortable item: the thumbnail button (drag handle and cross-slide drop target), title, fill badge, and actions. |
| `components/filmstrip/SlideTitle.tsx` | Title with inline rename. |
| `components/filmstrip/SlideActions.tsx` | Per-slide delete button. |
| `components/filmstrip/FilmstripToolbar.tsx` | Add, duplicate, and delete buttons. |
| `components/filmstrip/FillBadge.tsx` | Per-slide [generation](deck-generation.md) status. |
| `components/filmstrip/constants.ts` | `THUMBNAIL_WIDTH` (224 px). |
| `lib/slides/actions.ts` | Slide commands (below). |

## Slide commands (`lib/slides/actions.ts`)

Each is one `applyOps` call, so one undo entry.

| Command | Op | Notes |
|---|---|---|
| `addBlankSlide(position)` | `add_slide` | After the current slide or at the end, then goes to it. |
| `duplicateCurrentSlide` | `duplicate_slide` | Goes to the copy. |
| `deleteSlide`, `deleteCurrentSlide` | `delete_slide` | The [UI store](app-shell.md#useuistore-transient-state) moves the view to a neighbour. |
| `renameSlide` | `update_slide` | Trimmed, max 120 chars, ignored if empty or unchanged. |
| `moveSlide(id, toIndex)` | `reorder_slides` | Used by drag-to-reorder. |
| `startNewDeck` | `delete_slide` × N + `update_deck` | "New deck" in the header. Undoable. Also resets generation state and the clarifying-question thread, then focuses the deck prompt. |

⌘D and Delete act on the current slide when the filmstrip has focus and nothing on the canvas is selected (`isFilmstripFocused` checks for a `[data-filmstrip]` ancestor).

## Reordering (dnd-kit)

- `PointerSensor` activates after 5 px, so a click still selects a slide. Collision detection is `closestCenter` with a vertical list strategy.
- Each `SlideThumbnail` calls `useSortable({ id: slideId })`. While a slide is dragged, its own spot shows a dashed placeholder, and the `DragOverlay` (locked to the vertical axis) shows the thumbnail with a "Slide N" badge for the drop position.
- `onDragStart` sets `useUiStore.draggingSlideId`. While it is set, global shortcuts are ignored and AI changes don't switch slides.
- `onDragEnd` calls `moveSlide(id, overIndex)` and goes to the moved slide.

The filmstrip uses dnd-kit and the canvas uses custom pointer events; the reason for two systems is explained in [cross-slide drag](cross-slide-drag.md#two-drag-systems).

## Thumbnails

Each thumbnail renders the same `SlideRenderer` as the canvas with `variant="thumbnail"`, inside a `ScaledArtboard` at 224/1600 scale. There is no separate thumbnail state, so reorders, cross-slide moves, and AI edits appear immediately. Zustand selectors with `useShallow` plus memoized element views mean only slides whose elements changed re-render.

A thumbnail also shows:

- An accent ring when it is the target of a cross-slide drag (`crossDrag?.targetSlideId === slideId`).
- An AI pulse when one of its elements was just changed by the AI.
- The fill status badge during generation.
