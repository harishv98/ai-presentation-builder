"use client";

import { fillSlide } from "@/lib/agent/generateDeck";
import { selectRunning, useChatStore } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";
import { useGenerationStore, type FillStatus } from "@/lib/generation/store";

const STATUS: Record<FillStatus, { glyph: string; className: string; label: string }> = {
  pending: { glyph: "○", className: "text-zinc-300", label: "Queued" },
  filling: { glyph: "●", className: "animate-pulse text-accent", label: "Writing…" },
  done: { glyph: "✓", className: "text-emerald-600", label: "" },
  failed: { glyph: "✗", className: "text-amber-600", label: "Failed" },
  stopped: { glyph: "–", className: "text-zinc-400", label: "Not filled" },
};

export function GenerationProgress({ runId }: { runId: number }) {
  const current = useGenerationStore((s) => s.runId === runId);
  const phase = useGenerationStore((s) => s.phase);
  const nextTitle = useGenerationStore((s) => s.nextTitle);
  const fills = useGenerationStore((s) => s.slides);
  const slideOrder = useDeckStore((s) => s.deck.slideOrder);
  const slides = useDeckStore((s) => s.deck.slides);
  const running = useChatStore(selectRunning);

  if (!current) return <p className="text-xs text-zinc-400">Generated an earlier deck.</p>;

  const ids = slideOrder.filter((id) => fills[id]);
  const planning = phase === "planning";
  if (ids.length === 0 && !planning) return null;
  const done = ids.filter((id) => fills[id]?.status === "done").length;
  const heading = planning
    ? `Planning the outline · ${ids.length} ${ids.length === 1 ? "slide" : "slides"} so far`
    : phase === "populating"
      ? `Filling slides · ${done} of ${ids.length}`
      : `${done} of ${ids.length} slides filled`;

  return (
    <div className="flex flex-col gap-1 rounded border border-chrome-border px-3 py-2 text-xs">
      <p className={`font-medium text-zinc-700 ${planning ? "animate-pulse" : ""}`}>{heading}</p>
      <ol className="flex flex-col gap-0.5">
        {ids.map((id) => {
          const fill = fills[id]!;
          const status = STATUS[fill.status];
          const action = fill.status === "failed" ? "Retry" : fill.status === "stopped" ? "Fill" : null;
          return (
            <li key={id} className="flex items-baseline gap-2">
              <span aria-hidden className={`w-3 shrink-0 ${status.className}`}>{status.glyph}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-700" title={fill.error}>
                {slideOrder.indexOf(id) + 1}. {slides[id]?.title}
              </span>
              {status.label ? <span className="text-zinc-400">{status.label}</span> : fill.status === "done" && <span className="sr-only">Done</span>}
              {action && (
                <button
                  type="button"
                  disabled={running}
                  onClick={() => void fillSlide(id)}
                  className="font-medium text-accent underline disabled:opacity-40"
                >
                  {action}
                </button>
              )}
            </li>
          );
        })}
        {planning && (
          <li className="flex items-baseline gap-2 text-zinc-400">
            <span className="w-3 shrink-0 animate-pulse">○</span>
            <span className="min-w-0 flex-1 truncate">
              {ids.length + 1}. {nextTitle ?? "…"}
            </span>
          </li>
        )}
      </ol>
    </div>
  );
}
