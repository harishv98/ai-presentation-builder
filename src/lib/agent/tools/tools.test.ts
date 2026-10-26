import { describe, expect, it } from "vitest";
import { AGENT_MODES } from "../protocol";
import { findTool, toOpenAiTools, toolsForMode } from ".";

describe("tool registry", () => {
  it.each(AGENT_MODES)("converts every %s tool to an OpenAI object schema with a unique name", (mode) => {
    const tools = toOpenAiTools(toolsForMode(mode));
    expect(tools.length).toBeGreaterThan(0);
    expect(new Set(tools.map((tool) => tool.function.name)).size).toBe(tools.length);
    for (const { function: fn } of tools) {
      expect(fn.description).not.toBe("");
      expect(fn.parameters).toMatchObject({ type: "object" });
      expect(fn.parameters).not.toHaveProperty("$schema");
    }
  });

  it("finds tools only in the modes that allow them", () => {
    expect(findTool("plan_deck", "plan")).toBeDefined();
    expect(findTool("plan_deck")).toBeUndefined();
    expect(findTool("add_element", "populate")).toBeDefined();
    expect(findTool("delete_slide", "populate")).toBeUndefined();
  });
});
