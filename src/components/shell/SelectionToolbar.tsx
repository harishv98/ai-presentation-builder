"use client";

import { deleteSelection, duplicateSelection, moveSelectionToSlide, reorderSelection } from "@/lib/canvas/actions";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";
import { useCurrentSlideId } from "@/lib/ui/useCurrentSlideId";
import { useSelectedIds } from "@/lib/ui/useSelectedIds";

const buttonClass = "rounded px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100";

export function SelectionToolbar() {
  const count = useSelectedIds().length;
  if (count === 0) return null;

  return (
    <div className="mr-4 ml-auto flex items-center gap-1">
      <span className="mr-1 text-xs text-zinc-500 tabular-nums">{count} selected</span>
      {count === 1 && (
        <button
          type="button"
          className={buttonClass}
          title="Format the selected element"
          onClick={() => useUiStore.getState().setRightPanel("format")}
        >
          Format
        </button>
      )}
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
      <MoveToSlide />
      <button type="button" className={buttonClass} title="Duplicate (⌘D)" onClick={duplicateSelection}>
        Duplicate
      </button>
      <button type="button" className={`${buttonClass} text-red-600`} title="Delete (⌫)" onClick={deleteSelection}>
        Delete
      </button>
    </div>
  );
}

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
