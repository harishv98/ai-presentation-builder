"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { SlideRenderer } from "@/components/slide/SlideRenderer";
import { useDeckStore } from "@/lib/deck/store";

const usePrintStore = create<{ printing: boolean }>(() => ({ printing: false }));

export function printDeck(): void {
  if (useDeckStore.getState().deck.slideOrder.length > 0) usePrintStore.setState({ printing: true });
}

export function PrintDeck() {
  const printing = usePrintStore((s) => s.printing);
  const slideOrder = useDeckStore((s) => s.deck.slideOrder);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!printing) return;
    const done = () => usePrintStore.setState({ printing: false });
    window.addEventListener("afterprint", done, { once: true });
    const images = [...(ref.current?.querySelectorAll("img") ?? [])];
    Promise.all([document.fonts.ready, ...images.map((img) => img.decode().catch(() => {}))]).then(() => window.print());
    return () => window.removeEventListener("afterprint", done);
  }, [printing]);

  if (!printing) return null;
  return createPortal(
    <div ref={ref} className="print-deck">
      {slideOrder.map((id) => (
        <SlideRenderer key={id} slideId={id} variant="print" />
      ))}
    </div>,
    document.body,
  );
}
