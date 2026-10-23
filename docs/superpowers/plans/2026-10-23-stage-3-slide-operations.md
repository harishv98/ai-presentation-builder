# Stage 3: Slide Operations — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Automated tests are deferred to stage 9 (design doc D14); each task ends with a manual check instead.

**Goal:** The user can reorder slides by dragging thumbnails in the filmstrip (with an obvious landing slot), add a blank slide after the current one or at the end, duplicate, delete, and rename slides — every change is one undoable transaction, and the editor always shows a sensible slide afterwards.

**Architecture:** The deck ops already exist (`add_slide`, `delete_slide`, `duplicate_slide`, `reorder_slides`, `update_slide`); this stage adds the UI around them. Slide actions are plain functions in `src/lib/slides/actions.ts` that read both stores with `getState()` and call `applyOps`, like the stage 2 canvas actions. Filmstrip reordering uses `dnd-kit` sortable (D9); the drag lives in dnd-kit's own state and commits one `reorder_slides` on drop. A deck-store subscription in the UI store moves the editor to a neighbouring slide whenever the current slide disappears, so deletes, undos, and (later) AI tool calls all behave the same.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Tailwind 4, Zustand 5, Immer 11. New: `@dnd-kit/core` 6, `@dnd-kit/sortable` 10, `@dnd-kit/modifiers` 9, `@dnd-kit/utilities` 3.

## Global Constraints

- Every deck mutation goes through `applyOps`. Components never write `deck` directly.
- A slide drag writes nothing to the deck while moving; exactly one `reorder_slides` is committed on drop. Escape, or dropping at the original position, adds no history entry.
- Slide ids are stable across reorder and rename; duplicate creates new slide and element ids.
- Rename and drag state are UI state: not in history, not persisted.
- Keyboard shortcuts stay ignored while focus is in an `input`, `textarea`, `select`, or `[contenteditable]` (so typing a slide name never deletes a slide).
- Element drags (stage 2, stage 7) and slide drags never share a drag system: slide drags start only on a thumbnail, element drags only on the canvas (D9).
- No automated tests in this stage (D14).

## Decisions introduced in this stage (to confirm)

| # | Decision | Why |
|---|----------|-----|
| S3-a | Use the stable `@dnd-kit/core` + `@dnd-kit/sortable` packages, not the new `@dnd-kit/react` (still 0.x). Pointer dragging only; no keyboard sorting | `@dnd-kit/react` is pre-1.0. dnd-kit's keyboard sorting uses Space and arrow keys, which clash with clicking a thumbnail and with arrow-key slide navigation |
| S3-b | Drop indicator: while dragging, the other thumbnails slide out of the way, the spot where the slide will land shows as a dashed indigo slot, and the floating thumbnail (locked to vertical movement) carries a "Slide N" badge with its landing position | The spec asks for an obvious insertion index; the slot shows where, the badge shows which number |
| S3-c | A press turns into a slide drag after 5 screen px; a plain click navigates. The dropped slide becomes the current slide | Clicking must keep working; selecting the dragged slide matches Keynote and Slides |
| S3-d | A new slide is blank: layout `blank`, title "Untitled slide", white background, no elements. "+ New" in the filmstrip header inserts it after the current slide; "+ Add slide" under the last thumbnail appends it at the end. The new slide becomes current | Covers the spec's "after current, at end". AI generation (stage 5) fills slides; manual add stays blank |
| S3-e | Duplicate inserts the copy right after the original, titled "<title> (copy)", and makes it current | Already how the `duplicate_slide` op works; navigating to it shows the result |
| S3-f | Delete has no confirmation; ⌘Z restores the slide with its elements at its old position. The last remaining slide can be deleted, which shows the empty state with an "Add blank slide" button | Undo is the safety net, like element delete. The empty state is required by the spec anyway |
| S3-g | When the current slide disappears (delete, undoing an add, later an AI `delete_slide`), the editor shows the slide that took its position, or the new last slide | Handled once in a deck-store subscription, so every writer gets the same behaviour. Without it the editor jumps to slide 1 |
| S3-h | Rename changes the slide's `title` (the filmstrip label and the slide title the AI sees), not the title text box on the canvas. Double-click the label or press "Rename"; Enter or clicking away saves, Escape cancels; the name is trimmed, capped at 120 characters, and an empty name keeps the old title | The slide title is metadata; the on-canvas heading is an element edited in stage 6. Syncing them would need a rule for slides with zero or several title boxes |
| S3-i | Keyboard: after clicking a thumbnail (focus is in the filmstrip) and with no element selected, Delete/Backspace deletes the current slide and ⌘D duplicates it. A canvas selection always takes precedence. There is no "new slide" shortcut | Matches Keynote/Slides. The usual new-slide keys (⌘M, ⌘⇧N) are taken by macOS and the browser |
| S3-j | All editor shortcuts are ignored while a slide is being dragged | ⌘Z or Delete mid-drag would change the list dnd-kit is sorting |
| S3-k | Thumbnail artwork is memoized | dnd-kit re-renders every sortable item while dragging; this keeps charts in thumbnails from re-rendering each frame |

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` (modify) | Adds the four `@dnd-kit/*` packages |
| `src/lib/ui/store.ts` (modify) | Adds `draggingSlideId`, `renamingSlideId` and setters; deck subscription that follows a vanished current slide (S3-g) |
| `src/lib/slides/actions.ts` | `addBlankSlide`, `duplicateCurrentSlide`, `deleteCurrentSlide`, `startRenamingCurrentSlide`, `renameSlide`, `moveSlide`, `isFilmstripFocused` |
| `src/components/filmstrip/Filmstrip.tsx` (rewrite) | `DndContext` + `SortableContext`, drag overlay with the "Slide N" badge, "+ Add slide" button, empty state |
| `src/components/filmstrip/SlideThumbnail.tsx` | One sortable thumbnail: number, memoized artwork, landing slot while dragging, title label |
| `src/components/filmstrip/SlideTitle.tsx` | Title label with inline rename input |
| `src/components/filmstrip/FilmstripToolbar.tsx` | "Slides" heading, "+ New", Duplicate, Rename, Delete for the current slide |
| `src/components/shell/useEditorShortcuts.ts` (modify) | Slide Delete / ⌘D when the filmstrip has focus; ignore keys during a slide drag |
| `src/components/shell/EditorShell.tsx` (modify) | Uses `FilmstripToolbar`; empty canvas state gets an "Add blank slide" button |

---

### Task 1: Slide actions and current-slide follow

**Files:**
- Modify: `package.json` (via npm), `src/lib/ui/store.ts`
- Create: `src/lib/slides/actions.ts`

**Interfaces:**
- Consumes: `useDeckStore` (`applyOps`, `deck`), `resolveCurrentSlideId`, `useUiStore.goToSlide`.
- Produces:
  - UI store: `draggingSlideId: string | null`, `renamingSlideId: string | null`, `setDraggingSlideId(id)`, `setRenamingSlideId(id)`
  - `type NewSlidePosition = "after-current" | "end"`
  - `addBlankSlide(position: NewSlidePosition): void`
  - `duplicateCurrentSlide(): void`, `deleteCurrentSlide(): void`, `startRenamingCurrentSlide(): void`
  - `renameSlide(id: string, title: string): void`
  - `moveSlide(id: string, toIndex: number): void`
  - `isFilmstripFocused(): boolean`

- [ ] **Step 1: Install dnd-kit**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers @dnd-kit/utilities
```

Expect `@dnd-kit/core` 6.3.x, `@dnd-kit/sortable` 10.x, `@dnd-kit/modifiers` 9.x, `@dnd-kit/utilities` 3.x in `package.json`.

- [ ] **Step 2: UI store state and current-slide follow** (decision S3-g)

Add to `UiState` and the initial state in `src/lib/ui/store.ts`:

```ts
  draggingSlideId: string | null;
  renamingSlideId: string | null;
  setDraggingSlideId: (id: string | null) => void;
  setRenamingSlideId: (id: string | null) => void;
```

```ts
  draggingSlideId: null,
  renamingSlideId: null,
  setDraggingSlideId: (id) => set({ draggingSlideId: id }),
  setRenamingSlideId: (id) => set({ renamingSlideId: id }),
```

Below `goRelative`, add the subscription:

```ts
useDeckStore.subscribe((state, prev) => {
  if (state.deck.slideOrder === prev.deck.slideOrder) return;
  const { currentSlideId } = useUiStore.getState();
  if (!currentSlideId || state.deck.slides[currentSlideId]) return;
  const order = state.deck.slideOrder;
  const was = prev.deck.slideOrder.indexOf(currentSlideId);
  const next = order[Math.min(Math.max(was, 0), order.length - 1)] ?? null;
  useUiStore.setState({ currentSlideId: next, selectedIds: [], renamingSlideId: null });
});
```

When `currentSlideId` is still `null` (nothing clicked yet), `resolveCurrentSlideId` already falls back to the first slide, which is the right neighbour after deleting slide 1.

- [ ] **Step 3: Slide actions**

```ts
// src/lib/slides/actions.ts
import { useDeckStore } from "@/lib/deck/store";
import { resolveCurrentSlideId, useUiStore } from "@/lib/ui/store";

export type NewSlidePosition = "after-current" | "end";

const MAX_TITLE_LENGTH = 120;

function currentSlideId(): string | null {
  return resolveCurrentSlideId(useDeckStore.getState().deck, useUiStore.getState().currentSlideId);
}

export function addBlankSlide(position: NewSlidePosition): void {
  const { deck, applyOps } = useDeckStore.getState();
  const current = currentSlideId();
  const index =
    position === "after-current" && current ? deck.slideOrder.indexOf(current) + 1 : deck.slideOrder.length;
  const [result] = applyOps([{ op: "add_slide", index, slide: { title: "Untitled slide" } }], {
    source: "user",
    label: "Add slide",
  });
  if (result?.ok && result.id) useUiStore.getState().goToSlide(result.id);
}

export function duplicateCurrentSlide(): void {
  const id = currentSlideId();
  if (!id) return;
  const [result] = useDeckStore
    .getState()
    .applyOps([{ op: "duplicate_slide", id }], { source: "user", label: "Duplicate slide" });
  if (result?.ok && result.id) useUiStore.getState().goToSlide(result.id);
}

export function deleteCurrentSlide(): void {
  const id = currentSlideId();
  if (id) useDeckStore.getState().applyOps([{ op: "delete_slide", id }], { source: "user", label: "Delete slide" });
}

export function startRenamingCurrentSlide(): void {
  const id = currentSlideId();
  if (id) useUiStore.getState().setRenamingSlideId(id);
}

export function renameSlide(id: string, title: string): void {
  const { deck, applyOps } = useDeckStore.getState();
  const slide = deck.slides[id];
  const next = title.trim().slice(0, MAX_TITLE_LENGTH);
  if (!slide || !next || next === slide.title) return;
  applyOps([{ op: "update_slide", id, patch: { title: next } }], { source: "user", label: "Rename slide" });
}

export function moveSlide(id: string, toIndex: number): void {
  const { deck, applyOps } = useDeckStore.getState();
  const from = deck.slideOrder.indexOf(id);
  if (from === -1 || from === toIndex) return;
  applyOps([{ op: "reorder_slides", id, toIndex }], { source: "user", label: "Reorder slide" });
}

export function isFilmstripFocused(): boolean {
  return document.activeElement?.closest("[data-filmstrip]") != null;
}
```

`reorder_slides` removes the id and re-inserts it at `toIndex`, which is the same as dnd-kit's `arrayMove(from, to)` with `to` = the index of the slide it was dropped over.

- [ ] **Step 4: Verify in the console** — `npm run typecheck` and `npm run lint` pass. In the browser on slide 2: `deckStore.getState().applyOps([{ op: "delete_slide", id: uiStore.getState().currentSlideId ?? deckStore.getState().deck.slideOrder[0] }], { source: "user", label: "Delete slide" })` — the canvas shows the slide that was third, not slide 1. ⌘Z brings the slide back.

- [ ] **Step 5: Commit** — `git commit -m "feat(slides): slide actions and follow the current slide when it is removed"`

---

### Task 2: Sortable filmstrip with landing slot and overlay

**Files:**
- Rewrite: `src/components/filmstrip/Filmstrip.tsx`
- Create: `src/components/filmstrip/SlideThumbnail.tsx`, `src/components/filmstrip/SlideTitle.tsx`

**Interfaces:**
- Consumes: `moveSlide`, `addBlankSlide`, `renameSlide`; UI store `draggingSlideId`, `renamingSlideId`, `goToSlide`.
- Produces: `Filmstrip`, `SlideThumbnail`, `ThumbnailArt` (memoized artwork), `THUMBNAIL_WIDTH`, `SlideTitle`.

- [ ] **Step 1: Thumbnail** (decisions S3-b, S3-k). The sortable node is the `<li>`; only the artwork button starts a drag, so the title input below it never does.

```tsx
// src/components/filmstrip/SlideThumbnail.tsx
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useEffect, useRef } from "react";
import { ScaledArtboard } from "@/components/slide/ScaledArtboard";
import { SlideRenderer } from "@/components/slide/SlideRenderer";
import { ARTBOARD_WIDTH } from "@/lib/deck/constants";
import { useUiStore } from "@/lib/ui/store";
import { SlideTitle } from "./SlideTitle";

export const THUMBNAIL_WIDTH = 168;

export const ThumbnailArt = memo(function ThumbnailArt({ slideId }: { slideId: string }) {
  return (
    <ScaledArtboard scale={THUMBNAIL_WIDTH / ARTBOARD_WIDTH}>
      <SlideRenderer slideId={slideId} variant="thumbnail" />
    </ScaledArtboard>
  );
});

export function SlideThumbnail({ slideId, index, active }: { slideId: string; index: number; active: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: slideId,
  });
  const goToSlide = useUiStore((s) => s.goToSlide);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (active) buttonRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className="relative">
      <div className={`flex items-start gap-2 ${isDragging ? "invisible" : ""}`}>
        <span className={`w-4 pt-1 text-right text-xs tabular-nums ${active ? "font-semibold text-accent" : "text-zinc-400"}`}>
          {index + 1}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <button
            {...attributes}
            {...listeners}
            ref={(node) => {
              buttonRef.current = node;
              setActivatorNodeRef(node);
            }}
            type="button"
            onClick={() => goToSlide(slideId)}
            aria-current={active ? "true" : undefined}
            className={`block overflow-hidden rounded-sm ring-offset-1 focus:outline-none ${
              active ? "ring-2 ring-accent" : "ring-1 ring-zinc-200 hover:ring-zinc-400 focus-visible:ring-zinc-500"
            }`}
          >
            <ThumbnailArt slideId={slideId} />
          </button>
          <SlideTitle slideId={slideId} />
        </div>
      </div>
      {isDragging && (
        <div
          aria-hidden
          className="absolute top-0 left-6 aspect-video rounded-sm border-2 border-dashed border-accent bg-accent/5"
          style={{ width: THUMBNAIL_WIDTH }}
        />
      )}
    </li>
  );
}
```

- [ ] **Step 2: Title label with inline rename** (decision S3-h). Enter blurs, blur saves, Escape sets a flag so the following blur doesn't save.

```tsx
// src/components/filmstrip/SlideTitle.tsx
"use client";

import { useEffect, useRef } from "react";
import { useDeckStore } from "@/lib/deck/store";
import { renameSlide } from "@/lib/slides/actions";
import { useUiStore } from "@/lib/ui/store";
import { THUMBNAIL_WIDTH } from "./SlideThumbnail";

export function SlideTitle({ slideId }: { slideId: string }) {
  const title = useDeckStore((s) => s.deck.slides[slideId]?.title ?? "");
  const renaming = useUiStore((s) => s.renamingSlideId === slideId);
  const setRenamingSlideId = useUiStore((s) => s.setRenamingSlideId);

  if (renaming) return <TitleInput slideId={slideId} title={title} onDone={() => setRenamingSlideId(null)} />;

  return (
    <span
      className="cursor-text truncate text-xs text-zinc-600"
      style={{ maxWidth: THUMBNAIL_WIDTH }}
      title="Double-click to rename"
      onDoubleClick={() => setRenamingSlideId(slideId)}
    >
      {title}
    </span>
  );
}

function TitleInput({ slideId, title, onDone }: { slideId: string; title: string; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      defaultValue={title}
      maxLength={120}
      aria-label="Slide title"
      className="rounded-sm border border-accent px-1 py-0.5 text-xs text-zinc-800 outline-none"
      style={{ width: THUMBNAIL_WIDTH }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        if (!cancelled.current) renameSlide(slideId, event.currentTarget.value);
        onDone();
      }}
    />
  );
}
```

`SlideTitle.tsx` and `SlideThumbnail.tsx` import each other (`THUMBNAIL_WIDTH` one way, `SlideTitle` the other). If oxlint or the bundler complains about the cycle, move `THUMBNAIL_WIDTH` to `src/components/filmstrip/constants.ts`.

- [ ] **Step 3: Filmstrip** (decisions S3-a, S3-b, S3-c)

```tsx
// src/components/filmstrip/Filmstrip.tsx
"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState } from "react";
import { useDeckStore } from "@/lib/deck/store";
import { addBlankSlide, moveSlide } from "@/lib/slides/actions";
import { useUiStore } from "@/lib/ui/store";
import { useCurrentSlideId } from "@/lib/ui/useCurrentSlideId";
import { SlideThumbnail, ThumbnailArt } from "./SlideThumbnail";

const DRAG_ACTIVATION_PX = 5;

const screenReaderInstructions = {
  draggable: "Drag a slide thumbnail with the pointer to reorder slides.",
};

export function Filmstrip() {
  const slideOrder = useDeckStore((s) => s.deck.slideOrder);
  const currentSlideId = useCurrentSlideId();
  const draggingSlideId = useUiStore((s) => s.draggingSlideId);
  const setDraggingSlideId = useUiStore((s) => s.setDraggingSlideId);
  const [overIndex, setOverIndex] = useState(0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_PX } }));

  function onDragStart({ active }: DragStartEvent) {
    setDraggingSlideId(String(active.id));
    setOverIndex(slideOrder.indexOf(String(active.id)));
  }

  function onDragOver({ over }: DragOverEvent) {
    if (over) setOverIndex(slideOrder.indexOf(String(over.id)));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDraggingSlideId(null);
    const id = String(active.id);
    if (over) moveSlide(id, slideOrder.indexOf(String(over.id)));
    useUiStore.getState().goToSlide(id);
  }

  return (
    <div className="flex flex-col gap-3">
      {slideOrder.length > 0 && (
        <DndContext
          id="filmstrip"
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{ screenReaderInstructions }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDraggingSlideId(null)}
        >
          <SortableContext items={slideOrder} strategy={verticalListSortingStrategy}>
            <ol data-filmstrip className="flex flex-col gap-3">
              {slideOrder.map((slideId, index) => (
                <SlideThumbnail key={slideId} slideId={slideId} index={index} active={slideId === currentSlideId} />
              ))}
            </ol>
          </SortableContext>
          <DragOverlay modifiers={[restrictToVerticalAxis]} dropAnimation={null}>
            {draggingSlideId ? (
              <div className="flex items-start gap-2">
                <span className="w-4" />
                <div className="relative rounded-sm shadow-xl ring-2 ring-accent">
                  <ThumbnailArt slideId={draggingSlideId} />
                  <span className="absolute -top-2 -right-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
                    Slide {overIndex + 1}
                  </span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
      <button
        type="button"
        onClick={() => addBlankSlide("end")}
        title="Add a blank slide at the end"
        className="ml-6 flex aspect-video items-center justify-center rounded-sm border border-dashed border-zinc-300 text-xs text-zinc-500 hover:border-accent hover:text-accent"
      >
        + Add slide
      </button>
    </div>
  );
}
```

Notes:
- `id="filmstrip"` keeps dnd-kit's generated accessibility ids stable between server and client render.
- dnd-kit's `PointerSensor` cancels on Escape by itself and calls `onDragCancel`; the list snaps back and nothing is committed.
- Auto-scroll is on by default, so dragging near the top or bottom of the filmstrip `aside` scrolls it.
- The `aside` in `EditorShell` keeps `overflow-y-auto`; `DragOverlay` is `position: fixed`, so it isn't clipped.

- [ ] **Step 4: Verify** — `npm run typecheck` and `npm run lint` pass; run checklist items 1–4 below.

- [ ] **Step 5: Commit** — `git commit -m "feat(filmstrip): drag to reorder slides with landing slot and inline rename"`

---

### Task 3: Slide toolbar, empty state, and shortcuts

**Files:**
- Create: `src/components/filmstrip/FilmstripToolbar.tsx`
- Modify: `src/components/shell/EditorShell.tsx`, `src/components/shell/useEditorShortcuts.ts`

**Interfaces:**
- Consumes: slide actions from Task 1; `hasSelection`, `deleteSelection`, `duplicateSelection` from `src/lib/canvas/actions.ts`.
- Produces: `FilmstripToolbar`.

- [ ] **Step 1: Filmstrip toolbar** (decisions S3-d, S3-e, S3-f)

```tsx
// src/components/filmstrip/FilmstripToolbar.tsx
"use client";

import {
  addBlankSlide,
  deleteCurrentSlide,
  duplicateCurrentSlide,
  startRenamingCurrentSlide,
} from "@/lib/slides/actions";
import { useCurrentSlideId } from "@/lib/ui/useCurrentSlideId";

const buttonClass =
  "rounded px-1.5 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent";

export function FilmstripToolbar() {
  const hasSlide = useCurrentSlideId() !== null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Slides</h2>
        <button
          type="button"
          className={buttonClass}
          title="Add a blank slide after the current one"
          onClick={() => addBlankSlide("after-current")}
        >
          + New
        </button>
      </div>
      <div className="flex items-center gap-0.5">
        <button type="button" className={buttonClass} disabled={!hasSlide} title="Duplicate the current slide" onClick={duplicateCurrentSlide}>
          Duplicate
        </button>
        <button type="button" className={buttonClass} disabled={!hasSlide} title="Rename the current slide" onClick={startRenamingCurrentSlide}>
          Rename
        </button>
        <button type="button" className={`${buttonClass} text-red-600`} disabled={!hasSlide} title="Delete the current slide" onClick={deleteCurrentSlide}>
          Delete
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Shell** — in `EditorShell`, replace the `<h2>Slides</h2>` in the left `aside` with `<FilmstripToolbar />`, and make the empty canvas state actionable:

```tsx
function CanvasArea() {
  const slideId = useCurrentSlideId();

  if (!slideId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-zinc-400">
        <p>This deck has no slides yet.</p>
        <button
          type="button"
          onClick={() => addBlankSlide("end")}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Add blank slide
        </button>
      </div>
    );
  }

  return <CanvasStage slideId={slideId} />;
}
```

(The chat-driven empty state, "describe your deck", arrives in stage 5.)

- [ ] **Step 3: Shortcuts** (decisions S3-i, S3-j) — in `useEditorShortcuts`:

Right after the `isEditableTarget` check:

```ts
      if (useUiStore.getState().draggingSlideId) return;
```

Replace the ⌘D branch:

```ts
      if (mod && key === "d") {
        event.preventDefault();
        if (hasSelection()) duplicateSelection();
        else if (isFilmstripFocused()) duplicateCurrentSlide();
        return;
      }
```

Replace the Delete/Backspace branch:

```ts
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (hasSelection()) deleteSelection();
        else if (isFilmstripFocused()) deleteCurrentSlide();
        return;
      }
```

Import `deleteCurrentSlide`, `duplicateCurrentSlide`, `isFilmstripFocused` from `@/lib/slides/actions`.

- [ ] **Step 4: Verify** — `npm run typecheck` and `npm run lint` pass; run checklist items 5–12 below.

- [ ] **Step 5: Commit** — `git commit -m "feat(slides): add, duplicate, delete, rename slides from the filmstrip"`

---

### Task 4: Walk the checklist and hand off

- [ ] **Step 1:** Run the full checklist below in the browser and fix anything that fails.
- [ ] **Step 2:** `npm run typecheck` and `npm run lint` are clean.
- [ ] **Step 3:** Commit any fixes: `git commit -m "fix(slides): stage 3 checklist fixes"` (only if there were any).

---

## Stage 3 manual checklist (for you)

Run `npm run dev` (with `NODE_USE_SYSTEM_CA=1` exported), open http://localhost:3000.

**Reorder by drag (Task 2)**

1. Drag the slide 4 thumbnail up between slides 1 and 2. While dragging: the other thumbnails slide out of the way, a dashed indigo slot shows where it will land, the floating thumbnail only moves vertically, and its badge reads "Slide 2". Release: it is now slide 2, the numbers update, and it is the current slide on the canvas. The Undo tooltip reads "Undo: Reorder slide"; ⌘Z puts the order back.
2. Start dragging a slide and press Escape: everything snaps back, and no undo entry is added. Drag a slide a little and drop it in its own slot: no undo entry either.
3. Click a thumbnail without moving the mouse: it navigates, no drag starts. Add 4–5 slides with "+ Add slide", then drag the first slide towards the bottom of the filmstrip: the list scrolls.
4. Double-click the title under a thumbnail: an input appears with the text selected. Type "Roadmap" and press Enter: the label updates and the Undo tooltip reads "Undo: Rename slide". Double-click again, type something, press Escape: nothing changes. Clear the text and press Enter: the old title stays and no undo entry is added. The title text box on the canvas is not changed (S3-h). While typing, Backspace and the arrow keys edit the text and don't delete or switch slides.

**Toolbar, empty state, shortcuts (Task 3)**

5. On slide 2, click "+ New": an empty "Untitled slide" appears at position 3 and is current. ⌘Z removes it, and the canvas shows the slide now at position 3 (S3-g).
6. Click "+ Add slide" under the last thumbnail: a blank slide is appended, becomes current, and the filmstrip scrolls to it.
7. On slide 3 (the chart), click Duplicate: "… (copy)" appears at position 4 with the same chart, and is current. Move the chart on the copy: the original slide's thumbnail doesn't change. ⌘Z twice removes the move, then the copy.
8. On slide 2, click Delete: the slide that was third becomes slide 2 and is current. Go to the last slide and Delete it: the new last slide becomes current. ⌘Z restores the deleted slide at its old position with all its elements.
9. Click "Rename" in the toolbar: the current slide's title input opens (same behaviour as item 4).
10. Click a thumbnail, then press Backspace: that slide is deleted. Click a thumbnail, press ⌘D: it is duplicated. Now click an element on the canvas and press Delete: only the element is deleted, the slide stays.
11. Delete every slide: the canvas shows "This deck has no slides yet" with an "Add blank slide" button, the filmstrip shows only "+ Add slide", and Duplicate / Rename / Delete are disabled. "Add blank slide" creates slide 1. ⌘Z repeatedly brings the deleted slides back in their original order.
12. Stage 2 still works on a moved slide: select, drag, resize, ⌘D, Delete, ⌘Z. While dragging a slide, ⌘Z and Delete do nothing.
13. `npm run typecheck` and `npm run lint` are clean.
