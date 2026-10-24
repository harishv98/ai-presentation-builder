"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  BringToFront,
  ChevronDown,
  Copy,
  Paintbrush,
  SendToBack,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { deleteSelection, duplicateSelection, moveSelectionToSlide, reorderSelection } from "@/lib/canvas/actions";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";
import { useCurrentSlideId } from "@/lib/ui/useCurrentSlideId";
import { useSelectedIds } from "@/lib/ui/useSelectedIds";

export function SelectionToolbar() {
  const count = useSelectedIds().length;
  if (count === 0) return null;

  return (
    <div className="mr-4 ml-auto flex items-center gap-1">
      <span className="mr-1 text-xs text-zinc-500 tabular-nums">{count} selected</span>
      {count === 1 && (
        <Button tooltip="Format the selected element" onClick={() => useUiStore.getState().setRightPanel("format")}>
          <Paintbrush aria-hidden />
          Format
        </Button>
      )}
      <Divider />
      <Button iconOnly aria-label="Bring forward" tooltip="Bring forward" shortcut="⌘]" onClick={() => reorderSelection("forward")}>
        <ArrowUp aria-hidden />
      </Button>
      <Button iconOnly aria-label="Send backward" tooltip="Send backward" shortcut="⌘[" onClick={() => reorderSelection("backward")}>
        <ArrowDown aria-hidden />
      </Button>
      <Button iconOnly aria-label="Bring to front" tooltip="Bring to front" shortcut="⌘⇧]" onClick={() => reorderSelection("front")}>
        <BringToFront aria-hidden />
      </Button>
      <Button iconOnly aria-label="Send to back" tooltip="Send to back" shortcut="⌘⇧[" onClick={() => reorderSelection("back")}>
        <SendToBack aria-hidden />
      </Button>
      <Divider />
      <MoveToSlide />
      <Button iconOnly aria-label="Duplicate" tooltip="Duplicate" shortcut="⌘D" onClick={duplicateSelection}>
        <Copy aria-hidden />
      </Button>
      <Button iconOnly danger aria-label="Delete" tooltip="Delete" shortcut="⌫" onClick={deleteSelection}>
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-chrome-border" />;
}

function MoveToSlide() {
  const currentSlideId = useCurrentSlideId();
  const slideOrder = useDeckStore((s) => s.deck.slideOrder);
  const slides = useDeckStore((s) => s.deck.slides);
  if (slideOrder.length < 2) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button aria-label="Move the selection to another slide">
          <ArrowRightLeft aria-hidden />
          Move to
          <ChevronDown aria-hidden className="text-zinc-400" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="menu-content z-50 max-h-72 min-w-48 max-w-72 overflow-y-auto rounded-md border border-chrome-border bg-white p-1 shadow-lg"
        >
          {slideOrder.map((id, index) =>
            id === currentSlideId ? null : (
              <DropdownMenu.Item
                key={id}
                onSelect={() => moveSelectionToSlide(id)}
                className="flex cursor-default gap-2 rounded px-2 py-1.5 text-xs text-zinc-700 outline-none select-none data-highlighted:bg-zinc-100"
              >
                <span className="w-4 shrink-0 text-right text-zinc-400 tabular-nums">{index + 1}</span>
                <span className="truncate">{slides[id]?.title || "Untitled"}</span>
              </DropdownMenu.Item>
            ),
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-chrome-border" />
          <p className="px-2 py-1 text-[11px] leading-snug text-zinc-400">
            Or drag onto a thumbnail; hold Alt to copy.
          </p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
