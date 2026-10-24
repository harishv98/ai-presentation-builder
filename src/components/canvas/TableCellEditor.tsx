"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { commitCell, editTableStructure } from "@/lib/content/actions";
import { tableSize } from "@/lib/content/tableData";
import { ARTBOARD_WIDTH } from "@/lib/deck/constants";
import type { Box } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore, type CellEditing } from "@/lib/ui/store";

const EDITOR_Z = 5000;

export function TableCellEditor({ editing }: { editing: CellEditing }) {
  const { elementId, row, col, txnId } = editing;
  const element = useDeckStore((s) => s.deck.elements[elementId]);
  const table = element?.type === "table" ? element.table : null;
  const [initial] = useState(() => table?.rows[row]?.[col] ?? "");
  const [rect, setRect] = useState<Box | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useLayoutEffect(() => {
    const stage = ref.current?.parentElement;
    const cell = stage?.querySelector(`[data-element-id="${elementId}"] [data-cell="${row}:${col}"]`);
    if (!stage || !cell) return;
    const s = stage.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    const scale = s.width / ARTBOARD_WIDTH;
    setRect({ x: (c.left - s.left) / scale, y: (c.top - s.top) / scale, w: c.width / scale, h: c.height / scale });
  }, [elementId, row, col, element]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, []);

  if (!table) return null;
  const size = tableSize(table.rows);
  const header = table.headerRow && row === 0;

  function commit() {
    if (committed.current || !ref.current) return;
    committed.current = true;
    commitCell(elementId, row, col, ref.current.value, txnId);
  }

  function moveTo(nextRow: number, nextCol: number) {
    commit();
    useUiStore.getState().setEditing({ kind: "cell", elementId, row: nextRow, col: nextCol, txnId });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (row + 1 < size.rows) moveTo(row + 1, col);
      else event.currentTarget.blur();
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    const index = row * size.cols + col + (event.shiftKey ? -1 : 1);
    if (index < 0) return;
    if (index >= size.rows * size.cols) {
      commit();
      editTableStructure(elementId, "add-row", txnId);
      moveTo(size.rows, 0);
      return;
    }
    moveTo(Math.floor(index / size.cols), index % size.cols);
  }

  return (
    <input
      ref={ref}
      data-editor
      defaultValue={initial}
      aria-label={`Row ${row + 1}, column ${col + 1}`}
      className={`absolute border-0 px-4 py-2 text-[22px] outline-solid outline-accent select-text ${
        header ? "bg-indigo-50 font-semibold text-slate-900" : "bg-white text-slate-700"
      }`}
      style={{
        zIndex: EDITOR_Z,
        outlineWidth: "calc(2px / var(--artboard-scale))",
        ...(rect ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : { opacity: 0 }),
      }}
      onKeyDown={onKeyDown}
      onBlur={() => {
        commit();
        const ui = useUiStore.getState();
        if (ui.editing === editing) ui.setEditing(null);
      }}
    />
  );
}
