"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  ARTBOARD_BOX,
  boxesIntersect,
  clampGroupDelta,
  rectFromPoints,
  sameBox,
  translateBox,
  unionBox,
  type Point,
} from "@/lib/canvas/geometry";
import { resizeBox, type Handle } from "@/lib/canvas/resize";
import { guidesFor, snapMove, snapResize } from "@/lib/canvas/snap";
import { ARTBOARD_WIDTH } from "@/lib/deck/constants";
import type { Op } from "@/lib/deck/ops";
import type { Box } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { selectionOnSlide, useUiStore } from "@/lib/ui/store";

const DRAG_THRESHOLD_PX = 3;
const SNAP_THRESHOLD_PX = 6;

type GestureBase = { pointerId: number; scale: number; origin: Point; targets: Box[] };

type Gesture =
  | (GestureBase & {
      kind: "move";
      ids: string[];
      startBoxes: Record<string, Box>;
      group: Box;
      started: boolean;
      pressedId: string;
      wasSelected: boolean;
    })
  | (GestureBase & { kind: "resize"; id: string; handle: Handle; startBox: Box })
  | (GestureBase & { kind: "marquee"; base: string[]; candidates: { id: string; box: Box }[] });

type StageEvent = ReactPointerEvent<HTMLDivElement>;

function toLogical(event: StageEvent, scale: number): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
}

function endGesture(): void {
  const ui = useUiStore.getState();
  ui.setDragPreview(null);
  ui.setMarquee(null);
}

const countLabel = (verb: string, n: number) => (n === 1 ? `${verb} element` : `${verb} ${n} elements`);

export function useCanvasGesture(slideId: string) {
  const gesture = useRef<Gesture | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const g = gesture.current;
      if (!g) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key !== "Escape") return;
      if (g.kind === "marquee") useUiStore.getState().setSelection(g.base);
      gesture.current = null;
      endGesture();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  function onPointerDown(event: StageEvent) {
    if (event.button !== 0 || gesture.current) return;
    event.stopPropagation();

    const { deck } = useDeckStore.getState();
    const ui = useUiStore.getState();
    const slide = deck.slides[slideId];
    if (!slide) return;

    const scale = event.currentTarget.getBoundingClientRect().width / ARTBOARD_WIDTH;
    const origin = toLogical(event, scale);
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle as Handle | undefined;
    const elementId = target.closest<HTMLElement>("[data-element-id]")?.dataset.elementId;
    const selected = selectionOnSlide(deck, slideId, ui.selectedIds);
    const boxOf = (id: string) => deck.elements[id]!.box;
    const targetsExcept = (ids: string[]) => [
      ARTBOARD_BOX,
      ...slide.elementOrder.filter((id) => !ids.includes(id)).map(boxOf),
    ];
    const base = { pointerId: event.pointerId, scale, origin };

    if (handle && selected.length === 1) {
      const id = selected[0]!;
      gesture.current = { ...base, kind: "resize", id, handle, startBox: boxOf(id), targets: targetsExcept([id]) };
    } else if (elementId) {
      if (event.shiftKey) {
        ui.toggleSelected(elementId);
        return;
      }
      const wasSelected = selected.includes(elementId);
      const ids = wasSelected ? selected : [elementId];
      if (!wasSelected) ui.setSelection(ids);
      const startBoxes = Object.fromEntries(ids.map((id) => [id, boxOf(id)]));
      gesture.current = {
        ...base,
        kind: "move",
        ids,
        startBoxes,
        group: unionBox(Object.values(startBoxes)),
        targets: targetsExcept(ids),
        started: false,
        pressedId: elementId,
        wasSelected,
      };
    } else {
      const keep = event.shiftKey ? selected : [];
      ui.setSelection(keep);
      gesture.current = {
        ...base,
        kind: "marquee",
        base: keep,
        candidates: slide.elementOrder.map((id) => ({ id, box: boxOf(id) })),
        targets: [],
      };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: StageEvent) {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointerId) return;
    const point = toLogical(event, g.scale);
    let dx = point.x - g.origin.x;
    let dy = point.y - g.origin.y;
    const ui = useUiStore.getState();
    const threshold = SNAP_THRESHOLD_PX / g.scale;
    const snapping = !(event.metaKey || event.ctrlKey);
    const pastThreshold = Math.hypot(dx, dy) * g.scale >= DRAG_THRESHOLD_PX;

    switch (g.kind) {
      case "move": {
        if (!g.started && !pastThreshold) return;
        g.started = true;
        const lock = event.shiftKey ? (Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical") : null;
        if (lock === "horizontal") dy = 0;
        if (lock === "vertical") dx = 0;
        const moved = translateBox(g.group, Math.round(dx), Math.round(dy));
        const snapped = snapping ? snapMove(moved, g.targets, threshold) : moved;
        const delta = clampGroupDelta(
          g.group,
          lock === "vertical" ? 0 : snapped.x - g.group.x,
          lock === "horizontal" ? 0 : snapped.y - g.group.y,
        );
        const boxes = Object.fromEntries(
          Object.entries(g.startBoxes).map(([id, box]) => [id, translateBox(box, delta.x, delta.y)]),
        );
        const guides = snapping ? guidesFor(translateBox(g.group, delta.x, delta.y), g.targets) : [];
        ui.setDragPreview({ boxes, guides });
        return;
      }
      case "resize": {
        let box = resizeBox(g.startBox, g.handle, dx, dy, event.shiftKey);
        if (snapping && !event.shiftKey) box = snapResize(box, g.handle, g.targets, threshold);
        ui.setDragPreview({ boxes: { [g.id]: box }, guides: snapping ? guidesFor(box, g.targets) : [] });
        return;
      }
      case "marquee": {
        if (!pastThreshold && !ui.marquee) return;
        const rect = rectFromPoints(g.origin, point);
        ui.setMarquee(rect);
        const hits = g.candidates.filter(({ box }) => boxesIntersect(box, rect)).map(({ id }) => id);
        ui.setSelection([...new Set([...g.base, ...hits])]);
        return;
      }
    }
  }

  function onPointerUp(event: StageEvent) {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointerId) return;
    gesture.current = null;
    const preview = useUiStore.getState().dragPreview;
    const { applyOps } = useDeckStore.getState();

    if (g.kind === "move") {
      if (!g.started && g.wasSelected) useUiStore.getState().setSelection([g.pressedId]);
      const ops: Op[] = g.ids.flatMap((id): Op[] => {
        const box = preview?.boxes[id];
        return box && !sameBox(box, g.startBoxes[id]!) ? [{ op: "move_element", id, box: { x: box.x, y: box.y } }] : [];
      });
      if (ops.length > 0) applyOps(ops, { source: "user", label: countLabel("Move", ops.length) });
    }
    if (g.kind === "resize") {
      const box = preview?.boxes[g.id];
      if (box && !sameBox(box, g.startBox)) {
        applyOps([{ op: "update_element", id: g.id, patch: { box } }], { source: "user", label: "Resize element" });
      }
    }
    endGesture();
  }

  function onPointerCancel(event: StageEvent) {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointerId) return;
    if (g.kind === "marquee") useUiStore.getState().setSelection(g.base);
    gesture.current = null;
    endGesture();
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
