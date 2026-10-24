"use client";

import { bodyElements } from "@/lib/agent/arrange";
import { useDeckStore } from "@/lib/deck/store";
import { useGenerationStore } from "@/lib/generation/store";

export function FillBadge({ slideId }: { slideId: string }) {
  const status = useGenerationStore((s) => s.slides[slideId]?.status);
  const empty = useDeckStore((s) => bodyElements(s.deck, slideId).length === 0);

  if (status === "pending" || status === "filling") {
    return empty ? <span aria-hidden className="gen-shimmer pointer-events-none absolute inset-x-[6%] top-[26%] bottom-[8%] rounded-sm" /> : null;
  }
  if (status === "failed") return <span role="img" aria-label="Couldn't fill this slide" title="Couldn't fill this slide" className="absolute top-1 right-1 size-2 rounded-full bg-amber-500" />;
  if (status === "stopped") return <span role="img" aria-label="Not filled yet" title="Not filled yet" className="absolute top-1 right-1 size-2 rounded-full bg-zinc-400" />;
  return null;
}
