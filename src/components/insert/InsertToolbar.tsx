"use client";

import { ChartColumn, Circle, ImageUp, Minus, Square, Table2, Type, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { insertDefault, insertImage, type InsertKind } from "@/lib/content/insert";
import { ImagePickerButton } from "./ImagePickerButton";

const ITEMS: { kind: InsertKind; label: string; Icon: LucideIcon }[] = [
  { kind: "text", label: "Text", Icon: Type },
  { kind: "chart", label: "Chart", Icon: ChartColumn },
  { kind: "table", label: "Table", Icon: Table2 },
  { kind: "rect", label: "Rectangle", Icon: Square },
  { kind: "ellipse", label: "Ellipse", Icon: Circle },
  { kind: "line", label: "Line", Icon: Minus },
];

export function InsertToolbar() {
  return (
    <div
      role="toolbar"
      aria-label="Insert"
      className="flex h-10 shrink-0 items-center gap-0.5 border-b border-chrome-border bg-white px-3"
    >
      <span className="mr-1 text-xs font-medium tracking-wide text-zinc-500 uppercase">Insert</span>
      {ITEMS.map(({ kind, label, Icon }) => (
        <Button key={kind} onClick={() => insertDefault(kind)}>
          <Icon aria-hidden />
          {label}
        </Button>
      ))}
      <ImagePickerButton
        label="Image"
        icon={<ImageUp aria-hidden />}
        tooltip="Upload an image from your computer"
        onPicked={insertImage}
      />
    </div>
  );
}
