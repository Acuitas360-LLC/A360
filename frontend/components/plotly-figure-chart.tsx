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

function getTitleText(layout: Record<string, unknown> | undefined): string {
  if (!layout) {
    return "";
  }

  const title = layout.title;
  if (typeof title === "string") {
    return title;
  }

  if (title && typeof title === "object" && typeof (title as { text?: unknown }).text === "string") {
    return (title as { text: string }).text;
  }

  return "";
}

function getLegendRowsEstimate(traceCount: number, avgLegendLabelLength: number): number {
  if (traceCount <= 1) {
    return 1;
  }

  if (traceCount <= 3 && avgLegendLabelLength <= 18) {
    return 1;
  }

  if (traceCount <= 6 && avgLegendLabelLength <= 14) {
    return 2;
  }

  return 3;
}

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
  const preparedFigure = useMemo(() => {
    if (!figure?.data?.length) {
      return null;
    }

    // Plotly mutates input objects during interactions. Clone to keep React state immutable.
    const clonedData = (figure.data as Array<Record<string, unknown>>).map((trace) => {
      const nextTrace: Record<string, unknown> = { ...trace };
      const hovertemplate = nextTrace.hovertemplate;

      // Drop malformed templates that trigger repeated console warnings on hover.
      if (
        typeof hovertemplate === "string" &&
        (hovertemplate.includes("{{") || hovertemplate.includes("}}"))
      ) {
        delete nextTrace.hovertemplate;
      }

      return nextTrace;
    });

    return {
      data: clonedData,
      layout:
        figure.layout && typeof figure.layout === "object"
          ? { ...figure.layout }
          : undefined,
      frames: Array.isArray(figure.frames) ? [...figure.frames] : figure.frames,
      config:
        figure.config && typeof figure.config === "object"
          ? { ...figure.config }
          : undefined,
    } as PlotlyFigure;
  }, [figure]);

  if (!preparedFigure?.data?.length) {
    return (
      <div className="rounded-xl border border-amber-300/60 bg-amber-50/40 p-3 text-xs text-amber-900">
        Plotly chart data is unavailable for this response.
      </div>
    );
  }

  const isNormalized = mode === "normalized";
  const forceDateAxis = hasTimestampLikeX(preparedFigure.data);
  const traceCount = preparedFigure.data.length;

  const titleText = getTitleText(
    preparedFigure.layout as Record<string, unknown> | undefined
  );
  const titleLineEstimate = Math.max(1, Math.ceil(titleText.length / 70));

  const avgLegendLabelLength = Math.round(
    (preparedFigure.data as Array<Record<string, unknown>>).reduce((sum: number, trace) => {
      const traceName =
        typeof (trace as { name?: unknown }).name === "string"
          ? ((trace as { name: string }).name ?? "")
          : "";
      return sum + traceName.length;
    }, 0) / Math.max(1, traceCount)
  );

  const useVerticalLegend = traceCount >= 6 || (traceCount >= 4 && avgLegendLabelLength >= 22);
  const legendRowsEstimate = getLegendRowsEstimate(traceCount, avgLegendLabelLength);
  const topMargin = 56 + titleLineEstimate * 20 + (useVerticalLegend ? 8 : legendRowsEstimate * 18);
  const rightMargin = useVerticalLegend ? 200 : 24;

  const layout = useMemo(
    () => ({
      autosize: true,
      margin: { l: 28, r: rightMargin, t: topMargin, b: 72 },
      ...(preparedFigure.layout ?? {}),
      ...(forceDateAxis
        ? {
            xaxis: {
              ...(typeof (preparedFigure.layout as any)?.xaxis === "object"
                ? (preparedFigure.layout as any).xaxis
                : {}),
              type: "date",
            },
          }
        : {}),
      ...(isNormalized
        ? {
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            hovermode: "x unified",
            font: {
              color: "hsl(var(--foreground))",
              family: "var(--font-geist-sans)",
              size: 13,
            },
            title: {
              ...(typeof (preparedFigure.layout as any)?.title === "object"
                ? (preparedFigure.layout as any).title
                : {}),
              automargin: true,
              x: 0,
              xanchor: "left",
              y: 0.97,
              yanchor: "top",
            },
            xaxis: {
              ...(typeof (preparedFigure.layout as any)?.xaxis === "object"
                ? (preparedFigure.layout as any).xaxis
                : {}),
              automargin: true,
              title: {
                ...(typeof (preparedFigure.layout as any)?.xaxis?.title === "object"
                  ? (preparedFigure.layout as any).xaxis.title
                  : {}),
                standoff: 10,
              },
            },
            yaxis: {
              ...(typeof (preparedFigure.layout as any)?.yaxis === "object"
                ? (preparedFigure.layout as any).yaxis
                : {}),
              automargin: true,
              title: {
                ...(typeof (preparedFigure.layout as any)?.yaxis?.title === "object"
                  ? (preparedFigure.layout as any).yaxis.title
                  : {}),
                standoff: 10,
              },
            },
            legend: {
              ...(typeof (preparedFigure.layout as any)?.legend === "object"
                ? (preparedFigure.layout as any).legend
                : {}),
              orientation: useVerticalLegend ? "v" : "h",
              x: useVerticalLegend ? 1.02 : 0,
              y: useVerticalLegend ? 1 : 1.08,
              xanchor: useVerticalLegend ? "left" : "left",
              yanchor: useVerticalLegend ? "top" : "bottom",
              bgcolor: "rgba(255,255,255,0.0)",
              borderwidth: 0,
            },
          }
        : {}),
    }),
    [preparedFigure.layout, forceDateAxis, isNormalized, rightMargin, topMargin, useVerticalLegend]
  );

  const config = useMemo(
    () => ({
      displaylogo: false,
      responsive: true,
      displayModeBar: "hover",
      modeBarButtonsToRemove: [
        "lasso2d",
        "select2d",
        "toggleSpikelines",
        "autoScale2d",
      ],
      ...(preparedFigure.config ?? {}),
    }),
    [preparedFigure.config]
  );

  const PlotComponent = Plot as any;

  return (
    <div className="min-w-0 rounded-xl border bg-card/50 p-3">
      <div className="h-[320px] w-full sm:h-[380px] lg:h-[460px]">
        <PlotComponent
          config={config}
          data={preparedFigure.data}
          frames={preparedFigure.frames}
          layout={layout}
          style={{ height: "100%", width: "100%" }}
          useResizeHandler
        />
      </div>
    </div>
  );
}
