import type { Deck, Element } from "@/lib/deck/schema";

const TEXT_LIMIT = 600;
const TABLE_ROW_LIMIT = 20;
const NOTES_LIMIT = 120;

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export type TurnMarks = Map<string, "added" | "edited">;

export function serializeForAI(deck: Deck, currentSlideId: string | null, marks?: TurnMarks): string {
  const mark = (id: string) => (marks?.has(id) ? ` (${marks.get(id)} by you this reply)` : "");
  const lines = [
    `Deck "${deck.title}", ${deck.slideOrder.length} slides, artboard 1600x900, current slide: ${currentSlideId ?? "none"}`,
  ];
  deck.slideOrder.forEach((slideId, index) => {
    const slide = deck.slides[slideId];
    if (!slide) return;
    const notes = slide.notes ? ` notes=${JSON.stringify(clip(slide.notes, NOTES_LIMIT))}` : "";
    lines.push(
      `[${index + 1}] ${slide.id} ${JSON.stringify(slide.title)} layout=${slide.layout} bg=${slide.background.color}${notes}${mark(slide.id)}`,
    );
    for (const id of slide.elementOrder) {
      const element = deck.elements[id];
      if (element) lines.push(`  ${describeElement(element)}${mark(id)}`);
    }
  });
  return lines.join("\n");
}

export function describeElement(element: Element): string {
  const { x, y, w, h } = element.box;
  const at = `@${x},${y} ${w}x${h}`;
  switch (element.type) {
    case "text": {
      const { role, content, style } = element.text;
      const flags = [`size=${style.fontSize}`, style.bold && "bold", style.italic && "italic", style.align, style.color]
        .filter(Boolean)
        .join(" ");
      return `${element.id} text/${role} ${at} ${flags} ${JSON.stringify(clipParagraphs(content))}`;
    }
    case "image": {
      const src = element.image.src.startsWith("data:") ? "uploaded" : element.image.src;
      return `${element.id} image ${at} alt=${JSON.stringify(element.image.alt)} src=${src}`;
    }
    case "chart": {
      const c = element.chart;
      const series = c.series.map((s) => `${s.name}=${JSON.stringify(s.data)}`).join("; ");
      const axes = [c.xLabel && `x=${JSON.stringify(c.xLabel)}`, c.yLabel && `y=${JSON.stringify(c.yLabel)}`]
        .filter(Boolean)
        .join(" ");
      return `${element.id} chart/${c.kind} ${at} title=${JSON.stringify(c.title)} categories=${JSON.stringify(c.categories)} series: ${series} legend=${c.showLegend} ${axes}`.trimEnd();
    }
    case "table": {
      const { rows, headerRow } = element.table;
      const shown = rows.slice(0, TABLE_ROW_LIMIT);
      const more = rows.length > shown.length ? ` (+${rows.length - shown.length} more rows)` : "";
      return `${element.id} table ${at} header=${headerRow} rows=${JSON.stringify(shown)}${more}`;
    }
    case "shape":
      return `${element.id} shape/${element.shape.kind} ${at} fill=${element.shape.fill}`;
  }
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
