"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactElement, ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={400} skipDelayDuration={300}>
      {children}
    </RadixTooltip.Provider>
  );
}

export function Tooltip({
  content,
  shortcut,
  disabled,
  side = "bottom",
  children,
}: {
  content: ReactNode;
  shortcut?: string;
  /** Disabled buttons swallow pointer events, so the trigger moves to a wrapper. */
  disabled?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactElement;
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>
        {disabled ? <span className="inline-flex cursor-not-allowed *:pointer-events-none">{children}</span> : children}
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="tooltip-content z-50 flex max-w-64 items-center gap-2 rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow-lg"
        >
          <span>{content}</span>
          {shortcut && <kbd className="font-sans text-zinc-400">{shortcut}</kbd>}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
