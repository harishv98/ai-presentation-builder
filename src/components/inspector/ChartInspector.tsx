"use client";

import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { editElement } from "@/lib/content/actions";
import {
  addCategory,
  addSeries,
  removeCategory,
  removeSeries,
  setCategory,
  setSeriesColor,
  setSeriesName,
  setValue,
} from "@/lib/content/chartData";
import { CHART_PALETTE } from "@/lib/deck/constants";
import type { ChartKind, ChartPayload, ElementOf } from "@/lib/deck/schema";
import { ColorInput, Field, NumberInput, Section, Segmented, TextInput } from "./fields";

const KINDS: { value: ChartKind; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "pie", label: "Pie" },
  { value: "area", label: "Area" },
  { value: "stacked-bar", label: "Stacked" },
];

const cellClass =
  "w-20 rounded border border-chrome-border px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-accent";

type ChartChange = (patch: Partial<ChartPayload>, txnId?: string) => void;

export function ChartInspector({ element }: { element: ElementOf<"chart"> }) {
  const { id, chart } = element;
  const edit: ChartChange = (patch, txnId) => editElement(id, { chart: patch }, "Edit chart", txnId);
  const pie = chart.kind === "pie";

  return (
    <>
      <Section title="Chart">
        <Field label="Title">
          <TextInput ariaLabel="Chart title" value={chart.title} onChange={(title, txnId) => edit({ title }, txnId)} />
        </Field>
        <Field label="Type">
          <Segmented ariaLabel="Chart type" value={chart.kind} options={KINDS} onChange={(kind) => edit({ kind })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="accent-accent"
            checked={chart.showLegend}
            onChange={(event) => edit({ showLegend: event.target.checked })}
          />
          Show legend
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X axis label">
            <TextInput
              ariaLabel="X axis label"
              value={chart.xLabel ?? ""}
              disabled={pie}
              onChange={(xLabel, txnId) => edit({ xLabel }, txnId)}
            />
          </Field>
          <Field label="Y axis label">
            <TextInput
              ariaLabel="Y axis label"
              value={chart.yLabel ?? ""}
              disabled={pie}
              onChange={(yLabel, txnId) => edit({ yLabel }, txnId)}
            />
          </Field>
        </div>
        {pie && (
          <p className="text-xs text-zinc-500">
            Pie charts show only the first series and no axes. The other series and the axis labels are kept for when you
            switch back.
          </p>
        )}
      </Section>
      <Section title="Data">
        <DataGrid chart={chart} onChange={edit} />
      </Section>
    </>
  );
}

function DataGrid({ chart, onChange }: { chart: ChartPayload; onChange: ChartChange }) {
  const { categories, series } = chart;
  const seriesLabel = (j: number) => series[j]?.name || `Series ${j + 1}`;
  const categoryLabel = (i: number) => categories[i] || `row ${i + 1}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="text-left font-medium text-zinc-500">Category</th>
              {series.map((s, j) => (
                <th key={j} className="font-normal">
                  <div className="flex items-center gap-1">
                    <ColorInput
                      ariaLabel={`${seriesLabel(j)} color`}
                      className="h-6 w-7"
                      value={s.color ?? CHART_PALETTE[j % CHART_PALETTE.length]!}
                      onChange={(color, txnId) => onChange(setSeriesColor(chart, j, color), txnId)}
                    />
                    <TextInput
                      ariaLabel={`Series ${j + 1} name`}
                      className={cellClass}
                      value={s.name}
                      onChange={(name, txnId) => onChange(setSeriesName(chart, j, name), txnId)}
                    />
                    <RemoveButton
                      label={`Remove ${seriesLabel(j)}`}
                      disabled={series.length <= 1}
                      onClick={() => onChange(removeSeries(chart, j))}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((category, i) => (
              <tr key={i}>
                <td>
                  <div className="flex items-center gap-1">
                    <RemoveButton
                      label={`Remove ${categoryLabel(i)}`}
                      disabled={categories.length <= 1}
                      onClick={() => onChange(removeCategory(chart, i))}
                    />
                    <TextInput
                      ariaLabel={`Category ${i + 1}`}
                      className={cellClass}
                      value={category}
                      onChange={(name, txnId) => onChange(setCategory(chart, i, name), txnId)}
                    />
                  </div>
                </td>
                {series.map((s, j) => (
                  <td key={j}>
                    <NumberInput
                      ariaLabel={`${seriesLabel(j)}, ${categoryLabel(i)}`}
                      className={cellClass}
                      value={s.data[i] ?? 0}
                      onChange={(value, txnId) => onChange(setValue(chart, j, i, value), txnId)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => onChange(addCategory(chart))}>
          + Category
        </Button>
        <Button variant="outline" onClick={() => onChange(addSeries(chart))}>
          + Series
        </Button>
      </div>
    </div>
  );
}

function RemoveButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="rounded px-1 text-zinc-400 transition-colors outline-none hover:text-red-600 focus-visible:ring-2 focus-visible:ring-accent/40 disabled:invisible"
      >
        ×
      </button>
    </Tooltip>
  );
}
