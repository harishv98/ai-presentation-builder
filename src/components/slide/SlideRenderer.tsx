"use client";

import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/deck/constants";
import type { Element } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { ElementView, type RenderVariant } from "./elements/ElementView";

export function SlideRenderer({ slideId, variant = "canvas" }: { slideId: string; variant?: RenderVariant }) {
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
        <PositionedElement key={element.id} element={element} z={z} variant={variant} />
      ))}
    </div>
  );
}

const PositionedElement = memo(function PositionedElement({
  element,
  z,
  variant,
}: {
  element: Element;
  z: number;
  variant: RenderVariant;
}) {
  const { x, y, w, h } = element.box;
  return (
    <div data-element-id={element.id} className="absolute" style={{ left: x, top: y, width: w, height: h, zIndex: z }}>
      <ElementView element={element} variant={variant} />
    </div>
  );
});
