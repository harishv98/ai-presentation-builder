"use client";

import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/deck/constants";
import type { Box, Element } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { ElementView, type RenderVariant } from "./elements/ElementView";

export function SlideRenderer({
  slideId,
  variant = "canvas",
  previewBoxes,
  hiddenId,
}: {
  slideId: string;
  variant?: RenderVariant;
  previewBoxes?: Record<string, Box>;
  hiddenId?: string;
}) {
  const background = useDeckStore((s) => s.deck.slides[slideId]?.background.color);
  const elements = useDeckStore(
    useShallow((s) =>
      (s.deck.slides[slideId]?.elementOrder ?? [])
        .map((id) => s.deck.elements[id])
        .filter((e): e is Element => e !== undefined),
    ),
  );

  if (background === undefined) return null;

  return (
    <div className="relative overflow-hidden" style={{ width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT, background }}>
      {elements.map((element, z) => (
        <PositionedElement
          key={element.id}
          element={element}
          box={previewBoxes?.[element.id] ?? element.box}
          z={z}
          variant={variant}
          hidden={element.id === hiddenId}
        />
      ))}
    </div>
  );
}

const PositionedElement = memo(function PositionedElement({
  element,
  box,
  z,
  variant,
  hidden,
}: {
  element: Element;
  box: Box;
  z: number;
  variant: RenderVariant;
  hidden: boolean;
}) {
  const resized = box.w !== element.box.w || box.h !== element.box.h;
  const shown = resized ? { ...element, box } : element;
  return (
    <div
      data-element-id={element.id}
      className={`absolute ${variant === "canvas" ? "outline-accent/40 hover:outline" : ""}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        zIndex: z,
        outlineWidth: "calc(1.5px / var(--artboard-scale))",
        visibility: hidden ? "hidden" : undefined,
      }}
    >
      <ElementView element={shown} variant={variant} />
    </div>
  );
});
