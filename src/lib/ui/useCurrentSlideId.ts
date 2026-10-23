import { useDeckStore } from "@/lib/deck/store";
import { resolveCurrentSlideId, useUiStore } from "./store";

export function useCurrentSlideId(): string | null {
  const storedId = useUiStore((s) => s.currentSlideId);
  return useDeckStore((s) => resolveCurrentSlideId(s.deck, storedId));
}
