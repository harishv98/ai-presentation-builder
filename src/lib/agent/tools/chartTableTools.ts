import { z } from "zod";
import { ChartKindSchema } from "@/lib/deck/schema";
import { placeBox } from "../deck/placement";
import { applyCreate, applyOne, BoxArg, defineTool, done, ElementIdArg, fail, findElement, slideLabel, SlideIdArg } from "./shared";

const SeriesArg = z
  .array(z.object({ name: z.string(), data: z.array(z.number()), color: z.string().optional() }))
  .min(1)
  .describe("Each series needs exactly one number per category");

const RowsArg = z
  .array(z.array(z.string()))
  .min(1)
  .describe("Rows of cell text; the first row is the header when headerRow is true");

function seriesError(categories: string[], series: { name: string; data: number[] }[]): string | null {
  const bad = series.find((s) => s.data.length !== categories.length);
  return bad ? `Series "${bad.name}" has ${bad.data.length} values but there are ${categories.length} categories` : null;
}

function padRows(rows: string[][]): string[][] {
  const width = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => [...row, ...Array<string>(width - row.length).fill("")]);
}

const addChart = defineTool({
  name: "add_chart",
  description: "Add a chart to a slide.",
  args: z.object({
    slideId: SlideIdArg,
    kind: ChartKindSchema,
    title: z.string(),
    categories: z.array(z.string()).min(1),
    series: SeriesArg,
    showLegend: z.boolean().optional().describe("Defaults to true when there are several series"),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    box: BoxArg.optional(),
  }),
  run({ slideId, box, showLegend, ...chart }, ctx) {
    const deck = ctx.deck();
    if (!deck.slides[slideId]) return fail(`Slide ${slideId} not found`);
    const error = seriesError(chart.categories, chart.series);
    if (error) return fail(error);
    const created = applyCreate(ctx, {
      op: "add_element",
      slideId,
      element: {
        type: "chart",
        box: box ?? placeBox(deck, slideId, "body"),
        chart: { ...chart, showLegend: showLegend ?? chart.series.length > 1 },
      },
    });
    if ("error" in created) return fail(created.error);
    return done(`Added ${chart.kind} chart "${chart.title}" to ${slideLabel(deck, slideId)}`, [created.id], {
      elementId: created.id,
    });
  },
});

const updateChartData = defineTool({
  name: "update_chart_data",
  description:
    "Change a chart's data or labels. categories and series replace the existing arrays entirely. The chart type is kept.",
  args: z.object({
    elementId: ElementIdArg,
    title: z.string().optional(),
    categories: z.array(z.string()).min(1).optional(),
    series: SeriesArg.optional(),
    showLegend: z.boolean().optional(),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
  }),
  run({ elementId, ...patch }, ctx) {
    const element = findElement(ctx.deck(), elementId, "chart");
    if (typeof element === "string") return fail(element);
    if (Object.keys(patch).length === 0) return fail("Pass at least one field to change");
    const error = seriesError(patch.categories ?? element.chart.categories, patch.series ?? element.chart.series);
    if (error) return fail(error);
    const result = applyOne(ctx, { op: "update_element", id: elementId, patch: { chart: patch } });
    return result.ok ? done(`Updated chart ${elementId}`, [elementId]) : fail(result.error);
  },
});

const changeChartType = defineTool({
  name: "change_chart_type",
  description: "Switch a chart to another type. Data is kept.",
  args: z.object({ elementId: ElementIdArg, kind: ChartKindSchema }),
  run({ elementId, kind }, ctx) {
    const element = findElement(ctx.deck(), elementId, "chart");
    if (typeof element === "string") return fail(element);
    if (element.chart.kind === kind) return done(`Chart ${elementId} is already a ${kind} chart`, [elementId]);
    const result = applyOne(ctx, { op: "update_element", id: elementId, patch: { chart: { kind } } });
    return result.ok ? done(`Changed chart ${elementId} to ${kind}`, [elementId]) : fail(result.error);
  },
});

const addTable = defineTool({
  name: "add_table",
  description: "Add a table to a slide. Short rows are padded with empty cells.",
  args: z.object({
    slideId: SlideIdArg,
    rows: RowsArg,
    headerRow: z.boolean().optional().describe("Defaults to true"),
    box: BoxArg.optional(),
  }),
  run({ slideId, rows, headerRow, box }, ctx) {
    const deck = ctx.deck();
    if (!deck.slides[slideId]) return fail(`Slide ${slideId} not found`);
    const table = padRows(rows);
    if ((table[0]?.length ?? 0) === 0) return fail("A table needs at least one cell");
    const created = applyCreate(ctx, {
      op: "add_element",
      slideId,
      element: { type: "table", box: box ?? placeBox(deck, slideId, "body"), table: { rows: table, headerRow: headerRow ?? true } },
    });
    if ("error" in created) return fail(created.error);
    const size = `${table.length}x${table[0]?.length ?? 0}`;
    return done(`Added ${size} table to ${slideLabel(deck, slideId)}`, [created.id], { elementId: created.id });
  },
});

const updateTable = defineTool({
  name: "update_table",
  description: "Edit a table: replace all rows, or change individual cells, and/or toggle the header row.",
  args: z.object({
    elementId: ElementIdArg,
    rows: RowsArg.optional().describe("Replaces the whole table, header row included"),
    cells: z
      .array(z.object({ row: z.number().int().min(0).max(200), col: z.number().int().min(0).max(50), text: z.string() }))
      .optional()
      .describe("Change single cells; row 0 is the first row (the header when present)"),
    headerRow: z.boolean().optional(),
  }),
  run({ elementId, rows: newRows, cells, headerRow }, ctx) {
    const element = findElement(ctx.deck(), elementId, "table");
    if (typeof element === "string") return fail(element);
    if (!newRows && !cells && headerRow === undefined) return fail("Pass rows, cells, or headerRow");

    let rows = newRows ? padRows(newRows) : element.table.rows.map((row) => [...row]);
    if (cells) {
      rows = rows.map((row) => [...row]);
      const width = rows[0]?.length ?? 0;
      for (const cell of cells) {
        const row = rows[cell.row];
        if (!row || cell.col >= row.length) {
          return fail(`Cell (${cell.row}, ${cell.col}) is outside the table (${rows.length} rows, ${width} columns)`);
        }
        row[cell.col] = cell.text;
      }
    }
    const patch = {
      ...((newRows || cells) && { rows }),
      ...(headerRow !== undefined && { headerRow }),
    };
    const result = applyOne(ctx, { op: "update_element", id: elementId, patch: { table: patch } });
    return result.ok ? done(`Updated table ${elementId}`, [elementId]) : fail(result.error);
  },
});

export const chartTableTools = [addChart, updateChartData, changeChartType, addTable, updateTable];
