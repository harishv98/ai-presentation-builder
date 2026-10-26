"use client";

import { fillSlide } from "@/lib/agent/flows/generateDeck";
import { selectRunning, useChatStore } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";
import { selectAcceptsFills, useGenerationStore, type FillStatus } from "@/lib/generation/store";

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
  const acceptsFills = useGenerationStore(selectAcceptsFills);

  if (!current) return <p className="text-xs text-zinc-400">Generated an earlier deck.</p>;

  const ids = slideOrder.filter((id) => fills[id]);
  const planning = phase === "planning";
  if (ids.length === 0 && !planning) return null;
  const done = ids.filter((id) => fills[id]?.status === "done").length;
  // Only the heading is announced (polite live region). The planning count is aria-hidden so streaming
  // slides don't re-announce it; rows are not live, so per-slide status changes stay quiet.
  const heading = planning
    ? "Planning the outline"
    : phase === "populating"
      ? `Filling slides · ${done} of ${ids.length}`
      : `${done} of ${ids.length} slides filled`;

  return (
    <div className="flex flex-col gap-1 rounded border border-chrome-border px-3 py-2 text-xs">
      <p role="status" className={`font-medium text-zinc-700 ${planning ? "animate-pulse" : ""}`}>
        {heading}
        {planning && <span aria-hidden> · {ids.length} {ids.length === 1 ? "slide" : "slides"} so far</span>}
      </p>
      <ol className="flex flex-col gap-0.5">
        {ids.map((id) => {
          const fill = fills[id]!;
          const status = STATUS[fill.status];
          const action = fill.status === "failed" ? "Retry" : fill.status === "stopped" ? "Fill" : null;
          return (
            <li key={id} tabIndex={-1} className="flex flex-col focus:outline-none">
              <div className="flex items-baseline gap-2">
                <span aria-hidden className={`w-3 shrink-0 ${status.className}`}>{status.glyph}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-700">
                  {slideOrder.indexOf(id) + 1}. {slides[id]?.title}
                </span>
                {status.label ? <span className="text-zinc-400">{status.label}</span> : fill.status === "done" && <span className="sr-only">Done</span>}
                {action && (
                  <button
                    type="button"
                    disabled={running && !acceptsFills}
                    onClick={(event) => {
                      // The button unmounts when the fill starts; keep focus on its (persistent) row instead.
                      event.currentTarget.closest("li")?.focus({ preventScroll: true });
                      void fillSlide(id);
                    }}
                    className="font-medium text-accent underline disabled:opacity-40"
                  >
                    {action}
                  </button>
                )}
              </div>
              {fill.status === "failed" && fill.error && <p className="pl-5 break-words text-amber-700">{fill.error}</p>}
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
