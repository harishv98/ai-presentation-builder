"use client";

import type { ComponentType } from "react";
import type { Element, ElementOf, ElementType } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { useSelectedIds } from "@/lib/ui/useSelectedIds";
import { ChartInspector } from "./ChartInspector";
import { Hint } from "./fields";
import { ImageInspector } from "./ImageInspector";
import { TableInspector } from "./TableInspector";
import { TextInspector } from "./TextInspector";

const INSPECTORS: { [K in ElementType]: ComponentType<{ element: ElementOf<K> }> | null } = {
  text: TextInspector,
  table: TableInspector,
  chart: ChartInspector,
  image: ImageInspector,
  shape: null,
};

export function Inspector() {
  const ids = useSelectedIds();
  const element = useDeckStore((s) => (ids.length === 1 ? s.deck.elements[ids[0]!] : undefined));

  if (ids.length === 0) return <Hint>Select an element on the slide to format it.</Hint>;
  if (!element) return <Hint>{ids.length} elements selected. Select one element to format it.</Hint>;

  const Panel = INSPECTORS[element.type] as ComponentType<{ element: Element }> | null;
  if (!Panel) return <Hint>Nothing to format for this element yet.</Hint>;
  return <Panel key={element.id} element={element} />;
}
