"use client";

import type { CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { unionBox } from "@/lib/canvas/geometry";
import { HANDLES, type Handle } from "@/lib/canvas/resize";
import type { Guide } from "@/lib/canvas/snap";
import type { Box } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";
import { useSelectedIds } from "@/lib/ui/useSelectedIds";

const OVERLAY_Z = 10000;
const px = (n: number) => `calc(${n}px / var(--artboard-scale))`;

const HANDLE_ANCHOR: Record<Handle, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

const boxStyle = (b: Box): CSSProperties => ({ left: b.x, top: b.y, width: b.w, height: b.h });

export function SelectionOverlay() {
  const selectedIds = useSelectedIds();
  const preview = useUiStore((s) => s.dragPreview);
  const marquee = useUiStore((s) => s.marquee);
  const editing = useUiStore((s) => s.editing !== null);
  const deckBoxes = useDeckStore(useShallow((s) => selectedIds.map((id) => s.deck.elements[id]?.box)));
  const shown = selectedIds.flatMap((id, i) => {
    const box = preview?.boxes[id] ?? deckBoxes[i];
    return box ? [{ id, box }] : [];
  });
  const boxes = shown.map((s) => s.box);

  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: OVERLAY_Z }}>
      {shown.map(({ id, box }) => (
        <div
          key={id}
          className="absolute outline outline-accent"
          style={{ ...boxStyle(box), outlineWidth: px(1.5) }}
        />
      ))}
      {boxes.length > 1 && (
        <div
          className="absolute border-dashed border-accent/70"
          style={{ ...boxStyle(unionBox(boxes)), borderWidth: px(1) }}
        />
      )}
      {boxes.length === 1 && !editing && HANDLES.map((handle) => <ResizeHandle key={handle} handle={handle} box={boxes[0]!} />)}
      {preview?.guides.map((guide) => <GuideLine key={`${guide.axis}${guide.at}`} guide={guide} />)}
      {marquee && (
        <div className="absolute border-accent bg-accent/10" style={{ ...boxStyle(marquee), borderWidth: px(1) }} />
      )}
    </div>
  );
}

function ResizeHandle({ handle, box }: { handle: Handle; box: Box }) {
  const [fx, fy] = HANDLE_ANCHOR[handle];
  return (
    <div
      data-handle={handle}
      className="pointer-events-auto absolute rounded-[2px] border-accent bg-white"
      style={{
        left: box.x + box.w * fx,
        top: box.y + box.h * fy,
        width: px(10),
        height: px(10),
        borderWidth: px(1.5),
        translate: "-50% -50%",
        cursor: HANDLE_CURSOR[handle],
      }}
    />
  );
}

function GuideLine({ guide }: { guide: Guide }) {
  const style: CSSProperties =
    guide.axis === "x"
      ? { left: guide.at, top: guide.from, width: px(1), height: guide.to - guide.from, translate: "-50% 0" }
      : { left: guide.from, top: guide.at, width: guide.to - guide.from, height: px(1), translate: "0 -50%" };
  return <div className="absolute bg-pink-500" style={style} />;
}
