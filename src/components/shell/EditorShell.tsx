"use client";

import { CanvasStage } from "@/components/canvas/CanvasStage";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Filmstrip } from "@/components/filmstrip/Filmstrip";
import { FilmstripToolbar } from "@/components/filmstrip/FilmstripToolbar";
import { EmptyDeck } from "@/components/generation/EmptyDeck";
import { PlanningState } from "@/components/generation/PlanningState";
import { selectRunning, useChatStore } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";
import { useGenerationStore } from "@/lib/generation/store";
import { startNewDeck } from "@/lib/slides/actions";
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
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate text-sm font-semibold">{deckTitle}</span>
          <NewDeckButton />
        </div>
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
  const planning = useGenerationStore((s) => s.phase === "planning");
  if (!slideId) return planning ? <PlanningState /> : <EmptyDeck />;
  return <CanvasStage slideId={slideId} />;
}

function NewDeckButton() {
  const empty = useDeckStore((s) => s.deck.slideOrder.length === 0);
  const running = useChatStore(selectRunning);
  return (
    <button
      type="button"
      onClick={startNewDeck}
      disabled={empty || running}
      title="Clear the deck and describe a new one (⌘Z brings this one back)"
      className="rounded border border-chrome-border px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
    >
      New deck
    </button>
  );
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
