import { useShallow } from "zustand/react/shallow";
import { useDeckStore } from "@/lib/deck/store";
import { selectionOnSlide, useUiStore } from "./store";
import { useCurrentSlideId } from "./useCurrentSlideId";

export function useSelectedIds(): string[] {
  const slideId = useCurrentSlideId();
  const selectedIds = useUiStore((s) => s.selectedIds);
  return useDeckStore(useShallow((s) => (slideId ? selectionOnSlide(s.deck, slideId, selectedIds) : [])));
}
