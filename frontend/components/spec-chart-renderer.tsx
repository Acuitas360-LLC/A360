"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { useSizeBreakpoints } from "@/hooks/use-size-breakpoints";

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

type SpecChartRendererProps = {
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

function isLikelyDateString(value: string) {
  if (!value || value.length < 8) {
    return false;
  }

  const maybeDate = new Date(value);
  return !Number.isNaN(maybeDate.getTime());
}

function formatXLabel(raw: string, xType?: "date" | "category" | "numeric") {
  if (xType !== "date" && !isLikelyDateString(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
  }).format(parsed);
}

function formatTooltipValue(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return String(value ?? "");
  }

  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(numeric) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function SpecChartRenderer({ rows, visualizationSpec }: SpecChartRendererProps) {
  const { containerRef, ready, width, height, widthBucket } = useSizeBreakpoints({
    widthBreakpoints: [640, 920, 1240],
    heightBreakpoints: [260, 320, 400],
  });

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
      xField,
      chartRows,
      series: rawSeries,
      xType: parsed.x?.type,
      tickRotation: parsed.formatting?.tick_rotation ?? -35,
      legendPosition: parsed.formatting?.legend_position ?? "bottom",
      xTitle: parsed.formatting?.x_title ?? "",
      yLeftTitle: parsed.formatting?.y_left_title ?? "",
      yRightTitle: parsed.formatting?.y_right_title ?? "",
      intent: parsed.chart_intent || "chart",
      complexity: parsed.complexity || "single_series",
    };
  }, [parsed, rows]);

  const [activeSeriesField, setActiveSeriesField] = useState<string | null>(null);

  if (!prepared || prepared.chartRows.length === 0) {
    return null;
  }

  const resolvedActiveSeriesField =
    activeSeriesField && prepared.series.some((series) => series.field === activeSeriesField)
      ? activeSeriesField
      : (prepared.series[0]?.field as string | undefined) || null;

  const visibleSeries = prepared.series.filter((series) => {
    if (!resolvedActiveSeriesField) {
      return true;
    }

    return prepared.series.length === 1 || series.field === resolvedActiveSeriesField;
  });

  const hasRightAxis = prepared.series.some((series) => series.axis === "right");
  const legendAlign = prepared.legendPosition === "top" ? "left" : "center";
  const legendVerticalAlign = prepared.legendPosition === "top" ? "top" : "bottom";

  const primarySeries = visibleSeries[0];
  const isSingleSeries = visibleSeries.length === 1;
  const useAreaStyle = isSingleSeries && (primarySeries?.mark || "line") !== "bar";

  const gradientId = "spec-chart-gradient";
  const primaryColor = COLORS[0];
  const adaptiveInterval =
    prepared.chartRows.length > 24
      ? 2
      : prepared.chartRows.length > 14
        ? 1
        : 0;
  const adaptiveTickAngle =
    widthBucket === 0 ? -60 : prepared.chartRows.length > 14 ? -45 : prepared.tickRotation;
  const adaptiveTickGap = widthBucket === 0 ? 12 : prepared.chartRows.length > 14 ? 10 : 0;
  const adaptiveTickHeight = widthBucket === 0 ? 74 : prepared.chartRows.length > 14 ? 66 : 58;
  const adaptiveXAxisInterval = widthBucket === 0 ? Math.max(2, adaptiveInterval + 1) : adaptiveInterval;

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-sm">Spec Driven Chart</p>
          <p className="text-muted-foreground text-xs">
            Intent: {prepared.intent} | Complexity: {prepared.complexity}
          </p>
        </div>
        <div className="rounded-md border bg-muted/40 px-2 py-1 text-xs">
          X: {prepared.xField}
        </div>
      </div>

      {prepared.series.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {prepared.series.map((series, index) => {
            const field = series.field as string;
            const isActive = resolvedActiveSeriesField === field;
            return (
              <Button
                className="h-7"
                key={`spec-series-toggle-${field}`}
                onClick={() => setActiveSeriesField(field)}
                size="sm"
                style={
                  isActive
                    ? {
                        backgroundColor: COLORS[index % COLORS.length],
                        borderColor: COLORS[index % COLORS.length],
                        color: "white",
                      }
                    : undefined
                }
                variant={isActive ? "default" : "outline"}
              >
                {series.name || field}
              </Button>
            );
          })}
        </div>
      )}

      <div className="h-80 w-full min-w-0" ref={containerRef}>
        {ready && width > 0 && height > 0 ? (
          <ResponsiveContainer height={height} minHeight={320} minWidth={0} width={width}>
            {useAreaStyle && primarySeries?.field ? (
              <AreaChart
                data={prepared.chartRows}
                margin={{ top: 8, right: 12, bottom: 52, left: 8 }}
              >
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={primaryColor} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={primaryColor} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                angle={adaptiveTickAngle}
                axisLine={false}
                dataKey="x"
                height={adaptiveTickHeight}
                interval={adaptiveXAxisInterval}
                minTickGap={adaptiveTickGap}
                textAnchor="end"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickFormatter={(value) => formatXLabel(String(value), prepared.xType)}
                tickLine={false}
                tickMargin={8}
                label={
                  prepared.xTitle
                    ? {
                        value: prepared.xTitle,
                        position: "insideBottom",
                        offset: 24,
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 10,
                      }
                    : undefined
                }
              />
              <YAxis
                axisLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickFormatter={(value) => formatTooltipValue(value)}
                tickLine={false}
                tickMargin={8}
                label={
                  prepared.yLeftTitle
                    ? {
                        value: prepared.yLeftTitle,
                        angle: -90,
                        position: "insideLeft",
                        offset: 0,
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 10,
                      }
                    : undefined
                }
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
                formatter={(value) => [formatTooltipValue(value), primarySeries.name || primarySeries.field || "value"]}
                labelFormatter={(value) => formatXLabel(String(value), prepared.xType)}
              />
              <Area
                dataKey={primarySeries.field}
                fill={`url(#${gradientId})`}
                fillOpacity={1}
                stroke={primaryColor}
                strokeWidth={2}
                type="monotone"
              />
              </AreaChart>
            ) : (
              <ComposedChart
                data={prepared.chartRows}
                margin={{ top: 8, right: 12, bottom: 52, left: 8 }}
              >
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                angle={adaptiveTickAngle}
                axisLine={false}
                dataKey="x"
                height={adaptiveTickHeight}
                interval={adaptiveXAxisInterval}
                minTickGap={adaptiveTickGap}
                textAnchor="end"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickFormatter={(value) => formatXLabel(String(value), prepared.xType)}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                axisLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickFormatter={(value) => formatTooltipValue(value)}
                tickLine={false}
                tickMargin={8}
                yAxisId="left"
                label={
                  prepared.yLeftTitle
                    ? {
                        value: prepared.yLeftTitle,
                        angle: -90,
                        position: "insideLeft",
                        offset: 0,
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 10,
                      }
                    : undefined
                }
              />
              {hasRightAxis && (
                <YAxis
                  axisLine={false}
                  orientation="right"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  tickFormatter={(value) => formatTooltipValue(value)}
                  tickLine={false}
                  tickMargin={8}
                  yAxisId="right"
                  label={
                    prepared.yRightTitle
                      ? {
                          value: prepared.yRightTitle,
                          angle: 90,
                          position: "insideRight",
                          offset: 0,
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 10,
                        }
                      : undefined
                  }
                />
              )}
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
                formatter={(value, name) => [formatTooltipValue(value), String(name)]}
                labelFormatter={(value) => formatXLabel(String(value), prepared.xType)}
              />
              <Legend align={legendAlign} verticalAlign={legendVerticalAlign} />
              {visibleSeries.map((series, index) => {
                const field = series.field as string;
                const color = COLORS[index % COLORS.length];
                const yAxisId = series.axis === "right" ? "right" : "left";
                const name = series.name || field;
                const mark = series.mark || "line";

                if (mark === "bar") {
                  return (
                    <Bar
                      dataKey={field}
                      fill={color}
                      key={`bar-${field}`}
                      name={name}
                      radius={[4, 4, 0, 0]}
                      yAxisId={yAxisId}
                    />
                  );
                }

                if (mark === "area") {
                  return (
                    <Area
                      dataKey={field}
                      fill={color}
                      fillOpacity={0.16}
                      key={`area-${field}`}
                      name={name}
                      stroke={color}
                      strokeWidth={2}
                      type="monotone"
                      yAxisId={yAxisId}
                    />
                  );
                }

                return (
                  <Line
                    dataKey={field}
                    dot={false}
                    key={`line-${field}`}
                    name={name}
                    stroke={color}
                    strokeWidth={2}
                    type="monotone"
                    yAxisId={yAxisId}
                  />
                );
              })}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
            Preparing chart...
          </div>
        )}
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-muted-foreground">
          Rows plotted: <span className="font-medium text-foreground">{prepared.chartRows.length}</span>
        </div>
        <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-muted-foreground">
          Series: <span className="font-medium text-foreground">{prepared.series.length}</span>
        </div>
        <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-muted-foreground">
          X Type: <span className="font-medium text-foreground">{prepared.xType || "auto"}</span>
        </div>
      </div>
    </div>
  );
}
