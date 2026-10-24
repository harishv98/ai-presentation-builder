import { elementDef } from "@/lib/deck/elements";
import type { Op } from "@/lib/deck/ops";
import type { Box, Deck, Element, SlideLayout } from "@/lib/deck/schema";

const GAP = 40;
const BODY: Box = { x: 80, y: 220, w: 1440, h: 620 };
const HERO_BODY: Box = { x: 160, y: 480, w: 1280, h: 320 };

export type ArrangeItem = { id: string; visual: boolean };

export function bodyElements(deck: Deck, slideId: string): Element[] {
  return (deck.slides[slideId]?.elementOrder ?? []).flatMap((id) => {
    const element = deck.elements[id];
    return element && !(element.type === "text" && element.text.role === "title") ? [element] : [];
  });
}

export function arrangeSlide(deck: Deck, slideId: string): Op[] {
  const layout = deck.slides[slideId]?.layout;
  if (!layout) return [];
  const elements = bodyElements(deck, slideId);
  const boxes = arrangeBoxes(layout, elements.map((element) => ({ id: element.id, visual: elementDef(element).visual })));
  return elements.flatMap((element) => {
    const box = boxes[element.id];
    return box && !sameBox(box, element.box) ? [{ op: "update_element" as const, id: element.id, patch: { box } }] : [];
  });
}

export function arrangeBoxes(layout: SlideLayout, items: ArrangeItem[]): Record<string, Box> {
  if (items.length === 0) return {};
  if (layout === "title" || layout === "section") return assign(items, rows(HERO_BODY, items.length));
  const texts = items.filter((item) => !item.visual);
  const visuals = items.filter((item) => item.visual);
  if (layout === "chart-forward" && visuals.length === 1 && texts.length === 1) {
    return assign([...visuals, ...texts], columns(BODY, [2, 1]));
  }
  const ordered = [...texts, ...visuals];
  if (ordered.length <= 3) return assign(ordered, columns(BODY, ones(ordered.length)));
  const [top, bottom] = rows(BODY, 2) as [Box, Box];
  const perRow = Math.ceil(ordered.length / 2);
  return assign(ordered, [...columns(top, ones(perRow)), ...columns(bottom, ones(ordered.length - perRow))]);
}

function columns(area: Box, weights: number[]): Box[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const free = area.w - GAP * (weights.length - 1);
  let x = area.x;
  return weights.map((weight) => {
    const w = Math.round((free * weight) / total);
    const box = { x, y: area.y, w, h: area.h };
    x += w + GAP;
    return box;
  });
}

function rows(area: Box, count: number): Box[] {
  const h = Math.round((area.h - GAP * (count - 1)) / count);
  return Array.from({ length: count }, (_, i) => ({ x: area.x, y: area.y + i * (h + GAP), w: area.w, h }));
}

function assign(items: ArrangeItem[], boxes: Box[]): Record<string, Box> {
  return Object.fromEntries(items.map((item, i) => [item.id, boxes[i]!]));
}

const ones = (count: number): number[] => Array<number>(count).fill(1);

const sameBox = (a: Box, b: Box): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
