import type { Op } from "@/lib/deck/ops";
import { useDeckStore } from "@/lib/deck/store";
import { resolveCurrentSlideId, selectionOnSlide, useUiStore } from "@/lib/ui/store";
import { clampGroupDelta, translateBox, unionBox } from "./geometry";

export type ZDirection = "forward" | "backward" | "front" | "back";

const DUPLICATE_OFFSET = 20;
const NUDGE_MERGE_MS = 800;

const Z_LABEL: Record<ZDirection, string> = {
  forward: "Bring forward",
  backward: "Send backward",
  front: "Bring to front",
  back: "Send to back",
};

const countLabel = (verb: string, n: number) => (n === 1 ? `${verb} element` : `${verb} ${n} elements`);

/** Selected elements keep their order relative to each other and never swap with one another. */
export function zOrderOps(order: string[], selected: string[], direction: ZDirection): Op[] {
  const picked = order.filter((id) => selected.includes(id));
  const reorder = (id: string): Op => ({ op: "reorder_element", id, direction });
  if (direction === "front") return picked.map(reorder);
  if (direction === "back") return picked.reverse().map(reorder);

  const step = direction === "forward" ? 1 : -1;
  const sequence = direction === "forward" ? picked.reverse() : picked;
  const simulated = [...order];
  const blocked = new Set<string>();
  const ops: Op[] = [];
  for (const id of sequence) {
    const from = simulated.indexOf(id);
    const neighbour = simulated[from + step];
    if (neighbour === undefined || blocked.has(neighbour)) {
      blocked.add(id);
      continue;
    }
    simulated[from] = neighbour;
    simulated[from + step] = id;
    ops.push(reorder(id));
  }
  return ops;
}

function currentSelection(): { slideId: string; ids: string[] } | null {
  const { deck } = useDeckStore.getState();
  const { currentSlideId, selectedIds } = useUiStore.getState();
  const slideId = resolveCurrentSlideId(deck, currentSlideId);
  if (!slideId) return null;
  const ids = selectionOnSlide(deck, slideId, selectedIds);
  return ids.length > 0 ? { slideId, ids } : null;
}

export function hasSelection(): boolean {
  return currentSelection() !== null;
}

export function deleteSelection(): void {
  const selection = currentSelection();
  if (!selection) return;
  useDeckStore.getState().applyOps(
    selection.ids.map((id): Op => ({ op: "delete_element", id })),
    { source: "user", label: countLabel("Delete", selection.ids.length) },
  );
  useUiStore.getState().clearSelection();
}

export function duplicateSelection(): void {
  const selection = currentSelection();
  if (!selection) return;
  const { deck, applyOps } = useDeckStore.getState();
  const boxes = selection.ids.map((id) => deck.elements[id]!.box);
  const delta = clampGroupDelta(unionBox(boxes), DUPLICATE_OFFSET, DUPLICATE_OFFSET);
  const results = applyOps(
    selection.ids.map(
      (id, i): Op => ({ op: "move_element", id, copy: true, box: translateBox(boxes[i]!, delta.x, delta.y) }),
    ),
    { source: "user", label: countLabel("Duplicate", selection.ids.length) },
  );
  useUiStore.getState().setSelection(results.flatMap((r) => (r.ok && r.id ? [r.id] : [])));
}

let lastNudge = { txnId: "", at: 0 };

export function nudgeSelection(dx: number, dy: number): void {
  const selection = currentSelection();
  if (!selection) return;
  const { deck, applyOps } = useDeckStore.getState();
  const boxes = selection.ids.map((id) => deck.elements[id]!.box);
  const delta = clampGroupDelta(unionBox(boxes), dx, dy);
  if (delta.x === 0 && delta.y === 0) return;

  const now = performance.now();
  if (now - lastNudge.at > NUDGE_MERGE_MS) lastNudge = { txnId: crypto.randomUUID(), at: now };
  else lastNudge.at = now;

  applyOps(
    selection.ids.map((id, i): Op => {
      const box = translateBox(boxes[i]!, delta.x, delta.y);
      return { op: "move_element", id, box: { x: box.x, y: box.y } };
    }),
    { source: "user", label: countLabel("Nudge", selection.ids.length), txnId: lastNudge.txnId },
  );
}

export function reorderSelection(direction: ZDirection): void {
  const selection = currentSelection();
  if (!selection) return;
  const { deck, applyOps } = useDeckStore.getState();
  const ops = zOrderOps(deck.slides[selection.slideId]!.elementOrder, selection.ids, direction);
  if (ops.length > 0) applyOps(ops, { source: "user", label: Z_LABEL[direction] });
}

export function selectAllOnSlide(): void {
  const { deck } = useDeckStore.getState();
  const slideId = resolveCurrentSlideId(deck, useUiStore.getState().currentSlideId);
  if (slideId) useUiStore.getState().setSelection([...deck.slides[slideId]!.elementOrder]);
}
