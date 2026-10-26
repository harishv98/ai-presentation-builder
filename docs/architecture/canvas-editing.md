# Canvas editing

Manual editing of the current slide: selecting, moving, resizing, snapping, inserting elements, in-place text and table editing, and the Format inspector.

[← Back to the architecture overview](../ARCHITECTURE.md)

## Where it sits in the flow

Step 4c of the [end-to-end flow](../ARCHITECTURE.md#1-end-to-end-flow), the manual counterpart of the AI flows. Every commit is an `applyOps` call with `source: "user"` into the [deck model](deck-model.md). While a gesture is in progress, only the [UI store](app-shell.md#useuistore-transient-state) changes. Dragging elements off the artboard continues as a [cross-slide drag](cross-slide-drag.md).

## Files

| File | Purpose |
|---|---|
| `components/canvas/CanvasStage.tsx` | `ArtboardViewport` + `SlideRenderer` + overlays and editors for the current slide. Routes double-click to `startEditing`. |
| `components/canvas/ArtboardViewport.tsx` | Fits the 1600×900 artboard into the available space (with 48 px padding) and shows the zoom level. |
| `components/canvas/useCanvasGesture.ts` | Pointer handling for move, resize, marquee, and the hand-off to cross-slide drag. |
| `components/canvas/SelectionOverlay.tsx` | Selection outlines, resize handles, snap guides, and the marquee. |
| `components/canvas/TextEditor.tsx`, `TableCellEditor.tsx` | In-place editors positioned over the element. |
| `components/canvas/AiHighlightOverlay.tsx`, `SlideFillOverlay.tsx` | AI activity on the canvas (pulses, and the fill status of a generating slide). |
| `components/insert/InsertToolbar.tsx`, `ImagePickerButton.tsx` | Insert text, shapes, chart, table, or an uploaded image. |
| `components/inspector/` | The Format tab: `Inspector` picks `TextInspector`, `ImageInspector`, `ChartInspector`, or `TableInspector`; `fields.tsx` has shared form fields. |
| `components/shell/SelectionToolbar.tsx` | Z-order, Move to…, duplicate, delete for the selection. |
| `lib/canvas/geometry.ts` | Box helpers: translate, union, intersect, marquee rect, `clampGroupDelta` (keeps a multi-selection on the artboard). |
| `lib/canvas/snap.ts` | `snapMove`, `snapResize`, and `guidesFor`: snapping to the artboard and other elements' edges and centers. |
| `lib/canvas/resize.ts` | Eight handles and `resizeBox`, with optional aspect-ratio lock. |
| `lib/canvas/actions.ts` | Selection commands: delete, duplicate, nudge, z-order, select all, `moveElementsToSlide`. |
| `lib/content/actions.ts` | Edit sessions and commits: `startEditing`, `commitText`, `commitCell`, `editTableStructure`, `replaceImage`, `editElement`. |
| `lib/content/insert.ts` | Default elements and `insertElement` placement. |
| `lib/content/chartData.ts`, `tableData.ts` | Pure helpers for chart series and categories, and table rows and columns. |
| `lib/content/image.ts` | Reads an uploaded file into a data URL with its natural size. |

## Coordinates

All element boxes are in artboard units. `ArtboardViewport` computes a scale to fit the window, and `ScaledArtboard` applies it as a CSS `transform` and exposes `--artboard-scale` so overlays can keep line widths constant on screen. Pointer positions are converted with `scale = stageRect.width / 1600`.

## Gestures (`useCanvasGesture`)

**Pointer down** picks one of three gestures from the event target and captures the pointer, so the stage keeps receiving events even over the filmstrip:

| Target | Gesture |
|---|---|
| A resize handle (`data-handle`) with exactly one element selected | `resize` |
| An element (`data-element-id`) | `move`. If the element was already selected, the whole selection moves; otherwise it becomes the selection. Shift-click toggles it instead of moving. |
| Empty space | `marquee`. Shift keeps the current selection and adds to it. |

**Pointer move:**

- Nothing happens until the pointer moves 3 screen pixels, so a click doesn't nudge anything.
- **Move:** translate the group's bounding box by the delta. Shift locks to the dominant axis. `snapMove` pulls the group to edges and centers of the artboard and other elements within 6 screen pixels (⌘ or Ctrl disables snapping). `clampGroupDelta` keeps the group on the artboard. The result goes to `setDragPreview({ boxes, guides })`.
- **Resize:** `resizeBox` from the start box (Shift locks aspect ratio and disables snapping), then `snapResize`.
- **Marquee:** select every element whose box intersects the rectangle, plus the base selection.
- If the pointer leaves the artboard during a move, the gesture becomes a [cross-slide drag](cross-slide-drag.md).

**The deck is not touched while dragging.** `SlideRenderer` draws `previewBoxes` instead of stored boxes, and `SelectionOverlay` draws the guides.

**Pointer up** commits one batch:

- Move: a `move_element` op for each element whose box changed, labelled "Move element" or "Move N elements".
- Resize: one `update_element` box patch, "Resize element".
- A click (no drag) on an element in a multi-selection narrows the selection to that element.

**Escape** (a capture-phase `keydown` listener) cancels the gesture and drops the preview; for a marquee it also restores the previous selection. Pointer cancel does the same.

## Selection commands (`lib/canvas/actions.ts`)

| Command | Behaviour |
|---|---|
| `nudgeSelection` | Arrow keys move 1 unit, Shift+arrow 20. Clamped to the artboard. Nudges less than 800 ms apart share a `txnId`, so a burst undoes in one step. |
| `duplicateSelection` | `move_element` with `copy: true`, offset by 20 units (clamped), then selects the copies. |
| `reorderSelection` | Z-order ops that keep selected elements in their relative order and never swap them with each other. |
| `deleteSelection`, `selectAllOnSlide` | As named. |
| `moveElementsToSlide`, `moveSelectionToSlide` | See [cross-slide drag](cross-slide-drag.md). |

## Inserting elements

`InsertToolbar` calls `insertDefault(kind)` for text, rectangle, ellipse, line, chart, and table, and `insertImage` for an upload. Defaults are centered on the artboard. If an element already sits at exactly that position, the new one cascades by 20 units (up to 10 times). The new element is selected; for a chart or table, the Format tab opens so it can be filled in. Uploaded images are stored as data URLs and scaled to fit 800×500.

## Content editing

**Starting a session.** Double-click (or Enter with one element selected) calls `startEditing(id, { caret, cell })`, which looks up the element type's `activate` in the [element registry](deck-model.md#element-registry):

| `activate` | Result |
|---|---|
| `edit-text` | `editing = { kind: "text", caret }`. `TextEditor` replaces the element (the rendered copy is hidden) and places the caret where the user clicked. |
| `edit-cell` | `editing = { kind: "cell", row, col, txnId }` for the cell under the pointer. |
| `inspector` | Switch the right panel to Format. |
| `none` | Nothing. |

**Committing.** `commitText` writes the paragraphs as one "Edit text" entry and grows the box if the text no longer fits. `commitCell` writes one cell; all cells edited in one session share the session's `txnId`, so the session undoes as one step.

**AI interplay.** While an element is being edited, the [agent runtime](agent-runtime.md#executing-a-tool-call) rejects tool calls that target it, and AI changes don't switch slides.

## Inspector

The Format tab shows the inspector for the single selected element. Every field calls `editElement(id, patch, label, txnId?)`, which is one `update_element` op. Chart edits that happen continuously (for example, typing a series value) pass a `txnId` so they merge into one undo entry. `TableInspector` also adds and removes rows (at the bottom) and columns (at the right) through `editTableStructure`, adjusting the box height for rows.
