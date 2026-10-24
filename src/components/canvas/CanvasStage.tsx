"use client";

import type { MouseEvent } from "react";
import { ArtboardViewport } from "@/components/canvas/ArtboardViewport";
import { SlideRenderer } from "@/components/slide/SlideRenderer";
import { startEditing } from "@/lib/content/actions";
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/deck/constants";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";
import { AiHighlightOverlay } from "./AiHighlightOverlay";
import { SelectionOverlay } from "./SelectionOverlay";
import { SlideFillOverlay } from "./SlideFillOverlay";
import { TextEditor } from "./TextEditor";
import { useCanvasGesture } from "./useCanvasGesture";

export function CanvasStage({ slideId }: { slideId: string }) {
  const previewBoxes = useUiStore((s) => s.dragPreview?.boxes);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const editing = useUiStore((s) => s.editing);
  const editingHere = useDeckStore((s) => !!editing && s.deck.elements[editing.elementId]?.slideId === slideId);
  const active = editingHere ? editing : null;
  const handlers = useCanvasGesture(slideId);

  return (
    <ArtboardViewport onBackgroundPointerDown={clearSelection}>
      <div
        className="relative touch-none select-none"
        style={{ width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT }}
        {...handlers}
        onDoubleClick={onDoubleClick}
      >
        <SlideRenderer
          slideId={slideId}
          previewBoxes={previewBoxes}
          hiddenId={active?.kind === "text" ? active.elementId : undefined}
        />
        {active?.kind === "text" && <TextEditor key={active.elementId} elementId={active.elementId} caret={active.caret} />}
        <AiHighlightOverlay slideId={slideId} />
        <SlideFillOverlay slideId={slideId} />
        <SelectionOverlay />
      </div>
    </ArtboardViewport>
  );
}

function onDoubleClick(event: MouseEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement;
  if (target.closest("[data-editor]")) return;
  const elementId = target.closest<HTMLElement>("[data-element-id]")?.dataset.elementId;
  if (!elementId) return;
  const cell = target.closest<HTMLElement>("[data-cell]")?.dataset.cell?.split(":").map(Number);
  startEditing(elementId, {
    caret: { x: event.clientX, y: event.clientY },
    ...(cell && { cell: { row: cell[0]!, col: cell[1]! } }),
  });
}
