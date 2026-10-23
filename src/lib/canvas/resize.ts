import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, MIN_ELEMENT_SIZE } from "@/lib/deck/constants";
import type { Box } from "@/lib/deck/schema";

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function resizeBox(start: Box, handle: Handle, dx: number, dy: number, keepAspect: boolean): Box {
  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const right = start.x + start.w;
  const bottom = start.y + start.h;

  const maxW = east ? ARTBOARD_WIDTH - start.x : west ? right : start.w;
  const maxH = south ? ARTBOARD_HEIGHT - start.y : north ? bottom : start.h;
  let w = clamp(east ? start.w + dx : west ? start.w - dx : start.w, MIN_ELEMENT_SIZE, maxW);
  let h = clamp(south ? start.h + dy : north ? start.h - dy : start.h, MIN_ELEMENT_SIZE, maxH);

  if (keepAspect && (east || west) && (north || south)) {
    const ratio = start.w / start.h;
    if (w / ratio >= h) h = w / ratio;
    else w = h * ratio;
    const fit = Math.min(1, maxW / w, maxH / h);
    w *= fit;
    h *= fit;
  }

  w = Math.round(w);
  h = Math.round(h);
  return { x: west ? right - w : start.x, y: north ? bottom - h : start.y, w, h };
}
