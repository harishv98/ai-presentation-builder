import { MIN_ELEMENT_SIZE } from "@/lib/deck/constants";
import type { Box } from "@/lib/deck/schema";
import type { Handle } from "./resize";

/** `axis: "x"` is a vertical line at x = `at` spanning y from `from` to `to`; `axis: "y"` is horizontal. */
export type Guide = { axis: "x" | "y"; at: number; from: number; to: number };

type Axis = "x" | "y";

const ALIGN_EPSILON = 0.5;

function lines(box: Box, axis: Axis): number[] {
  return axis === "x" ? [box.x, box.x + box.w / 2, box.x + box.w] : [box.y, box.y + box.h / 2, box.y + box.h];
}

function bestOffset(moving: number[], targets: Box[], axis: Axis, threshold: number): number | null {
  let best: number | null = null;
  for (const target of targets) {
    for (const t of lines(target, axis)) {
      for (const m of moving) {
        const d = t - m;
        if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
      }
    }
  }
  return best;
}

export function snapMove(box: Box, targets: Box[], threshold: number): Box {
  const dx = bestOffset(lines(box, "x"), targets, "x", threshold) ?? 0;
  const dy = bestOffset(lines(box, "y"), targets, "y", threshold) ?? 0;
  return { ...box, x: box.x + dx, y: box.y + dy };
}

export function snapResize(box: Box, handle: Handle, targets: Box[], threshold: number): Box {
  let { x, y, w, h } = box;
  const snap = (edge: number, axis: Axis) => bestOffset([edge], targets, axis, threshold) ?? 0;

  if (handle.includes("w")) {
    const d = snap(x, "x");
    if (w - d >= MIN_ELEMENT_SIZE) {
      x += d;
      w -= d;
    }
  }
  if (handle.includes("e")) {
    const d = snap(x + w, "x");
    if (w + d >= MIN_ELEMENT_SIZE) w += d;
  }
  if (handle.includes("n")) {
    const d = snap(y, "y");
    if (h - d >= MIN_ELEMENT_SIZE) {
      y += d;
      h -= d;
    }
  }
  if (handle.includes("s")) {
    const d = snap(y + h, "y");
    if (h + d >= MIN_ELEMENT_SIZE) h += d;
  }
  return { x, y, w, h };
}

export function guidesFor(box: Box, targets: Box[]): Guide[] {
  const guides: Guide[] = [];
  for (const axis of ["x", "y"] as const) {
    const cross = axis === "x" ? "y" : "x";
    const span = axis === "x" ? "h" : "w";
    for (const at of lines(box, axis)) {
      for (const target of targets) {
        if (!lines(target, axis).some((t) => Math.abs(t - at) < ALIGN_EPSILON)) continue;
        const from = Math.min(box[cross], target[cross]);
        const to = Math.max(box[cross] + box[span], target[cross] + target[span]);
        const existing = guides.find((g) => g.axis === axis && Math.abs(g.at - at) < ALIGN_EPSILON);
        if (existing) {
          existing.from = Math.min(existing.from, from);
          existing.to = Math.max(existing.to, to);
        } else {
          guides.push({ axis, at, from, to });
        }
      }
    }
  }
  return guides;
}
