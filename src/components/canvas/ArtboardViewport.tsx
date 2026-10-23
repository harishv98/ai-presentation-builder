"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/deck/constants";
import { ScaledArtboard } from "@/components/slide/ScaledArtboard";

const VIEWPORT_PADDING = 48;

export function ArtboardViewport({ children }: { children?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const fit = Math.min(
        (width - VIEWPORT_PADDING * 2) / ARTBOARD_WIDTH,
        (height - VIEWPORT_PADDING * 2) / ARTBOARD_HEIGHT,
      );
      setScale(Math.max(fit, 0.05));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {scale > 0 && (
        <div className="shadow-lg ring-1 ring-black/5">
          <ScaledArtboard scale={scale}>{children}</ScaledArtboard>
        </div>
      )}
      <div className="absolute right-3 bottom-2 text-xs text-zinc-400 tabular-nums">
        {ARTBOARD_WIDTH} × {ARTBOARD_HEIGHT} · {Math.round(scale * 100)}%
      </div>
    </div>
  );
}
