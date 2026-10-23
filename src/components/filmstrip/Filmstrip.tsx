"use client";

import { useEffect, useRef } from "react";
import { ScaledArtboard } from "@/components/slide/ScaledArtboard";
import { SlideRenderer } from "@/components/slide/SlideRenderer";
import { ARTBOARD_WIDTH } from "@/lib/deck/constants";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";
import { useCurrentSlideId } from "@/lib/ui/useCurrentSlideId";

const THUMBNAIL_WIDTH = 168;

export function Filmstrip() {
  const slideOrder = useDeckStore((s) => s.deck.slideOrder);
  const currentSlideId = useCurrentSlideId();

  if (slideOrder.length === 0) {
    return (
      <div className="flex aspect-video items-center justify-center rounded border border-dashed border-zinc-300 text-xs text-zinc-400">
        No slides yet
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {slideOrder.map((slideId, index) => (
        <li key={slideId}>
          <Thumbnail slideId={slideId} index={index} active={slideId === currentSlideId} />
        </li>
      ))}
    </ol>
  );
}

function Thumbnail({ slideId, index, active }: { slideId: string; index: number; active: boolean }) {
  const title = useDeckStore((s) => s.deck.slides[slideId]?.title ?? "");
  const goToSlide = useUiStore((s) => s.goToSlide);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => goToSlide(slideId)}
      aria-current={active ? "true" : undefined}
      className="group flex w-full items-start gap-2 text-left focus:outline-none"
    >
      <span className={`w-4 pt-1 text-right text-xs tabular-nums ${active ? "font-semibold text-accent" : "text-zinc-400"}`}>
        {index + 1}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span
          className={`block overflow-hidden rounded-sm ring-offset-1 ${
            active ? "ring-2 ring-accent" : "ring-1 ring-zinc-200 group-hover:ring-zinc-400 group-focus-visible:ring-zinc-500"
          }`}
        >
          <ScaledArtboard scale={THUMBNAIL_WIDTH / ARTBOARD_WIDTH}>
            <SlideRenderer slideId={slideId} variant="thumbnail" />
          </ScaledArtboard>
        </span>
        <span className="truncate text-xs text-zinc-600" style={{ maxWidth: THUMBNAIL_WIDTH }}>
          {title}
        </span>
      </span>
    </button>
  );
}
