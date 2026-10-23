import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, MIN_ELEMENT_SIZE } from "./constants";
import type { Box } from "./schema";

export function isFiniteBox(box: Box): boolean {
  return [box.x, box.y, box.w, box.h].every(Number.isFinite);
}

export function clampBox(box: Box): Box {
  let w = Math.max(box.w, MIN_ELEMENT_SIZE);
  let h = Math.max(box.h, MIN_ELEMENT_SIZE);
  const shrink = Math.min(1, ARTBOARD_WIDTH / w, ARTBOARD_HEIGHT / h);
  w *= shrink;
  h *= shrink;
  const x = Math.min(Math.max(box.x, 0), ARTBOARD_WIDTH - w);
  const y = Math.min(Math.max(box.y, 0), ARTBOARD_HEIGHT - h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}
