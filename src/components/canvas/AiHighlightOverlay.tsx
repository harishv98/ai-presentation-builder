"use client";

import { useShallow } from "zustand/react/shallow";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";

const HIGHLIGHT_Z = 9999;

export function AiHighlightOverlay({ slideId }: { slideId: string }) {
  const highlights = useUiStore((s) => s.aiHighlights);
  const ids = useDeckStore(
    useShallow((s) => (s.deck.slides[slideId]?.elementOrder ?? []).filter((id) => highlights[id] !== undefined)),
  );
  const boxes = useDeckStore(useShallow((s) => ids.map((id) => s.deck.elements[id]?.box)));

  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: HIGHLIGHT_Z }}>
      {ids.map((id, i) => {
        const box = boxes[i];
        if (!box) return null;
        return (
          <div
            key={`${id}-${highlights[id]}`}
            className="ai-pulse absolute rounded-sm"
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          />
        );
      })}
    </div>
  );
}
