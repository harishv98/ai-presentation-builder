import { describe, expect, it } from "vitest";
import { applyOpsToDeck } from "@/lib/deck/ops";
import { createEmptyDeck } from "@/lib/deck/store";
import { titleElement } from "./placement";
import { serializeForAI } from "./snapshot";

describe("serializeForAI", () => {
  it("lists slides and elements with ids and marks this reply's changes", () => {
    const { deck } = applyOpsToDeck(createEmptyDeck(), [
      { op: "add_slide", slide: { title: "Intro", layout: "content" } },
      { op: "add_element", slideId: "s1", element: titleElement("Hello", "content") },
    ]);
    const text = serializeForAI(deck, "s1", new Map([["e2", "added"]]));
    expect(text).toContain("1 slides, artboard 1600x900, current slide: s1");
    expect(text).toContain('[1] s1 "Intro" layout=content');
    expect(text).toMatch(/e2 text\/title @80,60 1440x120 .*"Hello".*\(added by you this reply\)/);
  });
});
