"use client";

import type { ReactNode } from "react";
import { arrangeBoxes, bodyElements, type ArrangeItem } from "@/lib/agent/deck/arrange";
import { fillSlide } from "@/lib/agent/flows/generateDeck";
import type { PlannedSlide } from "@/lib/agent/tools/planTool";
import { selectRunning, useChatStore } from "@/lib/chat/store";
import type { Box } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { selectAcceptsFills, useGenerationStore } from "@/lib/generation/store";

export const CANVAS_REGION_ID = "canvas-region";
const OVERLAY_Z = 9998;
const TEXT_BARS = [100, 92, 84, 58];

export function SlideFillOverlay({ slideId }: { slideId: string }) {
  const fill = useGenerationStore((s) => s.slides[slideId]);
  const planned = useGenerationStore((s) => s.outline[slideId]);
  const empty = useDeckStore((s) => bodyElements(s.deck, slideId).length === 0);
  const running = useChatStore(selectRunning);
  const acceptsFills = useGenerationStore(selectAcceptsFills);
  if (!fill || !planned || fill.status === "done") return null;

  if (fill.status === "pending" || fill.status === "filling") {
    if (empty) return <Skeleton planned={planned} caption={fill.status === "filling" ? "Writing this slide…" : "Queued"} />;
    return (
      <Layer>
        <span
          className="absolute top-6 right-6 animate-pulse rounded-full bg-accent/10 px-4 py-1.5 font-medium text-accent"
          style={{ fontSize: 22 }}
        >
          Writing…
        </span>
      </Layer>
    );
  }

  // Content added by another route (manual edit, chat edit) means there is nothing left to retry here.
  if (!empty) return null;
  const failed = fill.status === "failed";
  return (
    <Layer>
      <div
        className="pointer-events-auto absolute bottom-8 left-1/2 flex w-[960px] -translate-x-1/2 items-center gap-6 rounded-xl bg-white px-8 py-5 shadow-lg ring-1 ring-black/10"
        style={{ fontSize: 24 }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-zinc-800">{failed ? "Couldn't fill this slide" : "This slide wasn't filled"}</p>
          {failed && fill.error && <p className="line-clamp-3 break-words text-zinc-500" title={fill.error}>{fill.error}</p>}
        </div>
        <button
          type="button"
          disabled={running && !acceptsFills}
          onClick={() => {
            // The overlay unmounts once the fill starts; park focus on the canvas region so it isn't lost.
            document.getElementById(CANVAS_REGION_ID)?.focus({ preventScroll: true });
            void fillSlide(slideId);
          }}
          className="rounded-lg bg-accent px-6 py-3 font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {failed ? "Retry" : "Fill with AI"}
        </button>
      </div>
    </Layer>
  );
}

function Layer({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: OVERLAY_Z }}>
      {children}
    </div>
  );
}

function Skeleton({ planned, caption }: { planned: PlannedSlide; caption: string }) {
  const items = skeletonItems(planned);
  const boxes = arrangeBoxes(planned.layout, items);
  return (
    <Layer>
      {items.map((item) => {
        const box = boxes[item.id];
        if (!box) return null;
        return item.visual ? (
          <div key={item.id} className="gen-shimmer absolute rounded-2xl" style={position(box)} />
        ) : (
          <div key={item.id} className="absolute flex flex-col gap-7" style={{ left: box.x, top: box.y + 16, width: box.w }}>
            {TEXT_BARS.map((width) => (
              <div key={width} className="gen-shimmer h-8 rounded-lg" style={{ width: `${width}%` }} />
            ))}
          </div>
        );
      })}
      <p className="absolute inset-x-0 bottom-8 text-center text-zinc-400" style={{ fontSize: 24 }}>
        {caption}
      </p>
    </Layer>
  );
}

function skeletonItems(planned: PlannedSlide): ArrangeItem[] {
  const text = { id: "text", visual: false };
  if (planned.layout === "title" || planned.layout === "section" || planned.visual === "none") return [text];
  return [text, { id: "visual", visual: true }];
}

const position = (box: Box) => ({ left: box.x, top: box.y, width: box.w, height: box.h });
