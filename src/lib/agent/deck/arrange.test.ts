import { describe, expect, it } from "vitest";
import type { Box } from "@/lib/deck/schema";
import { arrangeBoxes, type ArrangeItem } from "./arrange";

const items = (count: number): ArrangeItem[] => Array.from({ length: count }, (_, i) => ({ id: `e${i}`, visual: i % 2 === 1 }));
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("arrangeBoxes", () => {
  it("gives the visual the wide left column on a chart-forward slide", () => {
    const boxes = arrangeBoxes("chart-forward", [
      { id: "text", visual: false },
      { id: "chart", visual: true },
    ]);
    expect(boxes.chart!.x).toBeLessThan(boxes.text!.x);
    expect(boxes.chart!.w).toBeGreaterThan(boxes.text!.w);
  });

  it.each([1, 2, 3, 4, 5, 6])("lays out %i items inside the artboard without overlap", (count) => {
    const boxes = Object.values(arrangeBoxes("content", items(count)));
    expect(boxes).toHaveLength(count);
    for (const [i, box] of boxes.entries()) {
      expect(box.x + box.w).toBeLessThanOrEqual(1600);
      expect(box.y + box.h).toBeLessThanOrEqual(900);
      for (const other of boxes.slice(i + 1)) expect(overlaps(box, other)).toBe(false);
    }
  });
});
