import type { CSSProperties, ReactNode } from "react";
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/deck/constants";

export function ScaledArtboard({ scale, children }: { scale: number; children: ReactNode }) {
  return (
    <div className="relative" style={{ width: ARTBOARD_WIDTH * scale, height: ARTBOARD_HEIGHT * scale }}>
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={
          {
            width: ARTBOARD_WIDTH,
            height: ARTBOARD_HEIGHT,
            transform: `scale(${scale})`,
            "--artboard-scale": scale,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}
