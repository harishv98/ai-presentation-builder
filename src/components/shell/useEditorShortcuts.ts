"use client";

import { useEffect } from "react";
import { useDeckStore } from "@/lib/deck/store";
import { goRelative } from "@/lib/ui/store";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function useEditorShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
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
      if (mod || event.altKey) return;

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
