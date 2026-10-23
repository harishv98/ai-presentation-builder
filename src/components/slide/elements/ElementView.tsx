import type { Element } from "@/lib/deck/schema";
import { ChartView } from "./ChartView";
import { ImageView } from "./ImageView";
import { ShapeView } from "./ShapeView";
import { TableView } from "./TableView";
import { TextView } from "./TextView";

export type RenderVariant = "canvas" | "thumbnail";

export function ElementView({ element, variant }: { element: Element; variant: RenderVariant }) {
  switch (element.type) {
    case "text":
      return <TextView element={element} />;
    case "image":
      return <ImageView element={element} />;
    case "chart":
      return <ChartView element={element} variant={variant} />;
    case "table":
      return <TableView element={element} />;
    case "shape":
      return <ShapeView element={element} />;
  }
}
