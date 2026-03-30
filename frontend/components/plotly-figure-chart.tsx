"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
});

type PlotlyFigure = {
  data?: unknown[];
  layout?: Record<string, unknown>;
  frames?: unknown[];
  config?: Record<string, unknown>;
};

type PlotlyFigureChartProps = {
  figure?: PlotlyFigure;
  mode?: "original" | "normalized";
};

function isTimestampLike(value: unknown): boolean {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return false;
  }

  // Rough millisecond epoch range from year ~2001 to ~2286.
  return value >= 1_000_000_000_000 && value <= 9_999_999_999_999;
}

function hasTimestampLikeX(data: unknown[] | undefined): boolean {
  if (!Array.isArray(data)) {
    return false;
  }

  for (const trace of data as Array<Record<string, unknown>>) {
    const x = trace?.x;
    if (!Array.isArray(x) || x.length === 0) {
      continue;
    }

    const sample = x.slice(0, Math.min(x.length, 5));
    if (sample.some((value) => isTimestampLike(value))) {
      return true;
    }
  }

  return false;
}

export function PlotlyFigureChart({
  figure,
  mode = "original",
}: PlotlyFigureChartProps) {
  if (!figure?.data?.length) {
    return null;
  }

  const isNormalized = mode === "normalized";
  const forceDateAxis = hasTimestampLikeX(figure.data);

  const layout = useMemo(
    () => ({
      autosize: true,
      margin: { l: 24, r: 24, t: 32, b: 48 },
      ...(figure.layout ?? {}),
      ...(forceDateAxis
        ? {
            xaxis: {
              ...(typeof (figure.layout as any)?.xaxis === "object"
                ? (figure.layout as any).xaxis
                : {}),
              type: "date",
            },
          }
        : {}),
      ...(isNormalized
        ? {
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: {
              color: "hsl(var(--foreground))",
              family: "var(--font-geist-sans)",
            },
            legend: {
              ...(typeof (figure.layout as any)?.legend === "object"
                ? (figure.layout as any).legend
                : {}),
              orientation: "h",
              y: -0.2,
            },
          }
        : {}),
    }),
    [figure.layout, forceDateAxis, isNormalized]
  );

  const config = useMemo(
    () => ({
      displaylogo: false,
      responsive: false,
      ...(figure.config ?? {}),
    }),
    [figure.config]
  );

  const PlotComponent = Plot as any;

  return (
    <div className="rounded-md border p-3">
      <div className="h-80 w-full">
        <PlotComponent
          config={config}
          data={figure.data}
          frames={figure.frames}
          layout={layout}
          style={{ height: "100%", width: "100%" }}
        />
      </div>
    </div>
  );
}
