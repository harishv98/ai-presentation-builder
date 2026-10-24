import { create } from "zustand";
import type { Guide } from "@/lib/canvas/snap";
import type { Box, Deck } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";

export type DragPreview = { boxes: Record<string, Box>; guides: Guide[] };
export type TextCaret = { x: number; y: number } | "all";
export type CellEditing = { kind: "cell"; elementId: string; row: number; col: number; txnId: string };
export type Editing = { kind: "text"; elementId: string; caret: TextCaret } | CellEditing;
export type RightPanelTab = "chat" | "format";

type UiState = {
  currentSlideId: string | null;
  selectedIds: string[];
  dragPreview: DragPreview | null;
  marquee: Box | null;
  draggingSlideId: string | null;
  renamingSlideId: string | null;
  aiHighlights: Record<string, number>;
  editing: Editing | null;
  rightPanel: RightPanelTab;
  setEditing: (editing: Editing | null) => void;
  setRightPanel: (tab: RightPanelTab) => void;
  goToSlide: (id: string) => void;
  setSelection: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  clearSelection: () => void;
  setDragPreview: (preview: DragPreview | null) => void;
  setMarquee: (box: Box | null) => void;
  setDraggingSlideId: (id: string | null) => void;
  setRenamingSlideId: (id: string | null) => void;
  flashAiHighlights: (ids: string[]) => void;
};

export const AI_HIGHLIGHT_MS = 1500;
let highlightSeq = 0;

export const useUiStore = create<UiState>()((set) => ({
  currentSlideId: null,
  selectedIds: [],
  dragPreview: null,
  marquee: null,
  draggingSlideId: null,
  renamingSlideId: null,
  aiHighlights: {},
  editing: null,
  rightPanel: "chat",
  setEditing: (editing) => set({ editing }),
  setRightPanel: (tab) => set({ rightPanel: tab }),
  goToSlide: (id) => set((s) => (s.currentSlideId === id ? s : { currentSlideId: id, selectedIds: [] })),
  setSelection: (ids) => set({ selectedIds: ids }),
  toggleSelected: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id],
    })),
  clearSelection: () => set((s) => (s.selectedIds.length === 0 ? s : { selectedIds: [] })),
  setDragPreview: (preview) => set({ dragPreview: preview }),
  setMarquee: (box) => set({ marquee: box }),
  setDraggingSlideId: (id) => set({ draggingSlideId: id }),
  setRenamingSlideId: (id) => set({ renamingSlideId: id }),
  flashAiHighlights(ids) {
    if (ids.length === 0) return;
    const seq = ++highlightSeq;
    set((s) => ({ aiHighlights: { ...s.aiHighlights, ...Object.fromEntries(ids.map((id) => [id, seq])) } }));
    setTimeout(() => {
      set((s) => ({ aiHighlights: Object.fromEntries(Object.entries(s.aiHighlights).filter(([, v]) => v !== seq)) }));
    }, AI_HIGHLIGHT_MS);
  },
}));

export function selectionOnSlide(deck: Deck, slideId: string, ids: string[]): string[] {
  return deck.slides[slideId]?.elementOrder.filter((id) => ids.includes(id)) ?? [];
}

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

useDeckStore.subscribe((state, prev) => {
  if (state.deck.slideOrder === prev.deck.slideOrder) return;
  const { currentSlideId } = useUiStore.getState();
  if (!currentSlideId || state.deck.slides[currentSlideId]) return;
  const order = state.deck.slideOrder;
  const was = prev.deck.slideOrder.indexOf(currentSlideId);
  const next = order[Math.min(Math.max(was, 0), order.length - 1)] ?? null;
  useUiStore.setState({ currentSlideId: next, selectedIds: [], renamingSlideId: null, editing: null });
});

declare global {
  interface Window {
    uiStore?: typeof useUiStore;
  }
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.uiStore = useUiStore;
}
