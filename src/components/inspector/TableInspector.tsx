"use client";

import { editElement, editTableStructure } from "@/lib/content/actions";
import { tableSize } from "@/lib/content/tableData";
import type { ElementOf } from "@/lib/deck/schema";
import { Hint, Section, smallButtonClass } from "./fields";

export function TableInspector({ element }: { element: ElementOf<"table"> }) {
  const { id, table } = element;
  const size = tableSize(table.rows);

  return (
    <>
      <Section title="Table">
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="accent-accent"
            checked={table.headerRow}
            onChange={(event) => editElement(id, { table: { headerRow: event.target.checked } }, "Format table")}
          />
          Header row
        </label>
        <p className="text-xs text-zinc-500 tabular-nums">
          {size.rows} {size.rows === 1 ? "row" : "rows"} × {size.cols} {size.cols === 1 ? "column" : "columns"}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={smallButtonClass} onClick={() => editTableStructure(id, "add-row")}>
            Add row
          </button>
          <button
            type="button"
            className={smallButtonClass}
            disabled={size.rows <= 1}
            onClick={() => editTableStructure(id, "delete-row")}
          >
            Delete row
          </button>
          <button type="button" className={smallButtonClass} onClick={() => editTableStructure(id, "add-column")}>
            Add column
          </button>
          <button
            type="button"
            className={smallButtonClass}
            disabled={size.cols <= 1}
            onClick={() => editTableStructure(id, "delete-column")}
          >
            Delete column
          </button>
        </div>
        <p className="text-xs text-zinc-500">Rows are added and removed at the bottom, columns at the right.</p>
      </Section>
      <Hint>Double-click a cell on the slide to edit it. Enter moves down, Tab moves right, and Tab in the last cell adds a row.</Hint>
    </>
  );
}
