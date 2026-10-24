"use client";

import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { ElementView } from "@/components/slide/elements/ElementView";
import type { Element } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";

export function CrossSlideGhost() {
  const drag = useUiStore((s) => s.crossDrag);
  const elements = useDeckStore(
    useShallow((s) => (drag?.ids ?? []).map((id) => s.deck.elements[id]).filter((e): e is Element => e !== undefined)),
  );
  const number = useDeckStore((s) => (drag?.targetSlideId ? s.deck.slideOrder.indexOf(drag.targetSlideId) + 1 : 0));
  if (!drag) return null;
  const { group, scale } = drag;

  // Portal: ScaledArtboard's transform would make `position: fixed` relative to the artboard.
  return createPortal(
    <div className="pointer-events-none fixed z-50" style={{ left: drag.left, top: drag.top }}>
      <div
        className="relative overflow-hidden opacity-70 shadow-xl ring-1 ring-accent"
        style={{ width: group.w * scale, height: group.h * scale }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={
            {
              transform: `scale(${scale}) translate(${-group.x}px, ${-group.y}px)`,
              "--artboard-scale": scale,
            } as CSSProperties
          }
        >
          {elements.map((element) => (
            <div
              key={element.id}
              className="absolute"
              style={{ left: element.box.x, top: element.box.y, width: element.box.w, height: element.box.h }}
            >
              <ElementView element={element} variant="thumbnail" />
            </div>
          ))}
        </div>
      </div>
      <span className="absolute -top-6 left-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white">
        {drag.targetSlideId ? `${drag.copy ? "Copy" : "Move"} to slide ${number}` : "Drop on a slide thumbnail"}
      </span>
    </div>,
    document.body,
  );
}
