import type { Draft } from "immer";
import type { ElementPatch } from "./ops";
import type { ElementOf, ElementType } from "./schema";

const TEXT_LIMIT = 600;
const TABLE_ROW_LIMIT = 20;

export type Activate = "edit-text" | "edit-cell" | "inspector" | "none";

type ElementDef<K extends ElementType> = {
  describe: (element: ElementOf<K>, at: string) => string;
  merge: (element: Draft<ElementOf<K>>, patch: Omit<ElementPatch, "box">) => void;
  visual: boolean;
  activate: Activate;
};

export const ELEMENTS: { [K in ElementType]: ElementDef<K> } = {
  text: {
    describe(element, at) {
      const { role, content, style } = element.text;
      const flags = [`size=${style.fontSize}`, style.bold && "bold", style.italic && "italic", style.align, style.color]
        .filter(Boolean)
        .join(" ");
      return `${element.id} text/${role} ${at} ${flags} ${JSON.stringify(clipParagraphs(content))}`;
    },
    merge(element, patch) {
      const { style, ...rest } = patch.text ?? {};
      Object.assign(element.text, rest);
      if (style) Object.assign(element.text.style, style);
    },
    visual: false,
    activate: "edit-text",
  },
  image: {
    describe(element, at) {
      const src = element.image.src.startsWith("data:") ? "uploaded" : element.image.src;
      return `${element.id} image ${at} alt=${JSON.stringify(element.image.alt)} src=${src}`;
    },
    merge(element, patch) {
      Object.assign(element.image, patch.image);
    },
    visual: true,
    activate: "inspector",
  },
  chart: {
    describe(element, at) {
      const c = element.chart;
      const series = c.series.map((s) => `${s.name}=${JSON.stringify(s.data)}`).join("; ");
      const axes = [c.xLabel && `x=${JSON.stringify(c.xLabel)}`, c.yLabel && `y=${JSON.stringify(c.yLabel)}`]
        .filter(Boolean)
        .join(" ");
      return `${element.id} chart/${c.kind} ${at} title=${JSON.stringify(c.title)} categories=${JSON.stringify(c.categories)} series: ${series} legend=${c.showLegend} ${axes}`.trimEnd();
    },
    merge(element, patch) {
      Object.assign(element.chart, patch.chart);
    },
    visual: true,
    activate: "inspector",
  },
  table: {
    describe(element, at) {
      const { rows, headerRow } = element.table;
      const shown = rows.slice(0, TABLE_ROW_LIMIT);
      const more = rows.length > shown.length ? ` (+${rows.length - shown.length} more rows)` : "";
      return `${element.id} table ${at} header=${headerRow} rows=${JSON.stringify(shown)}${more}`;
    },
    merge(element, patch) {
      Object.assign(element.table, patch.table);
    },
    visual: true,
    activate: "edit-cell",
  },
  shape: {
    describe: (element, at) => `${element.id} shape/${element.shape.kind} ${at} fill=${element.shape.fill}`,
    merge(element, patch) {
      Object.assign(element.shape, patch.shape);
    },
    visual: true,
    activate: "none",
  },
};

// TypeScript can't correlate `element.type` with the matching map entry, so callers go through this one cast.
export const elementDef = (element: { type: ElementType }) => ELEMENTS[element.type] as ElementDef<ElementType>;

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function clipParagraphs(content: string[]): string[] {
  const out: string[] = [];
  let budget = TEXT_LIMIT;
  for (const paragraph of content) {
    if (budget <= 0) break;
    out.push(clip(paragraph, budget));
    budget -= paragraph.length;
  }
  return out;
}
