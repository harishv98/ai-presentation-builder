"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useEffect, useRef } from "react";
import { ScaledArtboard } from "@/components/slide/ScaledArtboard";
import { SlideRenderer } from "@/components/slide/SlideRenderer";
import { ARTBOARD_WIDTH } from "@/lib/deck/constants";
import { useUiStore } from "@/lib/ui/store";
import { THUMBNAIL_WIDTH } from "./constants";
import { SlideTitle } from "./SlideTitle";

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
