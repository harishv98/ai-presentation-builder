import { beforeEach, describe, expect, it } from "vitest";
import { applyOpsToDeck } from "@/lib/deck/ops";
import { createEmptyDeck, useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";
import type { ToolCall } from "../protocol";
import { executeToolCall, newUndoGroup } from "./executeTool";

const call = (name: string, args: unknown): ToolCall => ({
  id: "c1",
  type: "function",
  function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
});
const addText = (slideId: string) => call("add_element", { slideId, type: "text", text: { role: "body", content: ["Hi"] } });
const run = (toolCall: ToolCall, scope: object = {}) => executeToolCall(toolCall, { ...newUndoGroup("AI edit"), ...scope });

beforeEach(() => {
  const { deck } = applyOpsToDeck(createEmptyDeck(), [{ op: "add_slide" }, { op: "add_slide" }]);
  useDeckStore.getState().replaceDeck(deck);
  useUiStore.setState({ editing: null });
});

describe("executeToolCall", () => {
  it("rejects tools outside the mode and unparseable arguments", () => {
    expect(run(call("plan_deck", {})).summary).toBe("Tool plan_deck is not available here");
    expect(run(call("add_slide", {}), { mode: "populate" }).ok).toBe(false);
    expect(run(call("add_slide", "{oops")).summary).toBe("Arguments are not valid JSON");
  });

  it("rejects arguments the tool does not define instead of dropping them", () => {
    const result = run(call("update_slide", { slideId: "s1", layout: "content" }));
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("layout");
  });

  it("keeps populate on its own slide and away from what the user is editing", () => {
    expect(run(addText("s2"), { mode: "populate", slideId: "s1" }).summary).toBe("Only slide s1 can be changed now");
    useUiStore.setState({ editing: { kind: "text", elementId: "e9", caret: "all" } });
    expect(run(call("delete_element", { elementId: "e9" })).summary).toContain("The user is editing e9");
  });

  it("applies a valid call as one undoable step and reports what it added", () => {
    const result = run(addText("s1"));
    expect(result).toMatchObject({ ok: true, added: ["e3"], touched: ["e3"] });
    expect(JSON.parse(result.content)).toMatchObject({ ok: true });
    expect(useDeckStore.getState().deck.elements.e3).toBeDefined();

    useDeckStore.getState().undo();
    expect(useDeckStore.getState().deck.elements.e3).toBeUndefined();
  });
});
