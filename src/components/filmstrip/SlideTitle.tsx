"use client";

import { useEffect, useRef } from "react";
import { useDeckStore } from "@/lib/deck/store";
import { renameSlide } from "@/lib/slides/actions";
import { useUiStore } from "@/lib/ui/store";
import { THUMBNAIL_WIDTH } from "./constants";

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
