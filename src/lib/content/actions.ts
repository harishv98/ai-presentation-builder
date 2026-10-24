import { ARTBOARD_HEIGHT } from "@/lib/deck/constants";
import type { ElementPatch } from "@/lib/deck/ops";
import type { ElementOf, ElementType } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore } from "@/lib/ui/store";
import type { PickedImage } from "./image";
import { deleteColumn, deleteRow, insertColumn, insertRow, setCell, tableSize } from "./tableData";

export type TableEdit = "add-row" | "delete-row" | "add-column" | "delete-column";

const TABLE_EDIT_LABEL: Record<TableEdit, string> = {
  "add-row": "Add table row",
  "delete-row": "Delete table row",
  "add-column": "Add table column",
  "delete-column": "Delete table column",
};

export function getElement<T extends ElementType>(id: string, type: T): ElementOf<T> | null {
  const element = useDeckStore.getState().deck.elements[id];
  return element?.type === type ? (element as ElementOf<T>) : null;
}

export function editElement(id: string, patch: ElementPatch, label: string, txnId?: string): void {
  useDeckStore
    .getState()
    .applyOps([{ op: "update_element", id, patch }], { source: "user", label, ...(txnId && { txnId }) });
}

export function startEditing(
  id: string,
  at: { caret?: { x: number; y: number }; cell?: { row: number; col: number } } = {},
): void {
  const element = useDeckStore.getState().deck.elements[id];
  if (!element) return;
  const ui = useUiStore.getState();
  ui.setSelection([id]);
  switch (element.type) {
    case "text":
      ui.setEditing({ kind: "text", elementId: id, caret: at.caret ?? "all" });
      return;
    case "table": {
      const cell = at.cell ?? { row: 0, col: 0 };
      ui.setEditing({ kind: "cell", elementId: id, row: cell.row, col: cell.col, txnId: crypto.randomUUID() });
      return;
    }
    case "chart":
    case "image":
      ui.setRightPanel("format");
  }
}

const sameLines = (a: string[], b: string[]) => a.length === b.length && a.every((line, i) => line === b[i]);

export function commitText(id: string, content: string[], height: number): void {
  const element = getElement(id, "text");
  if (!element || sameLines(content, element.text.content)) return;
  const grow = height > element.box.h ? { box: { h: Math.min(Math.ceil(height), ARTBOARD_HEIGHT) } } : {};
  editElement(id, { text: { content }, ...grow }, "Edit text");
}

export function commitCell(id: string, row: number, col: number, text: string, txnId: string): void {
  const element = getElement(id, "table");
  const current = element?.table.rows[row]?.[col];
  if (!element || current === undefined || current === text) return;
  editElement(id, { table: { rows: setCell(element.table.rows, row, col, text) } }, "Edit table", txnId);
}

export function editTableStructure(id: string, edit: TableEdit, txnId?: string): void {
  const element = getElement(id, "table");
  if (!element) return;
  const { rows } = element.table;
  const size = tableSize(rows);
  const rowHeight = element.box.h / Math.max(1, size.rows);
  const height = (delta: number) => ({ h: Math.min(Math.round(element.box.h + delta), ARTBOARD_HEIGHT) });

  // ponytail: rows change at the bottom and columns at the right; add a cell cursor if mid-table inserts are needed
  let patch: ElementPatch;
  switch (edit) {
    case "add-row":
      patch = { table: { rows: insertRow(rows, size.rows) }, box: height(rowHeight) };
      break;
    case "delete-row":
      if (size.rows <= 1) return;
      patch = { table: { rows: deleteRow(rows, size.rows - 1) }, box: height(-rowHeight) };
      break;
    case "add-column":
      patch = { table: { rows: insertColumn(rows, size.cols) } };
      break;
    case "delete-column":
      if (size.cols <= 1) return;
      patch = { table: { rows: deleteColumn(rows, size.cols - 1) } };
      break;
  }
  editElement(id, patch, TABLE_EDIT_LABEL[edit], txnId);
}

export function replaceImage(id: string, image: PickedImage): void {
  if (!getElement(id, "image")) return;
  editElement(id, { image: { src: image.src, alt: image.alt } }, "Replace image");
}
