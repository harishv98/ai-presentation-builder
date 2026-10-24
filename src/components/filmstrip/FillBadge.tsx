"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import { bodyElements } from "@/lib/agent/arrange";
import { useDeckStore } from "@/lib/deck/store";
import { useGenerationStore } from "@/lib/generation/store";

export function FillBadge({ slideId }: { slideId: string }) {
  const status = useGenerationStore((s) => s.slides[slideId]?.status);
  const empty = useDeckStore((s) => bodyElements(s.deck, slideId).length === 0);

  if (status === "pending" || status === "filling") {
    return empty ? <span aria-hidden className="gen-shimmer pointer-events-none absolute inset-x-[6%] top-[26%] bottom-[8%] rounded-sm" /> : null;
  }
  if (status === "failed") return <Dot label="Couldn't fill this slide" className="bg-amber-500" />;
  if (status === "stopped") return <Dot label="Not filled yet" className="bg-zinc-400" />;
  return null;
}

function Dot({ label, className }: { label: string; className: string }) {
  return (
    <Tooltip content={label} side="right">
      <span role="img" aria-label={label} className={`absolute top-1 right-1 size-2 rounded-full ${className}`} />
    </Tooltip>
  );
}
