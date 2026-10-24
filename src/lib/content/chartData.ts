import type { ChartPayload } from "@/lib/deck/schema";

export type ChartData = Pick<ChartPayload, "categories" | "series">;
type Series = ChartPayload["series"][number];

const mapSeries = (chart: ChartData, index: number, fn: (series: Series) => Series): ChartData => ({
  categories: chart.categories,
  series: chart.series.map((s, j) => (j === index ? fn(s) : s)),
});

export function addCategory(chart: ChartData): ChartData {
  return {
    categories: [...chart.categories, `Item ${chart.categories.length + 1}`],
    series: chart.series.map((s) => ({ ...s, data: [...s.data, 0] })),
  };
}

export function removeCategory(chart: ChartData, index: number): ChartData {
  if (chart.categories.length <= 1) return chart;
  return {
    categories: chart.categories.filter((_, i) => i !== index),
    series: chart.series.map((s) => ({ ...s, data: s.data.filter((_, i) => i !== index) })),
  };
}

export function addSeries(chart: ChartData): ChartData {
  return {
    categories: chart.categories,
    series: [...chart.series, { name: `Series ${chart.series.length + 1}`, data: chart.categories.map(() => 0) }],
  };
}

export function removeSeries(chart: ChartData, index: number): ChartData {
  if (chart.series.length <= 1) return chart;
  return { categories: chart.categories, series: chart.series.filter((_, j) => j !== index) };
}

export function setCategory(chart: ChartData, index: number, name: string): ChartData {
  return { categories: chart.categories.map((c, i) => (i === index ? name : c)), series: chart.series };
}

export function setSeriesName(chart: ChartData, index: number, name: string): ChartData {
  return mapSeries(chart, index, (s) => ({ ...s, name }));
}

export function setSeriesColor(chart: ChartData, index: number, color: string): ChartData {
  return mapSeries(chart, index, (s) => ({ ...s, color }));
}

export function setValue(chart: ChartData, seriesIndex: number, categoryIndex: number, value: number): ChartData {
  return mapSeries(chart, seriesIndex, (s) => ({
    ...s,
    data: chart.categories.map((_, i) => (i === categoryIndex ? value : (s.data[i] ?? 0))),
  }));
}
