"use client";

import { Download, FilePlus2, Redo2, Undo2 } from "lucide-react";
import { use } from "react";
import { CanvasStage } from "@/components/canvas/CanvasStage";
import { CANVAS_REGION_ID } from "@/components/canvas/SlideFillOverlay";
import { Filmstrip } from "@/components/filmstrip/Filmstrip";
import { FilmstripToolbar } from "@/components/filmstrip/FilmstripToolbar";
import { EmptyDeck } from "@/components/generation/EmptyDeck";
import { PlanningState } from "@/components/generation/PlanningState";
import { InsertToolbar } from "@/components/insert/InsertToolbar";
import { Button } from "@/components/ui/Button";
import { selectRunning, useChatStore } from "@/lib/chat/store";
import { restoreDeck } from "@/lib/deck/persist";
import { useDeckStore } from "@/lib/deck/store";
import { useGenerationStore } from "@/lib/generation/store";
import { startNewDeck } from "@/lib/slides/actions";
import { useCurrentSlideId } from "@/lib/ui/useCurrentSlideId";
import { PrintDeck, printDeck } from "./PrintDeck";
import { RightPanel } from "./RightPanel";
import { SelectionToolbar } from "./SelectionToolbar";
import { useEditorShortcuts } from "./useEditorShortcuts";

export function EditorShell() {
  use(restoreDeck());
  useEditorShortcuts();
  const deckTitle = useDeckStore((s) => s.deck.title);

  return (
    <>
      <div className="flex h-screen flex-col print:hidden">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-chrome-border bg-white px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-sm font-semibold">{deckTitle}</span>
            <NewDeckButton />
          </div>
          <SelectionToolbar />
          <div className="flex items-center gap-2">
            <HistoryButtons />
            <ExportButton />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[272px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-chrome-border bg-white p-3">
            <FilmstripToolbar />
            <Filmstrip />
          </aside>

          <main id={CANVAS_REGION_ID} tabIndex={-1} aria-label="Slide canvas" className="min-w-0 flex-1 focus:outline-none">
            <CanvasArea />
          </main>

          <RightPanel />
        </div>
      </div>
      <PrintDeck />
    </>
  );
}

function CanvasArea() {
  const slideId = useCurrentSlideId();
  const planning = useGenerationStore((s) => s.phase === "planning");
  if (!slideId) return planning ? <PlanningState /> : <EmptyDeck />;
  return (
    <div className="flex h-full flex-col">
      <InsertToolbar />
      <div className="min-h-0 flex-1">
        <CanvasStage slideId={slideId} />
      </div>
    </div>
  );
}

function NewDeckButton() {
  const empty = useDeckStore((s) => s.deck.slideOrder.length === 0);
  const running = useChatStore(selectRunning);
  return (
    <Button
      variant="outline"
      size="md"
      onClick={startNewDeck}
      disabled={empty || running}
      tooltip="Clear the deck and describe a new one (⌘Z brings this one back)"
    >
      <FilePlus2 aria-hidden />
      New deck
    </Button>
  );
}

function ExportButton() {
  const empty = useDeckStore((s) => s.deck.slideOrder.length === 0);
  return (
    <Button
      variant="outline"
      size="md"
      onClick={printDeck}
      disabled={empty}
      tooltip="Save as PDF from the print dialog"
      shortcut="⌘P"
    >
      <Download aria-hidden />
      Export PDF
    </Button>
  );
}

function HistoryButtons() {
  const undoLabel = useDeckStore((s) => s.past.at(-1)?.label);
  const redoLabel = useDeckStore((s) => s.future.at(-1)?.label);
  const undo = useDeckStore((s) => s.undo);
  const redo = useDeckStore((s) => s.redo);

  return (
    <div className="flex items-center gap-1">
      <Button
        size="md"
        iconOnly
        aria-label="Undo"
        onClick={undo}
        disabled={!undoLabel}
        tooltip={undoLabel ? `Undo: ${undoLabel}` : "Nothing to undo"}
        shortcut={undoLabel && "⌘Z"}
      >
        <Undo2 aria-hidden />
      </Button>
      <Button
        size="md"
        iconOnly
        aria-label="Redo"
        onClick={redo}
        disabled={!redoLabel}
        tooltip={redoLabel ? `Redo: ${redoLabel}` : "Nothing to redo"}
        shortcut={redoLabel && "⌘⇧Z"}
      >
        <Redo2 aria-hidden />
      </Button>
    </div>
  );
}
