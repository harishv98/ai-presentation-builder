import { describe, expect, it } from "vitest";
import { parseStreamedPlan } from "./planTool";

const intro = { title: "Intro", layout: "title", intent: "Open the talk", visual: "none" };

describe("parseStreamedPlan", () => {
  it("returns finished slides and the title of the one still streaming", () => {
    const partial = `{"title":"Deck","slides":[${JSON.stringify(intro)},{"title":"Market \\"size\\"","lay`;
    expect(parseStreamedPlan(partial)).toEqual({ slides: [intro], nextTitle: 'Market "size"' });
  });

  it("skips slides that fail the schema and handles a missing slides array", () => {
    const blank = { ...intro, layout: "blank" };
    expect(parseStreamedPlan(`{"slides":[${JSON.stringify(blank)}]}`)).toEqual({ slides: [], nextTitle: null });
    expect(parseStreamedPlan('{"title":"De')).toEqual({ slides: [], nextTitle: null });
  });
});
