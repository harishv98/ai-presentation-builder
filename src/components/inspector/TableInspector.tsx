"use client";

import { Button } from "@/components/ui/Button";
import { editElement, editTableStructure } from "@/lib/content/actions";
import { tableSize } from "@/lib/content/tableData";
import type { ElementOf } from "@/lib/deck/schema";
import { Hint, Section } from "./fields";

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
          <Button variant="outline" onClick={() => editTableStructure(id, "add-row")}>
            Add row
          </Button>
          <Button variant="outline" disabled={size.rows <= 1} onClick={() => editTableStructure(id, "delete-row")}>
            Delete row
          </Button>
          <Button variant="outline" onClick={() => editTableStructure(id, "add-column")}>
            Add column
          </Button>
          <Button variant="outline" disabled={size.cols <= 1} onClick={() => editTableStructure(id, "delete-column")}>
            Delete column
          </Button>
        </div>
        <p className="text-xs text-zinc-500">Rows are added and removed at the bottom, columns at the right.</p>
      </Section>
      <Hint>Double-click a cell on the slide to edit it. Enter moves down, Tab moves right, and Tab in the last cell adds a row.</Hint>
    </>
  );
}
