import { describe, expect, it } from "vitest";
import { guidesFor, snapMove, snapResize } from "./snap";

const target = { x: 100, y: 100, w: 200, h: 100 };

describe("snap", () => {
  it("snaps a move to the nearest target line within the threshold only", () => {
    expect(snapMove({ x: 104, y: 400, w: 50, h: 50 }, [target], 6)).toMatchObject({ x: 100, y: 400 });
    expect(snapMove({ x: 110, y: 400, w: 50, h: 50 }, [target], 6)).toMatchObject({ x: 110 });
  });

  it("snaps only the dragged edge on resize and never below the minimum size", () => {
    expect(snapResize({ x: 0, y: 0, w: 296, h: 50 }, "e", [target], 6)).toEqual({ x: 0, y: 0, w: 300, h: 50 });
    expect(snapResize({ x: 285, y: 0, w: 20, h: 50 }, "w", [target], 20)).toEqual({ x: 285, y: 0, w: 20, h: 50 });
  });

  it("draws a guide spanning both boxes when edges align", () => {
    expect(guidesFor({ x: 100, y: 300, w: 50, h: 50 }, [target])).toContainEqual({ axis: "x", at: 100, from: 100, to: 350 });
  });
});
