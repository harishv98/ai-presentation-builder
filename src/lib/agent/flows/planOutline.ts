import { assistantTextWriter } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";
import { addOutlineSlide, setNextTitle } from "@/lib/generation/store";
import { describeError, streamStep } from "../stream/agentRequest";
import { aiToolContext, executeToolCall, type UndoGroup } from "../runtime/executeTool";
import { classifyPlan, emptyPlanProgress, type PlanOutcome } from "./planOutcome";
import type { ChatMessage } from "../protocol";
import type { TurnEvents } from "../stream/sse";
import { addPlannedSlide, PlanDeckArgs, parseStreamedPlan, type PlannedSlide } from "../tools/planTool";

const MAX_PLANNED_SLIDES = 10;
const MAX_QUESTION_ROUNDS = 3;

/**
 * Streams the outline onto the empty deck: each slide is added as soon as its entry arrives in
 * the plan_deck arguments. The model may instead reply with a clarifying question.
 */
export async function planOutline(
  prompt: string,
  thread: ChatMessage[],
  undoGroup: UndoGroup,
  signal: AbortSignal,
  onFirstSlide: (slideId: string, planned: PlannedSlide) => void,
): Promise<PlanOutcome> {
  const ctx = aiToolContext(undoGroup);
  const progress = emptyPlanProgress();
  const forcePlan = thread.filter((message) => message.role === "assistant").length >= MAX_QUESTION_ROUNDS;
  const messages: ChatMessage[] = [...thread, { role: "user", content: prompt }];

  const addToOutline = (slideId: string, planned: PlannedSlide) => {
    progress.slideIds.push(slideId);
    addOutlineSlide(slideId, planned);
    if (progress.slideIds.length === 1) onFirstSlide(slideId, planned);
  };

  const events: TurnEvents = {
    onText: assistantTextWriter(),
    onToolArgs(args, index) {
      if (index !== 0) return;
      const streamed = parseStreamedPlan(args);
      for (const planned of streamed.slides.slice(progress.slideIds.length, MAX_PLANNED_SLIDES)) {
        const added = addPlannedSlide(ctx, planned);
        if (typeof added === "string") {
          progress.rejection = added;
          break;
        }
        addToOutline(added[0]!, planned);
      }
      setNextTitle(streamed.nextTitle);
    },
    onToolCall(call) {
      if (progress.planCallSeen || call.function.name !== "plan_deck") return;
      progress.planCallSeen = true;
      const execution = executeToolCall(call, { ...undoGroup, mode: "plan" });
      if (!execution.ok) {
        progress.rejection = execution.summary;
        return;
      }
      const { slides } = PlanDeckArgs.parse(JSON.parse(call.function.arguments));
      // plan_deck appends the slides that had not streamed in yet, in outline order.
      const streamedCount = progress.slideIds.length;
      const appendedIds = useDeckStore.getState().deck.slideOrder.slice(streamedCount);
      appendedIds.forEach((slideId, i) => addToOutline(slideId, slides[streamedCount + i]!));
    },
  };

  try {
    const request = { mode: "plan" as const, messages, deckSnapshot: "", ...(forcePlan && { forcePlan }) };
    const result = await streamStep(request, 0, signal, events);
    progress.text = result.text;
    progress.truncated = result.truncated;
  } catch (error) {
    return signal.aborted ? { kind: "stopped" } : { kind: "failed", message: describeError(error) };
  } finally {
    setNextTitle(null);
  }
  return classifyPlan(progress, signal.aborted);
}
