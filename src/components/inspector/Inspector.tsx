"use client";

import { useDeckStore } from "@/lib/deck/store";
import { useSelectedIds } from "@/lib/ui/useSelectedIds";
import { ChartInspector } from "./ChartInspector";
import { Hint } from "./fields";
import { ImageInspector } from "./ImageInspector";
import { TableInspector } from "./TableInspector";
import { TextInspector } from "./TextInspector";

export function Inspector() {
  const ids = useSelectedIds();
  const element = useDeckStore((s) => (ids.length === 1 ? s.deck.elements[ids[0]!] : undefined));

  if (ids.length === 0) return <Hint>Select an element on the slide to format it.</Hint>;
  if (!element) return <Hint>{ids.length} elements selected. Select one element to format it.</Hint>;

  switch (element.type) {
    case "text":
      return <TextInspector key={element.id} element={element} />;
    case "table":
      return <TableInspector key={element.id} element={element} />;
    case "chart":
      return <ChartInspector key={element.id} element={element} />;
    case "image":
      return <ImageInspector key={element.id} element={element} />;
    default:
      return <Hint>Nothing to format for this element yet.</Hint>;
  }
}
