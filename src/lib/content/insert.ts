import { textStyle } from "@/lib/agent/placement";
import { translateBox } from "@/lib/canvas/geometry";
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/deck/constants";
import type { NewElement } from "@/lib/deck/ops";
import type { Box } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { resolveCurrentSlideId, useUiStore } from "@/lib/ui/store";
import type { PickedImage } from "./image";

export type InsertKind = "text" | "chart" | "table" | "rect" | "ellipse" | "line";

const CASCADE_STEP = 20;
const CASCADE_TRIES = 10;
const IMAGE_MAX = { w: 800, h: 500 };
const SHAPE_FILL = "#e0e7ff";
const LINE_COLOR = "#334155";

const INSERT_LABEL: Record<InsertKind, string> = {
  text: "Insert text",
  chart: "Insert chart",
  table: "Insert table",
  rect: "Insert rectangle",
  ellipse: "Insert ellipse",
  line: "Insert line",
};

function centered(w: number, h: number): Box {
  return { x: Math.round((ARTBOARD_WIDTH - w) / 2), y: Math.round((ARTBOARD_HEIGHT - h) / 2), w, h };
}

export function defaultElement(kind: InsertKind): NewElement {
  switch (kind) {
    case "text":
      return { type: "text", box: centered(640, 120), text: { role: "body", content: ["New text"], style: textStyle("body") } };
    case "chart":
      return {
        type: "chart",
        box: centered(960, 540),
        chart: {
          kind: "bar",
          title: "Chart title",
          categories: ["Q1", "Q2", "Q3", "Q4"],
          series: [{ name: "Series 1", data: [4, 6, 5, 8] }],
          showLegend: false,
        },
      };
    case "table":
      return {
        type: "table",
        box: centered(960, 240),
        table: { headerRow: true, rows: [["Column 1", "Column 2", "Column 3"], ["", "", ""], ["", "", ""]] },
      };
    case "rect":
      return { type: "shape", box: centered(320, 200), shape: { kind: "rect", fill: SHAPE_FILL } };
    case "ellipse":
      return { type: "shape", box: centered(240, 240), shape: { kind: "ellipse", fill: SHAPE_FILL } };
    case "line":
      return { type: "shape", box: centered(480, 20), shape: { kind: "line", fill: LINE_COLOR } };
  }
}

export function imageElement(image: PickedImage): NewElement {
  const scale = Math.min(1, IMAGE_MAX.w / image.width, IMAGE_MAX.h / image.height);
  return {
    type: "image",
    box: centered(Math.round(image.width * scale), Math.round(image.height * scale)),
    image: { src: image.src, alt: image.alt, fit: "cover" },
  };
}

export function insertElement(element: NewElement, label: string): string | null {
  const { deck, applyOps } = useDeckStore.getState();
  const slideId = resolveCurrentSlideId(deck, useUiStore.getState().currentSlideId);
  if (!slideId) return null;
  const taken = (deck.slides[slideId]?.elementOrder ?? []).flatMap((id) => {
    const box = deck.elements[id]?.box;
    return box ? [box] : [];
  });
  let box = element.box;
  for (let i = 0; i < CASCADE_TRIES && taken.some((b) => b.x === box.x && b.y === box.y); i++) {
    box = translateBox(box, CASCADE_STEP, CASCADE_STEP);
  }
  const [result] = applyOps([{ op: "add_element", slideId, element: { ...element, box } }], { source: "user", label });
  if (!result?.ok || !result.id) return null;
  useUiStore.getState().setSelection([result.id]);
  return result.id;
}

export function insertDefault(kind: InsertKind): void {
  const id = insertElement(defaultElement(kind), INSERT_LABEL[kind]);
  if (id && (kind === "chart" || kind === "table")) useUiStore.getState().setRightPanel("format");
}

export function insertImage(image: PickedImage): void {
  insertElement(imageElement(image), "Insert image");
}
