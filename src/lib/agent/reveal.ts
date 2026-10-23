import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";

export function revealAiChanges(ids: string[]): void {
  if (ids.length === 0) return;
  const { deck } = useDeckStore.getState();
  const slideIds = ids.map((id) => (deck.slides[id] ? id : deck.elements[id]?.slideId)).filter((id): id is string => !!id);
  const ui = useUiStore.getState();
  ui.flashAiHighlights([...new Set([...ids, ...slideIds])]);

  const target = slideIds.at(-1);
  const busy = ui.dragPreview || ui.marquee || ui.draggingSlideId || ui.renamingSlideId;
  if (target && !busy) ui.goToSlide(target);
}
