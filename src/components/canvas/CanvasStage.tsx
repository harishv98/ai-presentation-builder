"use client";

import { ArtboardViewport } from "@/components/canvas/ArtboardViewport";
import { SlideRenderer } from "@/components/slide/SlideRenderer";
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/deck/constants";
import { useUiStore } from "@/lib/ui/store";
import { SelectionOverlay } from "./SelectionOverlay";
import { useCanvasGesture } from "./useCanvasGesture";

export function CanvasStage({ slideId }: { slideId: string }) {
  const previewBoxes = useUiStore((s) => s.dragPreview?.boxes);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const handlers = useCanvasGesture(slideId);

  return (
    <ArtboardViewport onBackgroundPointerDown={clearSelection}>
      <div
        className="relative touch-none select-none"
        style={{ width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT }}
        {...handlers}
      >
        <SlideRenderer slideId={slideId} previewBoxes={previewBoxes} />
        <SelectionOverlay />
      </div>
    </ArtboardViewport>
  );
}
