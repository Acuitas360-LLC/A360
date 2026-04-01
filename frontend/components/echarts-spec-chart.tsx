"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
});

type SpecSeries = {
  name?: string;
  field?: string;
  mark?: "line" | "area" | "bar" | "scatter";
  axis?: "left" | "right";
  stack?: boolean;
};

type VisualizationSpec = {
  chart_required?: boolean;
  chart_intent?: string;
  complexity?: string;
  x?: {
    field?: string;
    type?: "date" | "category" | "numeric";
    sort?: "asc" | "desc" | "none";
  };
  series?: SpecSeries[];
  transforms?: {
    top_n?: number | null;
  };
  formatting?: {
    tick_rotation?: number;
    x_title?: string;
    y_left_title?: string;
    y_right_title?: string;
    legend_position?: "top" | "bottom";
  };
  annotations?: Array<{
    type?: "hline";
    axis?: "left" | "right";
    value?: number;
    label?: string;
  }>;
};

type EChartsSpecChartProps = {
  rows: Array<Record<string, unknown>>;
  visualizationSpec: string;
};

const COLORS = ["#2a9d8f", "#e76f51", "#457b9d", "#f4a261", "#7c3aed"];

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.trim().replaceAll(",", "").replace("%", "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toLabel(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

export function EChartsSpecChart({ rows, visualizationSpec }: EChartsSpecChartProps) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(visualizationSpec) as VisualizationSpec;
    } catch {
      return null;
    }
  }, [visualizationSpec]);

  const prepared = useMemo(() => {
    if (!parsed?.chart_required || !rows.length) {
      return null;
    }

    const xField = parsed.x?.field;
    const rawSeries = (parsed.series || []).filter(
      (series) => typeof series.field === "string" && series.field.length > 0
    );

    if (!xField || rawSeries.length === 0) {
      return null;
    }

    let chartRows = rows
      .map((row, index) => {
        const out: Record<string, unknown> = {
          id: index,
          x: toLabel(row[xField]),
        };

        for (const series of rawSeries) {
          const field = series.field as string;
          out[field] = toNumber(row[field]);
        }

        return out;
      })
      .filter((row) => String(row.x ?? "").length > 0);

    const sortMode = parsed.x?.sort;
    if (sortMode === "asc" || sortMode === "desc") {
      chartRows = [...chartRows].sort((a, b) =>
        sortMode === "asc"
          ? String(a.x).localeCompare(String(b.x))
          : String(b.x).localeCompare(String(a.x))
      );
    }

    const topN = parsed.transforms?.top_n;
    if (typeof topN === "number" && topN > 0) {
      chartRows = chartRows.slice(0, topN);
    }

    return {
      chartRows,
      series: rawSeries,
      tickRotation: parsed.formatting?.tick_rotation ?? -35,
      legendPosition: parsed.formatting?.legend_position ?? "bottom",
      xTitle: parsed.formatting?.x_title ?? "",
      yLeftTitle: parsed.formatting?.y_left_title ?? "",
      yRightTitle: parsed.formatting?.y_right_title ?? "",
      annotations: parsed.annotations ?? [],
    };
  }, [parsed, rows]);

  const option = useMemo(() => {
    if (!prepared) {
      return null;
    }

    const categories = prepared.chartRows.map((row) => String(row.x));
    const hasRightAxis = prepared.series.some((series) => series.axis === "right");

    const echartsSeries = prepared.series.map((series, index) => {
      const field = series.field as string;
      const color = COLORS[index % COLORS.length];
      const mark = series.mark || "line";
      const type = mark === "area" ? "line" : mark;
      const data = prepared.chartRows.map((row) => toNumber(row[field]));

      const base: Record<string, unknown> = {
        name: series.name || field,
        type,
        data,
        itemStyle: { color },
        yAxisIndex: series.axis === "right" ? 1 : 0,
      };

      if (mark === "area") {
        base.areaStyle = { opacity: 0.2 };
      }

      if (series.stack) {
        base.stack = "stack";
      }

      if (mark === "line") {
        base.symbol = "circle";
        base.symbolSize = 6;
      }

      const annotationLines = prepared.annotations
        .filter((annotation) => annotation.type === "hline")
        .filter((annotation) =>
          (annotation.axis || "left") === "right"
            ? base.yAxisIndex === 1
            : base.yAxisIndex === 0
        )
        .map((annotation) => ({
          yAxis: annotation.value,
          label: {
            formatter: annotation.label || "",
          },
          lineStyle: {
            type: "dashed",
            width: 2,
          },
        }));

      if (annotationLines.length > 0) {
        base.markLine = { data: annotationLines };
      }

      return base;
    });

    const legendTop = prepared.legendPosition === "top";

    return {
      color: COLORS,
      tooltip: { trigger: "axis" },
      legend: {
        data: echartsSeries.map((series) => series.name),
        top: legendTop ? 0 : undefined,
        bottom: legendTop ? undefined : 0,
      },
      grid: {
        left: 48,
        right: hasRightAxis ? 48 : 32,
        top: legendTop ? 36 : 16,
        bottom: legendTop ? 32 : 56,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: { rotate: prepared.tickRotation, fontSize: 10 },
        name: prepared.xTitle || undefined,
        nameLocation: "middle",
        nameGap: 28,
      },
      yAxis: hasRightAxis
        ? [
            {
              type: "value",
              axisLabel: { fontSize: 10 },
              name: prepared.yLeftTitle || undefined,
              nameLocation: "middle",
              nameGap: 42,
            },
            {
              type: "value",
              axisLabel: { fontSize: 10 },
              name: prepared.yRightTitle || undefined,
              nameLocation: "middle",
              nameGap: 42,
            },
          ]
        : [
            {
              type: "value",
              axisLabel: { fontSize: 10 },
              name: prepared.yLeftTitle || undefined,
              nameLocation: "middle",
              nameGap: 42,
            },
          ],
      series: echartsSeries,
    };
  }, [prepared]);

  if (!option) {
    return null;
  }

  const Chart = ReactECharts as any;

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="h-80 w-full">
        <Chart option={option} style={{ height: "100%", width: "100%" }} />
      </div>
    </div>
  );
}
