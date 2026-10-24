import { memo, type ComponentType } from "react";
import type { ElementOf, ElementType } from "@/lib/deck/schema";
import { ChartView } from "./ChartView";
import { ImageView } from "./ImageView";
import { ShapeView } from "./ShapeView";
import { TableView } from "./TableView";
import { TextView } from "./TextView";

export type RenderVariant = "canvas" | "thumbnail" | "print";

type ViewProps<K extends ElementType> = { element: ElementOf<K>; variant: RenderVariant };

const VIEWS: { [K in ElementType]: ComponentType<ViewProps<K>> } = {
  text: TextView,
  image: ImageView,
  chart: ChartView,
  table: TableView,
  shape: ShapeView,
};

export const ElementView = memo(function ElementView({ element, variant }: ViewProps<ElementType>) {
  const View = VIEWS[element.type] as ComponentType<ViewProps<ElementType>>;
  return <View element={element} variant={variant} />;
});
