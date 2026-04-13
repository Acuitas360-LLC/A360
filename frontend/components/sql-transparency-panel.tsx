"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { PlotlyFigureChart } from "@/components/plotly-figure-chart";
import type { VisibilityType } from "./visibility-selector";

type SQLTransparencyPanelProps = {
  sqlQuery?: string;
  resultSummary?: string;
  showResultSummary?: boolean;
  columns?: string[];
  queryRows?: Array<Record<string, unknown>>;
  rowCount?: number;
  progressStages?: Array<{
    key?: string;
    label?: string;
    state?: string;
  }>;
  selectedVisibilityType: VisibilityType;
  visualizationCode?: string;
  visualizationSpec?: string;
  visualizationFigure?: {
    data?: unknown[];
    layout?: Record<string, unknown>;
    frames?: unknown[];
    config?: Record<string, unknown>;
  };
  visualizationMeta?: {
    source?: string;
    source_row_count?: number;
    source_column_count?: number;
    source_columns?: string[];
    source_data_sha256?: string;
    visualization_code_sha256?: string;
    plotly_trace_count?: number;
  };
  relevantQuestions?: string[];
};

export function SQLTransparencyPanel({
  sqlQuery,
  resultSummary,
  showResultSummary = true,
  columns,
  queryRows,
  rowCount,
  progressStages,
  selectedVisibilityType,
  visualizationCode,
  visualizationSpec,
  visualizationFigure,
  visualizationMeta,
  relevantQuestions,
}: SQLTransparencyPanelProps) {
  const [showAllRows, setShowAllRows] = useState(false);
  const isMarketingHead = selectedVisibilityType === "private";
  const tableColumns = columns ?? [];
  const tableRows = queryRows ?? [];

  const visibleRows = useMemo(() => {
    if (!tableRows.length) {
      return [];
    }

    if (showAllRows) {
      return tableRows;
    }

    return tableRows.slice(0, 20);
  }, [tableRows, showAllRows]);

  const normalizedProgressStages = useMemo(() => {
    if (!progressStages?.length) {
      return [] as Array<{ key: string; label: string; state: string }>;
    }

    const orderedKeys: string[] = [];
    const stageMap = new Map<string, { key: string; label: string; state: string }>();

    for (const stage of progressStages) {
      const key = String(stage.key || stage.label || "working").trim();
      if (!key) {
        continue;
      }

      if (!stageMap.has(key)) {
        orderedKeys.push(key);
      }

      stageMap.set(key, {
        key,
        label: String(stage.label || key),
        state: String(stage.state || "active"),
      });
    }

    return orderedKeys
      .map((key) => stageMap.get(key))
      .filter((stage): stage is { key: string; label: string; state: string } => Boolean(stage));
  }, [progressStages]);

  const hasSummaryVisible = Boolean(resultSummary?.trim());
  const hasTableReady = Boolean(tableRows.length) && Boolean(tableColumns.length);
  const isSummaryStageCompleted = normalizedProgressStages.some(
    (stage) => stage.key === "rendering_summary" && stage.state === "completed"
  );
  const hasSummaryStageSignal = normalizedProgressStages.some(
    (stage) => stage.key === "rendering_summary"
  );
  const isPreparingResultTable = normalizedProgressStages.some(
    (stage) => stage.state === "active" && stage.key === "preparing_result_table"
  );
  const isResultTableStageCompleted = normalizedProgressStages.some(
    (stage) => stage.key === "preparing_result_table" && stage.state === "completed"
  );
  const isGeneratingVisualization = normalizedProgressStages.some(
    (stage) => stage.key === "generating_visualization" && stage.state === "active"
  );
  const [showTableContent, setShowTableContent] = useState(hasTableReady);
  const [showVisualizationContent, setShowVisualizationContent] = useState(
    Boolean(visualizationFigure)
  );
  const [tablePhaseStartedAt, setTablePhaseStartedAt] = useState<number | null>(null);
  const [visualizationPhaseStartedAt, setVisualizationPhaseStartedAt] = useState<number | null>(
    null
  );
  const TABLE_REVEAL_DELAY_MS = 60;
  const CHART_REVEAL_DELAY_MS = 140;
  const PLACEHOLDER_EXIT_MS = 220;
  const MIN_TABLE_GENERATION_FEEL_MS = 280;
  const MIN_CHART_GENERATION_FEEL_MS = 340;
  const isSummaryPhaseComplete =
    hasSummaryVisible ||
    isSummaryStageCompleted ||
    (!showResultSummary &&
      (hasTableReady || Boolean(visualizationFigure) || Boolean(relevantQuestions?.length)));
  const showAnalysisDetailsHeading = hasSummaryStageSignal
    ? isSummaryStageCompleted
    : hasSummaryVisible;
  const canStartTablePhase = isSummaryPhaseComplete;
  const shouldShowTableContent =
    canStartTablePhase && hasTableReady && showTableContent;
  const canStartVisualizationPhase =
    isSummaryPhaseComplete &&
    (shouldShowTableContent || !hasTableReady || isResultTableStageCompleted);
  const shouldShowVisualizationContent =
    canStartVisualizationPhase &&
    Boolean(visualizationFigure) &&
    showVisualizationContent;

  useEffect(() => {
    if (!canStartTablePhase || tablePhaseStartedAt !== null) {
      return;
    }

    setTablePhaseStartedAt(Date.now());
  }, [canStartTablePhase, tablePhaseStartedAt]);

  useEffect(() => {
    if (!canStartTablePhase || !hasTableReady || showTableContent) {
      return;
    }

    const elapsed = tablePhaseStartedAt ? Date.now() - tablePhaseStartedAt : 0;
    const remainingGenerationFeel = Math.max(0, MIN_TABLE_GENERATION_FEEL_MS - elapsed);
    const revealDelay = Math.max(TABLE_REVEAL_DELAY_MS, remainingGenerationFeel);

    const timer = window.setTimeout(() => {
      setShowTableContent(true);
    }, revealDelay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    canStartTablePhase,
    hasTableReady,
    showTableContent,
    tablePhaseStartedAt,
  ]);

  useEffect(() => {
    if (!canStartVisualizationPhase || visualizationPhaseStartedAt !== null) {
      return;
    }

    setVisualizationPhaseStartedAt(Date.now());
  }, [canStartVisualizationPhase, visualizationPhaseStartedAt]);

  useEffect(() => {
    if (!canStartVisualizationPhase || !visualizationFigure || showVisualizationContent) {
      return;
    }

    const elapsed = visualizationPhaseStartedAt
      ? Date.now() - visualizationPhaseStartedAt
      : 0;
    const remainingGenerationFeel = Math.max(
      0,
      MIN_CHART_GENERATION_FEEL_MS - elapsed
    );
    const revealDelay = Math.max(CHART_REVEAL_DELAY_MS, remainingGenerationFeel);

    const timer = window.setTimeout(() => {
      setShowVisualizationContent(true);
    }, revealDelay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    canStartVisualizationPhase,
    visualizationFigure,
    showVisualizationContent,
    visualizationPhaseStartedAt,
  ]);

  const shouldShowTablePlaceholderNow =
    canStartTablePhase &&
    !shouldShowTableContent &&
    (isPreparingResultTable || hasTableReady);
  const shouldShowVisualizationPlaceholderNow =
    canStartVisualizationPhase &&
    !shouldShowVisualizationContent &&
    (isGeneratingVisualization || Boolean(visualizationFigure));
  const [renderTablePlaceholder, setRenderTablePlaceholder] = useState(
    shouldShowTablePlaceholderNow
  );
  const [renderVisualizationPlaceholder, setRenderVisualizationPlaceholder] =
    useState(shouldShowVisualizationPlaceholderNow);
  const [isTablePlaceholderExiting, setIsTablePlaceholderExiting] =
    useState(false);
  const [isVisualizationPlaceholderExiting, setIsVisualizationPlaceholderExiting] =
    useState(false);

  useEffect(() => {
    if (shouldShowTablePlaceholderNow) {
      setRenderTablePlaceholder(true);
      setIsTablePlaceholderExiting(false);
      return;
    }

    if (!renderTablePlaceholder) {
      return;
    }

    setIsTablePlaceholderExiting(true);
    const timer = window.setTimeout(() => {
      setRenderTablePlaceholder(false);
      setIsTablePlaceholderExiting(false);
    }, PLACEHOLDER_EXIT_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [shouldShowTablePlaceholderNow, renderTablePlaceholder]);

  useEffect(() => {
    if (shouldShowVisualizationPlaceholderNow) {
      setRenderVisualizationPlaceholder(true);
      setIsVisualizationPlaceholderExiting(false);
      return;
    }

    if (!renderVisualizationPlaceholder) {
      return;
    }

    setIsVisualizationPlaceholderExiting(true);
    const timer = window.setTimeout(() => {
      setRenderVisualizationPlaceholder(false);
      setIsVisualizationPlaceholderExiting(false);
    }, PLACEHOLDER_EXIT_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [shouldShowVisualizationPlaceholderNow, renderVisualizationPlaceholder]);

  const downloadCsv = () => {
    if (!tableColumns.length || !tableRows.length) {
      return;
    }

    const escapeValue = (value: unknown) => {
      const stringValue = String(value ?? "");
      if (
        stringValue.includes(",") ||
        stringValue.includes("\"") ||
        stringValue.includes("\n")
      ) {
        return `"${stringValue.replaceAll("\"", "\"\"")}"`;
      }
      return stringValue;
    };

    const headerRow = tableColumns.map(escapeValue).join(",");
    const dataRows = tableRows.map((row) =>
      tableColumns.map((column) => escapeValue(row[column])).join(",")
    );
    const csvContent = [headerRow, ...dataRows].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "query_results.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const hasContent =
    Boolean(normalizedProgressStages.length) ||
    Boolean(sqlQuery) ||
    Boolean(resultSummary) ||
    Boolean(columns?.length) ||
    Boolean(queryRows?.length) ||
    typeof rowCount === "number" ||
    Boolean(visualizationCode) ||
    Boolean(visualizationFigure) ||
    Boolean(relevantQuestions?.length);

  if (!hasContent) {
    return null;
  }

  return (
    <div className="response-section mb-3 w-full">
      {showAnalysisDetailsHeading && (
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-semibold text-base tracking-tight">Analysis Details</h4>
        </div>
      )}

      {showResultSummary && resultSummary && (
        <div className="response-section mb-3">
          <p className="mb-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">Result Summary</p>
          <p className="text-sm leading-6 text-foreground/95">{resultSummary}</p>
        </div>
      )}

      {sqlQuery && !isMarketingHead && (
        <div className="response-section mb-3">
          <p className="mb-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">SQL Query Executed</p>
          <pre className="response-evidence overflow-x-auto p-2 text-xs">
            <code>{sqlQuery}</code>
          </pre>
        </div>
      )}

      {(tableColumns.length || typeof rowCount === "number") && (
        <div className="response-section mb-2 flex flex-wrap gap-2 text-xs">
          {typeof rowCount === "number" && (
            <span className="rounded-full border border-border/70 bg-muted/25 px-2.5 py-1 font-medium text-[11px] tracking-wide">
              Rows: {rowCount}
            </span>
          )}
          {!!tableColumns.length && (
            <span className="rounded-full border border-border/70 bg-muted/25 px-2.5 py-1 font-medium text-[11px] tracking-wide">
              Columns: {tableColumns.length}
            </span>
          )}
        </div>
      )}

      {shouldShowTableContent && (
        <div className="response-section response-reveal response-reveal-delay-sm is-visible mb-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">Query Results</p>
            <div className="flex items-center gap-2">
              <Button
                className="h-7 rounded-md"
                onClick={() => setShowAllRows((current) => !current)}
                size="sm"
                variant="outline"
              >
                {showAllRows ? "Show First 20" : "Show All"}
              </Button>
              <Button
                className="h-7 rounded-md"
                onClick={downloadCsv}
                size="sm"
                variant="outline"
              >
                Download CSV
              </Button>
            </div>
          </div>
          <div className="response-evidence max-h-72 overflow-auto p-0">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {tableColumns.map((column) => (
                    <th
                      className="border-border/70 border-b px-3 py-2.5 font-semibold text-[11px] text-foreground/85 uppercase tracking-wide"
                      key={column}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, rowIndex) => (
                  <tr
                    className="odd:bg-background even:bg-muted/20 transition-colors hover:bg-muted/35 hover:[&_td]:font-medium"
                    key={`sql-row-${rowIndex}`}
                  >
                    {tableColumns.map((column) => (
                      <td className="max-w-[280px] truncate px-3 py-2" key={`${rowIndex}-${column}`}>
                        {String(row[column] ?? "") || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tableRows.length > 20 && !showAllRows && (
            <p className="mt-1 text-muted-foreground text-xs">
              Showing first 20 rows of {tableRows.length}.
            </p>
          )}
        </div>
      )}

      {renderTablePlaceholder && (
        <div
          className={`response-section response-reveal-placeholder mb-3${
            isTablePlaceholderExiting ? " is-exiting" : ""
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
              Query Results
            </p>
            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
              <span className="animate-pulse">Preparing result table</span>
              <span className="inline-flex">
                <span className="animate-bounce [animation-delay:0ms]">.</span>
                <span className="animate-bounce [animation-delay:150ms]">.</span>
                <span className="animate-bounce [animation-delay:300ms]">.</span>
              </span>
            </span>
          </div>
          <div className="response-evidence overflow-hidden p-0">
            <div className="border-border/60 border-b bg-muted/45 px-3 py-2.5">
              <div className="h-3 w-28 animate-pulse rounded bg-foreground/15" />
            </div>
            <div className="space-y-2 px-3 py-3">
              <div className="h-3 w-full animate-pulse rounded bg-foreground/10" />
              <div className="h-3 w-[92%] animate-pulse rounded bg-foreground/10" />
              <div className="h-3 w-[86%] animate-pulse rounded bg-foreground/10" />
              <div className="h-3 w-[90%] animate-pulse rounded bg-foreground/10" />
            </div>
          </div>
        </div>
      )}

      {shouldShowVisualizationContent && visualizationFigure && (
        <div className="response-section response-reveal response-reveal-delay-md is-visible mb-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-sm tracking-tight">Data Visualization</p>
              <p className="mt-0.5 text-muted-foreground text-xs">Plotly renderer</p>
            </div>
            {typeof visualizationMeta?.plotly_trace_count === "number" && (
              <Badge className="rounded-full" variant="outline">
                {visualizationMeta.plotly_trace_count} trace{visualizationMeta.plotly_trace_count === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <div className="min-h-[280px]">
            <ChartErrorBoundary>
              <PlotlyFigureChart figure={visualizationFigure} mode="normalized" />
            </ChartErrorBoundary>
          </div>
          {visualizationMeta && (
            <div className="response-evidence mt-2 p-2 text-xs">
              <p className="font-medium text-[11px] uppercase tracking-wide">Data Fidelity</p>
              <p className="mt-1 text-muted-foreground">
                Source: {visualizationMeta.source || "sql_result_dataframe"} | Rows: {visualizationMeta.source_row_count ?? "-"} | Columns: {visualizationMeta.source_column_count ?? "-"} | Traces: {visualizationMeta.plotly_trace_count ?? "-"}
              </p>
              {visualizationMeta.source_data_sha256 && (
                <p className="mt-1 break-all text-muted-foreground">
                  Data SHA-256: {visualizationMeta.source_data_sha256}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {renderVisualizationPlaceholder && (
        <div
          className={`response-section response-reveal-placeholder mb-3${
            isVisualizationPlaceholderExiting ? " is-exiting" : ""
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <p className="font-semibold text-sm tracking-tight">Data Visualization</p>
            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
              <span className="animate-pulse">Building visualization</span>
              <span className="inline-flex">
                <span className="animate-bounce [animation-delay:0ms]">.</span>
                <span className="animate-bounce [animation-delay:150ms]">.</span>
                <span className="animate-bounce [animation-delay:300ms]">.</span>
              </span>
            </span>
          </div>
          <div className="response-evidence p-3">
            <div className="h-[280px] w-full animate-pulse rounded-lg border border-border/50 bg-muted/30" />
          </div>
        </div>
      )}

      {!!visualizationCode && !visualizationFigure && !renderVisualizationPlaceholder && (
        <div className="response-section mb-3 rounded-md border border-amber-300/60 bg-amber-50/40 p-2 text-xs text-amber-900">
          Deterministic Plotly chart is unavailable for this response. Summary and table remain available.
        </div>
      )}

      {!!relevantQuestions?.length && (
        <div className="response-section mt-4">
          <p className="mb-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">Potential Follow-up Questions</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6">
            {relevantQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
