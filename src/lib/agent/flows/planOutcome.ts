import { clip } from "@/lib/deck/elements";

/** What the plan step produced, gathered while it streams. */
export type PlanProgress = {
  slideIds: string[];
  /** The finished plan_deck call arrived, whether or not it applied. */
  planCallSeen: boolean;
  /** Why a streamed slide or the plan_deck call was rejected. */
  rejection: string;
  /** Text the model wrote; with no slides, this is a clarifying question. */
  text: string;
  truncated: boolean;
};

export type PlanOutcome =
  | { kind: "slides"; slideIds: string[] }
  | { kind: "question"; text: string }
  | { kind: "failed"; message: string }
  | { kind: "stopped" };

export function emptyPlanProgress(): PlanProgress {
  return { slideIds: [], planCallSeen: false, rejection: "", text: "", truncated: false };
}

export function classifyPlan(progress: PlanProgress, aborted: boolean): PlanOutcome {
  const { slideIds, rejection } = progress;
  if (rejection && !aborted) return { kind: "failed", message: `The outline was invalid: ${clip(rejection, 300)}` };
  if (slideIds.length > 0) return { kind: "slides", slideIds };

  const question = progress.text.trim();
  if (question && !rejection) return { kind: "question", text: question };
  if (aborted) return { kind: "stopped" };
  return {
    kind: "failed",
    message: progress.truncated ? "The AI ran out of room while planning. Try a shorter request." : "The AI didn't return an outline. Try again.",
  };
}
