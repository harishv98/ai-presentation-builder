import { describe, expect, it } from "vitest";
import { applyOpsToDeck, type NewElement } from "./ops";
import { createEmptyDeck } from "./store";

const shape: NewElement = { type: "shape", box: { x: 0, y: 0, w: 100, h: 100 }, shape: { kind: "rect", fill: "#000" } };
const seeded = () =>
  applyOpsToDeck(createEmptyDeck(), [
    { op: "add_slide", slide: { title: "A" } },
    { op: "add_element", slideId: "s1", element: shape },
  ]).deck;

describe("applyOpsToDeck", () => {
  it("assigns sequential ids and records undo patches", () => {
    const { deck, results, inversePatches } = applyOpsToDeck(createEmptyDeck(), [
      { op: "add_slide" },
      { op: "add_element", slideId: "s1", element: shape },
    ]);
    expect(results).toEqual([
      { ok: true, id: "s1" },
      { ok: true, id: "e2" },
    ]);
    expect(deck.slides.s1!.elementOrder).toEqual(["e2"]);
    expect(inversePatches.length).toBeGreaterThan(0);
  });

  it("reports bad ops as errors instead of throwing", () => {
    const { results } = applyOpsToDeck(seeded(), [
      { op: "update_element", id: "e99", patch: {} },
      { op: "update_element", id: "e2", patch: { text: { content: ["x"] } } },
    ]);
    expect(results).toEqual([
      { ok: false, error: "Element e99 not found" },
      { ok: false, error: "Element e2 is a shape, cannot apply text patch" },
    ]);
  });

  it("duplicates a slide with fresh element ids right after the source, and deletes with its elements", () => {
    const { deck } = applyOpsToDeck(seeded(), [{ op: "duplicate_slide", id: "s1" }]);
    expect(deck.slideOrder).toEqual(["s1", "s3"]);
    expect(deck.slides.s3).toMatchObject({ title: "A (copy)", elementOrder: ["e4"] });

    const { deck: after } = applyOpsToDeck(deck, [{ op: "delete_slide", id: "s1" }]);
    expect(after.elements.e2).toBeUndefined();
    expect(after.elements.e4).toBeDefined();
  });
});
