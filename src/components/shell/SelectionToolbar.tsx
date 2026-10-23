"use client";

import { deleteSelection, duplicateSelection, reorderSelection } from "@/lib/canvas/actions";
import { useSelectedIds } from "@/lib/ui/useSelectedIds";

const buttonClass = "rounded px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100";

export function SelectionToolbar() {
  const count = useSelectedIds().length;
  if (count === 0) return null;

  return (
    <div className="mr-4 ml-auto flex items-center gap-1">
      <span className="mr-1 text-xs text-zinc-500 tabular-nums">{count} selected</span>
      <button type="button" className={buttonClass} title="Bring forward (⌘])" onClick={() => reorderSelection("forward")}>
        Forward
      </button>
      <button type="button" className={buttonClass} title="Send backward (⌘[)" onClick={() => reorderSelection("backward")}>
        Backward
      </button>
      <button type="button" className={buttonClass} title="Bring to front (⌘⇧])" onClick={() => reorderSelection("front")}>
        Front
      </button>
      <button type="button" className={buttonClass} title="Send to back (⌘⇧[)" onClick={() => reorderSelection("back")}>
        Back
      </button>
      <button type="button" className={buttonClass} title="Duplicate (⌘D)" onClick={duplicateSelection}>
        Duplicate
      </button>
      <button type="button" className={`${buttonClass} text-red-600`} title="Delete (⌫)" onClick={deleteSelection}>
        Delete
      </button>
    </div>
  );
}
