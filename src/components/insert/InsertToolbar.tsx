"use client";

import { insertDefault, insertImage, type InsertKind } from "@/lib/content/insert";
import { ImagePickerButton } from "./ImagePickerButton";

const buttonClass = "rounded px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100";

const ITEMS: { kind: InsertKind; label: string }[] = [
  { kind: "text", label: "Text" },
  { kind: "chart", label: "Chart" },
  { kind: "table", label: "Table" },
  { kind: "rect", label: "Rectangle" },
  { kind: "ellipse", label: "Ellipse" },
  { kind: "line", label: "Line" },
];

export function InsertToolbar() {
  return (
    <div
      role="toolbar"
      aria-label="Insert"
      className="flex h-10 shrink-0 items-center gap-0.5 border-b border-chrome-border bg-white px-3"
    >
      <span className="mr-1 text-xs font-medium tracking-wide text-zinc-500 uppercase">Insert</span>
      {ITEMS.map((item) => (
        <button key={item.kind} type="button" className={buttonClass} onClick={() => insertDefault(item.kind)}>
          {item.label}
        </button>
      ))}
      <ImagePickerButton
        label="Image"
        title="Upload an image from your computer"
        className={buttonClass}
        onPicked={insertImage}
      />
    </div>
  );
}
