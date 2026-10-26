import { create } from "zustand";
import type { PlannedSlide } from "@/lib/agent/tools/planTool";

export type FillStatus = "pending" | "filling" | "done" | "failed" | "stopped";
export type SlideFill = { status: FillStatus; error?: string };

type GenerationState = {
  runId: number;
  phase: "idle" | "planning" | "populating" | "done";
  nextTitle: string | null;
  outline: Record<string, PlannedSlide>;
  slides: Record<string, SlideFill>;
};

const IDLE: Omit<GenerationState, "runId"> = { phase: "idle", nextTitle: null, outline: {}, slides: {} };

export const useGenerationStore = create<GenerationState>()(() => ({ runId: 0, ...IDLE }));

/** A generation is running and its slide pool takes retries. */
export const selectAcceptsFills = (s: GenerationState) => s.phase === "planning" || s.phase === "populating";

const set = useGenerationStore.setState;

export function startGeneration(): number {
  const runId = useGenerationStore.getState().runId + 1;
  set({ ...IDLE, runId, phase: "planning" });
  return runId;
}

export function setNextTitle(title: string | null): void {
  if (useGenerationStore.getState().nextTitle !== title) set({ nextTitle: title });
}

export function addOutlineSlide(id: string, planned: PlannedSlide): void {
  set((s) => ({ outline: { ...s.outline, [id]: planned }, slides: { ...s.slides, [id]: { status: "pending" } } }));
}

export function finishOutline(): void {
  set({ phase: "populating", nextTitle: null });
}

export function setSlideFill(id: string, fill: SlideFill): void {
  set((s) => ({ slides: { ...s.slides, [id]: fill } }));
}

export function finishGeneration(): void {
  set((s) => ({
    phase: "done",
    slides: Object.fromEntries(
      Object.entries(s.slides).map(([id, fill]) => [
        id,
        fill.status === "pending" || fill.status === "filling" ? { status: "stopped" as const } : fill,
      ]),
    ),
  }));
}

export function resetGeneration(): void {
  set(IDLE);
}
