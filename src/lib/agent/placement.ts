import type { NewElement } from "@/lib/deck/ops";
import type { Box, Deck, SlideLayout, TextPayload, TextStyle } from "@/lib/deck/schema";

const INK = "#0f172a";
const BODY_TEXT = "#334155";

const TITLE_BAND: Box = { x: 80, y: 60, w: 1440, h: 120 };
const HERO_TITLE: Box = { x: 160, y: 300, w: 1280, h: 160 };
const BODY_SLOTS: Box[] = [
  { x: 80, y: 220, w: 1440, h: 620 },
  { x: 840, y: 220, w: 680, h: 620 },
  { x: 80, y: 220, w: 680, h: 620 },
  { x: 80, y: 560, w: 1440, h: 280 },
];

const ROLE_STYLE: Record<TextPayload["role"], Partial<TextStyle>> = {
  title: { fontSize: 60, bold: true, color: INK },
  subtitle: { fontSize: 32 },
  body: { fontSize: 28 },
  bullets: { fontSize: 30 },
};

export function textStyle(role: TextPayload["role"], overrides: Partial<TextStyle> = {}): TextStyle {
  return { fontSize: 34, bold: false, italic: false, align: "left", color: BODY_TEXT, ...ROLE_STYLE[role], ...overrides };
}

export function titleElement(title: string, layout: SlideLayout): NewElement {
  const hero = layout === "title" || layout === "section";
  return {
    type: "text",
    box: hero ? HERO_TITLE : TITLE_BAND,
    text: { role: "title", content: [title], style: textStyle("title", hero ? { fontSize: 88, align: "center" } : {}) },
  };
}

export function placeBox(deck: Deck, slideId: string, zone: "title" | "body"): Box {
  if (zone === "title") return TITLE_BAND;
  const taken = (deck.slides[slideId]?.elementOrder ?? []).flatMap((id) => {
    const element = deck.elements[id];
    return element ? [element.box] : [];
  });
  let best = BODY_SLOTS[0]!;
  let bestOverlap = Infinity;
  for (const slot of BODY_SLOTS) {
    const overlap = taken.reduce((sum, box) => sum + overlapArea(slot, box), 0);
    if (overlap < bestOverlap) {
      best = slot;
      bestOverlap = overlap;
    }
    if (overlap === 0) break;
  }
  return best;
}

export function stockImageUrl(keyword: string): string {
  const seed = keyword.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "slide";
  return `https://picsum.photos/seed/${seed}/800/600`;
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
