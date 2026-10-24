import { z } from "zod";

export const BoxSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

export const TextStyleSchema = z.object({
  fontSize: z.number().min(8).max(200),
  bold: z.boolean(),
  italic: z.boolean(),
  align: z.enum(["left", "center", "right"]),
  color: z.string(),
});

export const TextPayloadSchema = z.object({
  role: z.enum(["title", "subtitle", "body", "bullets", "numbered"]),
  content: z.array(z.string()),
  style: TextStyleSchema,
});

export const ImagePayloadSchema = z.object({
  src: z.string(),
  alt: z.string(),
  fit: z.enum(["cover", "contain"]),
});

export const ChartKindSchema = z.enum(["bar", "line", "pie", "area", "stacked-bar"]);

export const ChartPayloadSchema = z.object({
  kind: ChartKindSchema,
  title: z.string(),
  categories: z.array(z.string()),
  series: z.array(z.object({ name: z.string(), data: z.array(z.number()), color: z.string().optional() })),
  showLegend: z.boolean(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
});

export const TablePayloadSchema = z.object({
  rows: z.array(z.array(z.string())),
  headerRow: z.boolean(),
});

export const ShapePayloadSchema = z.object({
  kind: z.enum(["rect", "ellipse", "line"]),
  fill: z.string(),
  stroke: z.string().optional(),
});

const elementBase = { id: z.string(), slideId: z.string(), box: BoxSchema };

export const ElementSchema = z.discriminatedUnion("type", [
  z.object({ ...elementBase, type: z.literal("text"), text: TextPayloadSchema }),
  z.object({ ...elementBase, type: z.literal("image"), image: ImagePayloadSchema }),
  z.object({ ...elementBase, type: z.literal("chart"), chart: ChartPayloadSchema }),
  z.object({ ...elementBase, type: z.literal("table"), table: TablePayloadSchema }),
  z.object({ ...elementBase, type: z.literal("shape"), shape: ShapePayloadSchema }),
]);

export const SlideLayoutSchema = z.enum(["title", "content", "two-column", "comparison", "section", "chart-forward", "blank"]);

export const SlideSchema = z.object({
  id: z.string(),
  title: z.string(),
  layout: SlideLayoutSchema,
  background: z.object({ color: z.string() }),
  notes: z.string(),
  elementOrder: z.array(z.string()),
});

export const DeckSchema = z.object({
  id: z.string(),
  title: z.string(),
  theme: z.literal("default"),
  aspectRatio: z.literal("16:9"),
  slideOrder: z.array(z.string()),
  slides: z.record(z.string(), SlideSchema),
  elements: z.record(z.string(), ElementSchema),
  nextId: z.number().int(),
});

export type Box = z.infer<typeof BoxSchema>;
export type TextStyle = z.infer<typeof TextStyleSchema>;
export type TextPayload = z.infer<typeof TextPayloadSchema>;
export type ImagePayload = z.infer<typeof ImagePayloadSchema>;
export type ChartKind = z.infer<typeof ChartKindSchema>;
export type ChartPayload = z.infer<typeof ChartPayloadSchema>;
export type TablePayload = z.infer<typeof TablePayloadSchema>;
export type ShapePayload = z.infer<typeof ShapePayloadSchema>;
export type Element = z.infer<typeof ElementSchema>;
export type ElementType = Element["type"];
export type SlideLayout = z.infer<typeof SlideLayoutSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type Deck = z.infer<typeof DeckSchema>;

export type ElementOf<T extends ElementType> = Extract<Element, { type: T }>;
