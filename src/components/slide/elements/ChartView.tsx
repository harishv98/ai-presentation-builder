import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_PALETTE } from "@/lib/deck/constants";
import type { ChartPayload, ElementOf } from "@/lib/deck/schema";
import type { RenderVariant } from "./ElementView";

const TITLE_HEIGHT = 40;
const AXIS_TICK = { fontSize: 18, fill: "#475569" };
const LEGEND_STYLE = { fontSize: 18 };

const seriesColor = (chart: ChartPayload, i: number) =>
  chart.series[i]?.color ?? CHART_PALETTE[i % CHART_PALETTE.length]!;

export function ChartView({ element, variant }: { element: ElementOf<"chart">; variant: RenderVariant }) {
  const { chart, box } = element;
  const width = box.w;
  const height = Math.max(box.h - TITLE_HEIGHT, 40);
  const common = { id: `${element.id}-${variant}`, width, height, accessibilityLayer: false };

  return (
    <div className="pointer-events-none flex h-full w-full flex-col">
      <div className="truncate text-center text-[24px] font-semibold text-slate-800" style={{ height: TITLE_HEIGHT }}>
        {chart.title}
      </div>
      {chart.kind === "pie" ? <PieChartView chart={chart} common={common} /> : <CartesianChartView chart={chart} common={common} />}
    </div>
  );
}

type CommonProps = { id: string; width: number; height: number; accessibilityLayer: boolean };

function CartesianChartView({ chart, common }: { chart: ChartPayload; common: CommonProps }) {
  const data = chart.categories.map((category, i) => ({
    category,
    ...Object.fromEntries(chart.series.map((s) => [s.name, s.data[i] ?? 0])),
  }));
  const margin = { top: 10, right: 30, bottom: chart.xLabel ? 30 : 10, left: chart.yLabel ? 30 : 10 };

  const axes = [
    <CartesianGrid key="grid" strokeDasharray="4 4" stroke="#e2e8f0" />,
    <XAxis
      key="x"
      dataKey="category"
      tick={AXIS_TICK}
      label={chart.xLabel ? { value: chart.xLabel, position: "insideBottom", offset: -20, fontSize: 18 } : undefined}
    />,
    <YAxis
      key="y"
      tick={AXIS_TICK}
      label={chart.yLabel ? { value: chart.yLabel, angle: -90, position: "insideLeft", fontSize: 18 } : undefined}
    />,
    chart.showLegend ? <Legend key="legend" wrapperStyle={LEGEND_STYLE} verticalAlign="top" /> : null,
  ];

  switch (chart.kind) {
    case "line":
      return (
        <LineChart {...common} data={data} margin={margin}>
          {axes}
          {chart.series.map((s, i) => (
            <Line key={s.name} dataKey={s.name} stroke={seriesColor(chart, i)} strokeWidth={4} dot={{ r: 6 }} isAnimationActive={false} />
          ))}
        </LineChart>
      );
    case "area":
      return (
        <AreaChart {...common} data={data} margin={margin}>
          {axes}
          {chart.series.map((s, i) => (
            <Area
              key={s.name}
              dataKey={s.name}
              stroke={seriesColor(chart, i)}
              fill={seriesColor(chart, i)}
              fillOpacity={0.25}
              strokeWidth={3}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      );
    case "bar":
    case "stacked-bar":
      return (
        <BarChart {...common} data={data} margin={margin}>
          {axes}
          {chart.series.map((s, i) => (
            <Bar
              key={s.name}
              dataKey={s.name}
              fill={seriesColor(chart, i)}
              stackId={chart.kind === "stacked-bar" ? "stack" : undefined}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      );
    case "pie":
      return null;
  }
}

function PieChartView({ chart, common }: { chart: ChartPayload; common: CommonProps }) {
  const first = chart.series[0];
  const data = chart.categories.map((category, i) => ({
    name: category,
    value: first?.data[i] ?? 0,
    fill: CHART_PALETTE[i % CHART_PALETTE.length],
  }));
  const radius = Math.min(common.width, common.height) / 2 - 30;

  return (
    <PieChart {...common}>
      <Pie data={data} dataKey="value" nameKey="name" outerRadius={radius} label={{ fontSize: 18 }} isAnimationActive={false} />
      {chart.showLegend ? <Legend wrapperStyle={LEGEND_STYLE} /> : null}
    </PieChart>
  );
}
