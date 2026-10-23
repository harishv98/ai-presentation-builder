import type { ElementOf } from "@/lib/deck/schema";

export function TableView({ element }: { element: ElementOf<"table"> }) {
  const { rows, headerRow } = element.table;
  return (
    <table className="h-full w-full table-fixed border-collapse text-[22px] text-slate-700">
      <tbody>
        {rows.map((row, r) => {
          const isHeader = headerRow && r === 0;
          return (
            <tr key={r} className={isHeader ? "bg-indigo-50 font-semibold text-slate-900" : undefined}>
              {row.map((cell, c) => (
                <td key={c} className="truncate border border-slate-200 px-4 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
