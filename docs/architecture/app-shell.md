# App shell and UI state

The page, the three-column editor layout, global keyboard shortcuts, and the transient editor state (`useUiStore`) that every other UI component reads.

[← Back to the architecture overview](../ARCHITECTURE.md)

## Where it sits in the flow

This is step 1 of the [end-to-end flow](../ARCHITECTURE.md#1-end-to-end-flow). The shell mounts once, waits for [persistence](persistence.md) to restore the saved deck, and then hosts every other region: the [filmstrip](filmstrip.md) on the left, the [canvas](canvas-editing.md) in the middle, and the [chat](chat.md) and inspector on the right.

## Files

| File | Purpose |
|---|---|
| `src/app/layout.tsx` | Root HTML layout and metadata. |
| `src/app/page.tsx` | The only page. Loads `EditorShell` with `next/dynamic` and `ssr: false`, because the editor depends on browser APIs such as IndexedDB and `ResizeObserver`. Its "Loading editor…" fallback also covers the suspense while the saved deck is restored. |
| `src/app/globals.css` | Tailwind import, theme tokens (`accent`, `chrome-border`), AI pulse and shimmer animations, and the `@media print` rules used by [PDF export](pdf-export.md). |
| `components/shell/EditorShell.tsx` | Header (deck title, New deck, selection toolbar, undo/redo, Export PDF), the left filmstrip column, the canvas region, and the right panel. Calls `use(restoreDeck())` so nothing renders until the saved deck is loaded. |
| `components/shell/RightPanel.tsx` | The Chat and Format tabs. Switches to Chat whenever an AI turn starts, and shows a pulse on the Chat tab if the user is on Format while the AI replies. |
| `components/shell/SelectionToolbar.tsx` | Z-order, **Move to…** (keyboard-accessible cross-slide move), duplicate, delete. |
| `components/shell/useEditorShortcuts.ts` | One window `keydown` listener for global shortcuts. |
| `lib/ui/store.ts` | `useUiStore`: transient editor state (see below). |
| `lib/ui/useCurrentSlideId.ts`, `lib/ui/useSelectedIds.ts` | Hooks that resolve stored ids against the live deck, so they never point at deleted slides or elements. |

## Canvas region states

`CanvasArea` in `EditorShell` picks what the middle column shows:

- No slides and generation is planning: `PlanningState` (skeleton).
- No slides otherwise: `EmptyDeck` (the "describe your presentation" prompt).
- Otherwise: `InsertToolbar` above `CanvasStage` for the current slide.

## `useUiStore`: transient state

Nothing in this store is saved or undoable. It holds what is happening right now:

| Field | Used for |
|---|---|
| `currentSlideId`, `selectedIds` | Which slide the canvas shows and which elements are selected. `goToSlide` clears the selection when the slide changes. |
| `dragPreview` | Boxes and snap guides during a move or resize. The deck is not touched until pointer up. See [canvas editing](canvas-editing.md). |
| `crossDrag` | State of a drag that has left the artboard. See [cross-slide drag](cross-slide-drag.md). |
| `marquee` | The marquee rectangle while selecting. |
| `draggingSlideId`, `renamingSlideId` | Filmstrip reorder and inline rename in progress. |
| `editing` | The open text or table-cell editor. The [agent runtime](agent-runtime.md) refuses tool calls that target this element. |
| `aiHighlights` | Ids to pulse after an AI change, cleared after 1.5 s. |
| `rightPanel` | `"chat"` or `"format"`. |

The store also subscribes to the deck store: when the current slide is deleted (by the user, the AI, or undo), the view moves to the slide that took its place and clears the selection, rename, and edit session.

## Keyboard shortcuts

Ignored while focus is in an input, textarea, select, contenteditable, or open menu, and while a filmstrip slide is being dragged.

| Keys | Action |
|---|---|
| ⌘Z / ⌘⇧Z / ⌘Y | Undo / redo |
| ⌘P | Export PDF |
| ⌘D | Duplicate the selection, or the current slide if the filmstrip has focus |
| ⌘A | Select all on the current slide |
| ⌘] / ⌘[ (with ⇧: to front / back) | Z-order |
| Delete / Backspace | Delete the selection, or the current slide if the filmstrip has focus |
| Arrows (⇧ for 20 units) | Nudge the selection; with no selection, previous / next slide |
| PageUp / PageDown | Previous / next slide |
| Enter | Start editing the single selected element |
| Escape | Clear the selection |
