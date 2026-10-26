import { describe, expect, it } from "vitest";
import { classifyPlan, emptyPlanProgress, type PlanProgress } from "./planOutcome";

const progress = (patch: Partial<PlanProgress>): PlanProgress => ({ ...emptyPlanProgress(), ...patch });

describe("classifyPlan", () => {
  it("returns the slides when the outline arrived cleanly", () => {
    expect(classifyPlan(progress({ slideIds: ["s1", "s2"] }), false)).toEqual({ kind: "slides", slideIds: ["s1", "s2"] });
  });

  it("fails on a rejection even after some slides arrived, unless the user stopped it", () => {
    const partial = progress({ slideIds: ["s1", "s2"], rejection: "Slide 3 is invalid" });
    expect(classifyPlan(partial, false)).toEqual({ kind: "failed", message: "The outline was invalid: Slide 3 is invalid" });
    expect(classifyPlan(partial, true)).toEqual({ kind: "slides", slideIds: ["s1", "s2"] });
  });

  it("treats text without slides as a clarifying question, even after a stop", () => {
    expect(classifyPlan(progress({ text: "  Who is the audience?  " }), true)).toEqual({ kind: "question", text: "Who is the audience?" });
  });

  it("fails on a rejection with no slides, ahead of any text", () => {
    expect(classifyPlan(progress({ rejection: "missing title", text: "Here you go" }), false)).toEqual({
      kind: "failed",
      message: "The outline was invalid: missing title",
    });
  });

  it("explains an empty or truncated reply", () => {
    expect(classifyPlan(progress({}), false)).toEqual({ kind: "failed", message: "The AI didn't return an outline. Try again." });
    expect(classifyPlan(progress({ truncated: true }), false)).toMatchObject({ message: expect.stringContaining("ran out of room") });
  });

  it("reports a stop instead of a failure when nothing arrived", () => {
    expect(classifyPlan(progress({ rejection: "x" }), true)).toEqual({ kind: "stopped" });
  });
});
