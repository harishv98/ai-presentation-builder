import { create } from "zustand";
import type { Deck } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";

type UiState = {
  currentSlideId: string | null;
  goToSlide: (id: string) => void;
};

export const useUiStore = create<UiState>()((set) => ({
  currentSlideId: null,
  goToSlide: (id) => set({ currentSlideId: id }),
}));

export function resolveCurrentSlideId(deck: Deck, storedId: string | null): string | null {
  if (storedId && deck.slides[storedId]) return storedId;
  return deck.slideOrder[0] ?? null;
}

export function goRelative(delta: 1 | -1): void {
  const { deck } = useDeckStore.getState();
  const { currentSlideId, goToSlide } = useUiStore.getState();
  const current = resolveCurrentSlideId(deck, currentSlideId);
  if (!current) return;
  const index = deck.slideOrder.indexOf(current);
  const next = deck.slideOrder[Math.min(Math.max(index + delta, 0), deck.slideOrder.length - 1)];
  if (next) goToSlide(next);
}
