import { createSampleDeck } from "@/lib/deck/fixture";
import { useDeckStore } from "@/lib/deck/store";
import { resetGeneration } from "@/lib/generation/store";
import { resolveCurrentSlideId, useUiStore } from "@/lib/ui/store";

export type NewSlidePosition = "after-current" | "end";

const MAX_TITLE_LENGTH = 120;

function currentSlideId(): string | null {
  return resolveCurrentSlideId(useDeckStore.getState().deck, useUiStore.getState().currentSlideId);
}

export function addBlankSlide(position: NewSlidePosition): void {
  const { deck, applyOps } = useDeckStore.getState();
  const current = currentSlideId();
  const index =
    position === "after-current" && current ? deck.slideOrder.indexOf(current) + 1 : deck.slideOrder.length;
  const [result] = applyOps([{ op: "add_slide", index, slide: { title: "Untitled slide" } }], {
    source: "user",
    label: "Add slide",
  });
  if (result?.ok && result.id) useUiStore.getState().goToSlide(result.id);
}

export function duplicateCurrentSlide(): void {
  const id = currentSlideId();
  if (!id) return;
  const [result] = useDeckStore
    .getState()
    .applyOps([{ op: "duplicate_slide", id }], { source: "user", label: "Duplicate slide" });
  if (result?.ok && result.id) useUiStore.getState().goToSlide(result.id);
}

export function deleteCurrentSlide(): void {
  const id = currentSlideId();
  if (id) useDeckStore.getState().applyOps([{ op: "delete_slide", id }], { source: "user", label: "Delete slide" });
}

export function startRenamingCurrentSlide(): void {
  const id = currentSlideId();
  if (id) useUiStore.getState().setRenamingSlideId(id);
}

export function renameSlide(id: string, title: string): void {
  const { deck, applyOps } = useDeckStore.getState();
  const slide = deck.slides[id];
  const next = title.trim().slice(0, MAX_TITLE_LENGTH);
  if (!slide || !next || next === slide.title) return;
  applyOps([{ op: "update_slide", id, patch: { title: next } }], { source: "user", label: "Rename slide" });
}

export function moveSlide(id: string, toIndex: number): void {
  const { deck, applyOps } = useDeckStore.getState();
  const from = deck.slideOrder.indexOf(id);
  if (from === -1 || from === toIndex) return;
  applyOps([{ op: "reorder_slides", id, toIndex }], { source: "user", label: "Reorder slide" });
}

export function isFilmstripFocused(): boolean {
  return document.activeElement?.closest("[data-filmstrip]") != null;
}

export function startNewDeck(): void {
  const { deck, applyOps } = useDeckStore.getState();
  if (deck.slideOrder.length === 0) return;
  applyOps(
    [
      ...deck.slideOrder.map((id) => ({ op: "delete_slide" as const, id })),
      { op: "update_deck", patch: { title: "Untitled deck" } },
    ],
    { source: "user", label: "New deck" },
  );
  resetGeneration();
  requestAnimationFrame(() => document.getElementById("deck-prompt")?.focus());
}

export function loadSampleDeck(): void {
  useDeckStore.getState().replaceDeck(createSampleDeck());
  resetGeneration();
  useUiStore.setState({ currentSlideId: null, selectedIds: [] });
}
