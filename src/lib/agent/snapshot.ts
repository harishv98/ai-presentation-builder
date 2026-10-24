import { clip, elementDef } from "@/lib/deck/elements";
import type { Deck, Element } from "@/lib/deck/schema";

export { clip };

const NOTES_LIMIT = 120;

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
  return elementDef(element).describe(element, `@${x},${y} ${w}x${h}`);
}

export function serializeForPopulate(deck: Deck, slideId: string, outline: Record<string, { intent: string }>): string {
  const lines = [`Deck "${deck.title}", ${deck.slideOrder.length} slides, artboard 1600x900`];
  deck.slideOrder.forEach((id, index) => {
    const slide = deck.slides[id];
    if (!slide) return;
    const intent = outline[id] ? ` - ${clip(outline[id].intent, 200)}` : "";
    const target = id === slideId ? "  <- the slide you fill" : "";
    lines.push(`[${index + 1}] ${id} ${JSON.stringify(slide.title)} layout=${slide.layout}${intent}${target}`);
  });
  lines.push("", `Slide ${slideId} contains (back to front):`);
  for (const id of deck.slides[slideId]?.elementOrder ?? []) {
    const element = deck.elements[id];
    if (element) lines.push(`  ${describeElement(element)}`);
  }
  return lines.join("\n");
}
