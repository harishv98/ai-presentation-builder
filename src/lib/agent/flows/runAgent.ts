import { assistantTextWriter, pushNotice, useChatStore, type TurnChanges } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";
import { resolveCurrentSlideId, useUiStore } from "@/lib/ui/store";
import { describeError } from "../stream/agentRequest";
import { autoArrange, executeToolCall, newUndoGroup, type ToolExecution, type UndoGroup } from "../runtime/executeTool";
import { MAX_AGENT_STEPS, type ChatMessage, type ChatRequest, type ToolCall } from "../protocol";
import { revealAiChanges } from "../runtime/reveal";
import { clip, serializeForAI, type TurnMarks } from "../deck/snapshot";
import { runToolLoop } from "../runtime/toolLoop";

/** What this reply has changed so far. */
type EditLog = {
  /** Elements and slides to flag as added or edited in the next snapshot. */
  marks: TurnMarks;
  /** One line per applied change, kept so later replies can see or revert it. */
  changes: string[];
};

export function stopAgent(): void {
  useChatStore.getState().abort?.abort();
}

export async function runAgent(prompt: string): Promise<void> {
  const text = prompt.trim();
  const chat = useChatStore.getState();
  if (!text || chat.abort) return;

  const abort = new AbortController();
  chat.beginTurn(abort);
  chat.pushItem({ kind: "user", text });
  const undoGroup = newUndoGroup(`AI: ${clip(text, 40)}`);
  const log: EditLog = { marks: new Map(), changes: [] };
  let reply = "";

  try {
    const end = await runToolLoop(text, {
      maxSteps: MAX_AGENT_STEPS,
      signal: abort.signal,
      buildRequest: (turn) => editRequest([...useChatStore.getState().history, ...turn], log.marks),
      textWriter: assistantTextWriter,
      execute: (call) => applyEdit(call, undoGroup, log),
      decide(step) {
        reply = step.text;
        return step.toolCalls.length === 0 ? "stop" : "continue";
      },
    });
    const changed = log.marks.size > 0;
    if (end.outOfSteps) {
      pushNotice("info", `Stopped after ${MAX_AGENT_STEPS} steps. Changes so far are applied; ⌘Z undoes them.`);
    } else if (end.last && !end.last.text.trim()) {
      const why = end.last.truncated
        ? "The AI ran out of room while thinking and didn't reply. Try a more specific request."
        : "The AI ended without replying.";
      const kept = changed ? " Its changes are applied; ⌘Z undoes them." : "";
      pushNotice("info", `${why}${kept}`, end.last.truncated && !changed ? text : undefined);
    }
  } catch (error) {
    if (abort.signal.aborted) pushNotice("info", "Stopped. Changes made so far are kept; ⌘Z undoes them.");
    else pushNotice("error", describeError(error), text);
  } finally {
    useChatStore.getState().endTurn(
      [
        { role: "user", content: text },
        { role: "assistant", content: reply.trim() || "(no reply)" },
      ],
      { prompt: text, changes: log.changes },
    );
  }
}

function editRequest(messages: ChatMessage[], marks: TurnMarks): ChatRequest {
  const { deck } = useDeckStore.getState();
  const currentSlideId = resolveCurrentSlideId(deck, useUiStore.getState().currentSlideId);
  const snapshot = serializeForAI(deck, currentSlideId, marks) + describeRecentChanges(useChatStore.getState().recentChanges);
  return { mode: "edit", messages, deckSnapshot: snapshot };
}

function applyEdit(call: ToolCall, undoGroup: UndoGroup, log: EditLog): ToolExecution {
  const execution = executeToolCall(call, undoGroup);
  if (execution.ok) {
    const before = execution.previously.length > 0 ? ` (before: ${clip(execution.previously.join("; "), 400)})` : "";
    log.changes.push(`${execution.summary}${before}`);
    for (const id of execution.touched) {
      log.marks.set(id, execution.added.includes(id) || log.marks.get(id) === "added" ? "added" : "edited");
    }
    for (const id of arrangeAfterAdd(call, execution, undoGroup)) {
      if (!log.marks.has(id)) log.marks.set(id, "edited");
    }
  }
  useChatStore.getState().pushItem({
    kind: "tool",
    ok: execution.ok,
    summary: execution.ok ? execution.summary : `${call.function.name} failed: ${execution.summary}`,
  });
  if (execution.ok) revealAiChanges(execution.touched);
  return execution;
}

/** An element the editor placed reflows its slide; one the model positioned with a box stays put. */
function arrangeAfterAdd(call: ToolCall, execution: ToolExecution, undoGroup: UndoGroup): string[] {
  if (!call.function.name.startsWith("add_")) return [];
  const { box } = JSON.parse(call.function.arguments || "{}") as { box?: unknown };
  if (box !== undefined) return [];
  const { deck } = useDeckStore.getState();
  const slideIds = new Set(execution.added.flatMap((id) => (deck.elements[id] ? [deck.elements[id].slideId] : [])));
  return [...slideIds].flatMap((slideId) => autoArrange(slideId, undoGroup));
}

function describeRecentChanges(turns: TurnChanges[]): string {
  if (turns.length === 0) return "";
  const lines = turns.flatMap((turn) => [`For "${clip(turn.prompt, 80)}":`, ...turn.changes.map((change) => `- ${change}`)]);
  return `\n\nChanges from your earlier replies, oldest first ("before" is the state prior to that change):\n${lines.join("\n")}`;
}