"use client";

import { useEffect } from "react";
import {
  deleteSelection,
  duplicateSelection,
  hasSelection,
  nudgeSelection,
  reorderSelection,
  selectAllOnSlide,
  singleSelectedId,
  type ZDirection,
} from "@/lib/canvas/actions";
import { startEditing } from "@/lib/content/actions";
import { useDeckStore } from "@/lib/deck/store";
import { deleteCurrentSlide, duplicateCurrentSlide, isFilmstripFocused } from "@/lib/slides/actions";
import { goRelative, useUiStore } from "@/lib/ui/store";

const NUDGE_SMALL = 1;
const NUDGE_LARGE = 20;

const ARROW_VECTORS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const Z_SHORTCUTS: Record<string, [ZDirection, ZDirection]> = {
  BracketRight: ["forward", "front"],
  BracketLeft: ["backward", "back"],
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function useEditorShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (useUiStore.getState().draggingSlideId) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const { undo, redo } = useDeckStore.getState();

      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && key === "d") {
        event.preventDefault();
        if (hasSelection()) duplicateSelection();
        else if (isFilmstripFocused()) duplicateCurrentSlide();
        return;
      }
      if (mod && key === "a") {
        event.preventDefault();
        selectAllOnSlide();
        return;
      }
      const z = Z_SHORTCUTS[event.code];
      if (mod && z) {
        event.preventDefault();
        reorderSelection(event.shiftKey ? z[1] : z[0]);
        return;
      }
      if (mod || event.altKey) return;

      if (event.key === "Escape") {
        useUiStore.getState().clearSelection();
        return;
      }
      if (event.key === "Enter") {
        const id = singleSelectedId();
        if (id && !(event.target instanceof HTMLButtonElement)) {
          event.preventDefault();
          startEditing(id);
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (hasSelection()) deleteSelection();
        else if (isFilmstripFocused()) deleteCurrentSlide();
        return;
      }
      const vector = ARROW_VECTORS[event.key];
      if (vector && hasSelection()) {
        event.preventDefault();
        const step = event.shiftKey ? NUDGE_LARGE : NUDGE_SMALL;
        nudgeSelection(vector[0] * step, vector[1] * step);
        return;
      }

      switch (event.key) {
        case "ArrowDown":
        case "ArrowRight":
        case "PageDown":
          event.preventDefault();
          goRelative(1);
          break;
        case "ArrowUp":
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          goRelative(-1);
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
