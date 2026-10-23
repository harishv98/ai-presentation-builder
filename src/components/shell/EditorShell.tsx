"use client";

import { CanvasStage } from "@/components/canvas/CanvasStage";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Filmstrip } from "@/components/filmstrip/Filmstrip";
import { FilmstripToolbar } from "@/components/filmstrip/FilmstripToolbar";
import { useDeckStore } from "@/lib/deck/store";
import { addBlankSlide } from "@/lib/slides/actions";
import { useCurrentSlideId } from "@/lib/ui/useCurrentSlideId";
import { SelectionToolbar } from "./SelectionToolbar";
import { useEditorShortcuts } from "./useEditorShortcuts";
import "@/lib/agent/devtools";

export function EditorShell() {
  useEditorShortcuts();
  const deckTitle = useDeckStore((s) => s.deck.title);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-chrome-border bg-white px-4">
        <span className="truncate text-sm font-semibold">{deckTitle}</span>
        <SelectionToolbar />
        <HistoryButtons />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[216px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-chrome-border bg-white p-3">
          <FilmstripToolbar />
          <Filmstrip />
        </aside>

        <main className="min-w-0 flex-1">
          <CanvasArea />
        </main>

        <ChatPanel />
      </div>
    </div>
  );
}

function CanvasArea() {
  const slideId = useCurrentSlideId();

  if (!slideId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-zinc-400">
        <p>This deck has no slides yet.</p>
        <button
          type="button"
          onClick={() => addBlankSlide("end")}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Add blank slide
        </button>
      </div>
    );
  }

  return <CanvasStage slideId={slideId} />;
}

function HistoryButtons() {
  const undoLabel = useDeckStore((s) => s.past.at(-1)?.label);
  const redoLabel = useDeckStore((s) => s.future.at(-1)?.label);
  const undo = useDeckStore((s) => s.undo);
  const redo = useDeckStore((s) => s.redo);

  const buttonClass =
    "rounded px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent";

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={buttonClass}
        onClick={undo}
        disabled={!undoLabel}
        title={undoLabel ? `Undo: ${undoLabel} (⌘Z)` : "Nothing to undo"}
      >
        Undo
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={redo}
        disabled={!redoLabel}
        title={redoLabel ? `Redo: ${redoLabel} (⌘⇧Z)` : "Nothing to redo"}
      >
        Redo
      </button>
    </div>
  );
}
