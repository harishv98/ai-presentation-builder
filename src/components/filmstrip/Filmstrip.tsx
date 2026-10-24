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
import { Tooltip } from "@/components/ui/Tooltip";
import { useDeckStore } from "@/lib/deck/store";
import { useGenerationStore } from "@/lib/generation/store";
import { addBlankSlide, moveSlide } from "@/lib/slides/actions";
import { useUiStore } from "@/lib/ui/store";
import { useCurrentSlideId } from "@/lib/ui/useCurrentSlideId";
import { THUMBNAIL_WIDTH } from "./constants";
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
  const planning = useGenerationStore((s) => s.phase === "planning");
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
      {planning && <OutlineGhost number={slideOrder.length + 1} />}
      <Tooltip content="Add a blank slide at the end" side="right">
        <button
          type="button"
          onClick={() => addBlankSlide("end")}
          className="ml-6 flex aspect-video items-center justify-center rounded-sm border border-dashed border-zinc-300 text-xs text-zinc-500 transition-colors outline-none hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          + Add slide
        </button>
      </Tooltip>
    </div>
  );
}

function OutlineGhost({ number }: { number: number }) {
  const title = useGenerationStore((s) => s.nextTitle);
  return (
    <div className="flex items-start gap-2" aria-label="Outlining the next slide">
      <span className="w-4 pt-1 text-right text-xs text-zinc-300 tabular-nums">{number}</span>
      <div className="flex min-w-0 flex-col gap-1" style={{ width: THUMBNAIL_WIDTH }}>
        <div className="gen-shimmer aspect-video rounded-sm" />
        <span className="truncate text-xs text-zinc-500">{title ?? ""}</span>
      </div>
    </div>
  );
}
