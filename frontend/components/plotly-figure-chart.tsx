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

function getMarginValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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

function stripFixedLayoutSize(layout: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!layout) {
    return {};
  }

  const { width, height, ...rest } = layout;
  return rest;
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

    const baseLayout =
      figure.layout && typeof figure.layout === "object"
        ? { ...figure.layout }
        : undefined;

    return {
      data: clonedData,
      layout: baseLayout,
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

  const titleText = getTitleText(
    preparedFigure.layout as Record<string, unknown> | undefined
  );
  const titleLineEstimate = Math.max(1, Math.ceil(titleText.length / 70));

  const hasSecondaryYAxis = Boolean(
    preparedFigure.layout &&
      typeof (preparedFigure.layout as { yaxis2?: unknown }).yaxis2 === "object"
  );
  const normalizedLayout = stripFixedLayoutSize(
    preparedFigure.layout as Record<string, unknown> | undefined
  );
  const layoutMargin =
    normalizedLayout &&
    typeof (normalizedLayout as { margin?: unknown }).margin === "object"
      ? ((normalizedLayout as { margin?: Record<string, unknown> }).margin ?? {})
      : {};
  const topMargin = 56 + titleLineEstimate * 18;
  const rightMargin = Math.max(
    hasSecondaryYAxis ? 96 : 36,
    getMarginValue((layoutMargin as { r?: unknown }).r)
  );
  const leftMargin = Math.max(40, getMarginValue((layoutMargin as { l?: unknown }).l));
  const bottomMargin = Math.max(72, getMarginValue((layoutMargin as { b?: unknown }).b));
  const resolvedTopMargin = Math.max(
    topMargin,
    getMarginValue((layoutMargin as { t?: unknown }).t)
  );
  const boundedTopMargin = Math.min(resolvedTopMargin, 120);
  const boundedBottomMargin = Math.min(bottomMargin, 96);
  const boundedRightMargin = Math.min(rightMargin, 120);
  const boundedLeftMargin = Math.min(leftMargin, 72);

  const layout = useMemo(
    () => ({
      autosize: true,
      ...normalizedLayout,
      ...(forceDateAxis
        ? {
            xaxis: {
              ...(typeof (normalizedLayout as any)?.xaxis === "object"
                ? (normalizedLayout as any).xaxis
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
              ...(typeof (normalizedLayout as any)?.title === "object"
                ? (normalizedLayout as any).title
                : {}),
              automargin: true,
              x: 0,
              xanchor: "left",
              y: 0.97,
              yanchor: "top",
            },
            xaxis: {
              ...(typeof (normalizedLayout as any)?.xaxis === "object"
                ? (normalizedLayout as any).xaxis
                : {}),
              automargin: true,
              title: {
                ...(typeof (normalizedLayout as any)?.xaxis?.title === "object"
                  ? (normalizedLayout as any).xaxis.title
                  : {}),
                standoff: 10,
              },
            },
            yaxis: {
              ...(typeof (normalizedLayout as any)?.yaxis === "object"
                ? (normalizedLayout as any).yaxis
                : {}),
              automargin: true,
              title: {
                ...(typeof (normalizedLayout as any)?.yaxis?.title === "object"
                  ? (normalizedLayout as any).yaxis.title
                  : {}),
                standoff: 10,
              },
            },
            ...(hasSecondaryYAxis
              ? {
                  yaxis2: {
                    ...(typeof (normalizedLayout as any)?.yaxis2 === "object"
                      ? (normalizedLayout as any).yaxis2
                      : {}),
                    automargin: true,
                    title: {
                      ...(typeof (normalizedLayout as any)?.yaxis2?.title === "object"
                        ? (normalizedLayout as any).yaxis2.title
                        : {}),
                      standoff: 8,
                    },
                  },
                }
              : {}),
          }
        : {}),
      margin: {
        l: boundedLeftMargin,
        r: boundedRightMargin,
        t: boundedTopMargin,
        b: boundedBottomMargin,
      },
    }),
    [
      normalizedLayout,
      forceDateAxis,
      isNormalized,
      boundedLeftMargin,
      boundedRightMargin,
      boundedTopMargin,
      boundedBottomMargin,
      hasSecondaryYAxis,
    ]
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
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card/50 p-3">
      <div className="h-[360px] w-full overflow-hidden sm:h-[430px] lg:h-[520px]">
        <PlotComponent
          config={config}
          data={preparedFigure.data}
          frames={preparedFigure.frames}
          layout={layout}
          style={{ height: "100%", maxWidth: "100%", width: "100%" }}
          useResizeHandler
        />
      </div>
    </div>
  );
}
