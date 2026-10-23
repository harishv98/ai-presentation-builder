import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/deck/constants";
import type { Box } from "@/lib/deck/schema";

export type Point = { x: number; y: number };

export const ARTBOARD_BOX: Box = { x: 0, y: 0, w: ARTBOARD_WIDTH, h: ARTBOARD_HEIGHT };

export function translateBox(box: Box, dx: number, dy: number): Box {
  return { ...box, x: box.x + dx, y: box.y + dy };
}

export function unionBox(boxes: Box[]): Box {
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectFromPoints(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function clampGroupDelta(group: Box, dx: number, dy: number): Point {
  return {
    x: Math.min(Math.max(dx, -group.x), ARTBOARD_WIDTH - group.x - group.w),
    y: Math.min(Math.max(dy, -group.y), ARTBOARD_HEIGHT - group.y - group.h),
  };
}

export function sameBox(a: Box, b: Box): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
