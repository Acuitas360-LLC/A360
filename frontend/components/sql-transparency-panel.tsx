"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { PlotlyFigureChart } from "@/components/plotly-figure-chart";
import { QueryResultChart } from "@/components/query-result-chart";
import { SpecChartRenderer } from "@/components/spec-chart-renderer";
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
  const [showDeterministicCharts, setShowDeterministicCharts] = useState(false);
  const isMarketingHead = selectedVisibilityType === "private";

  const visibleRows = useMemo(() => {
    if (!queryRows?.length) {
      return [];
    }

    if (showAllRows) {
      return queryRows;
    }

    return queryRows.slice(0, 20);
  }, [queryRows, showAllRows]);

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

  const downloadCsv = () => {
    if (!columns?.length || !queryRows?.length) {
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

    const headerRow = columns.map(escapeValue).join(",");
    const dataRows = queryRows.map((row) =>
      columns.map((column) => escapeValue(row[column])).join(",")
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
    Boolean(visualizationSpec) ||
    Boolean(visualizationFigure?.data?.length) ||
    Boolean(relevantQuestions?.length);

  if (!hasContent) {
    return null;
  }

  return (
    <div className="mb-3 w-full rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold text-sm">Analysis Details</h4>
        <Badge variant="outline">Parity View</Badge>
      </div>

      {!!normalizedProgressStages.length && (
        <div className="mb-3 rounded-md border bg-muted/20 p-2">
          <p className="mb-1 text-muted-foreground text-xs">Live Progress</p>
          <div className="flex flex-wrap gap-2">
            {normalizedProgressStages.map((stage) => {
              const isCompleted = stage.state === "completed";
              const isFailed = stage.state === "failed";
              const stateClass = isFailed
                ? "border-red-300 bg-red-50 text-red-700"
                : isCompleted
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-blue-300 bg-blue-50 text-blue-700";

              return (
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${stateClass}`}
                  key={`progress-stage-${stage.key}`}
                >
                  {stage.label}{isCompleted ? " - done" : isFailed ? " - failed" : "..."}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {showResultSummary && resultSummary && (
        <div className="mb-3">
          <p className="mb-1 text-muted-foreground text-xs">Result Summary</p>
          <p className="text-sm">{resultSummary}</p>
        </div>
      )}

      {sqlQuery && !isMarketingHead && (
        <div className="mb-3">
          <p className="mb-1 text-muted-foreground text-xs">SQL Query Executed</p>
          <pre className="overflow-x-auto rounded-md border bg-muted p-2 text-xs">
            <code>{sqlQuery}</code>
          </pre>
        </div>
      )}

      {(columns?.length || typeof rowCount === "number") && (
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          {typeof rowCount === "number" && (
            <span className="rounded-md border px-2 py-1">Rows: {rowCount}</span>
          )}
          {!!columns?.length && (
            <span className="rounded-md border px-2 py-1">
              Columns: {columns.length}
            </span>
          )}
        </div>
      )}

      {!!queryRows?.length && !!columns?.length && (
        <div className="mb-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">Query Results</p>
            <div className="flex items-center gap-2">
              <Button
                className="h-7"
                onClick={() => setShowAllRows((current) => !current)}
                size="sm"
                variant="outline"
              >
                {showAllRows ? "Show First 20" : "Show All"}
              </Button>
              <Button
                className="h-7"
                onClick={downloadCsv}
                size="sm"
                variant="outline"
              >
                Download CSV
              </Button>
            </div>
          </div>
          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted/40">
                <tr>
                  {columns.map((column) => (
                    <th className="border-b px-2 py-2 font-medium" key={column}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, rowIndex) => (
                  <tr className="odd:bg-background even:bg-muted/20" key={`sql-row-${rowIndex}`}>
                    {columns.map((column) => (
                      <td className="max-w-[280px] truncate px-2 py-1.5" key={`${rowIndex}-${column}`}>
                        {String(row[column] ?? "") || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {queryRows.length > 20 && !showAllRows && (
            <p className="mt-1 text-muted-foreground text-xs">
              Showing first 20 rows of {queryRows.length}.
            </p>
          )}
        </div>
      )}

      {!!visualizationFigure?.data?.length && (
        <div className="mb-3">
          <p className="mb-2 text-muted-foreground text-xs">
            Deterministic Plotly Charts
          </p>
          {!showDeterministicCharts ? (
            <div className="rounded-md border border-amber-300/60 bg-amber-50/40 p-2 text-xs text-amber-900">
              Plotly charts are paused by default for stability in long streamed replies.
              <Button
                className="ml-2 h-7"
                onClick={() => setShowDeterministicCharts(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                Load Plotly chart
              </Button>
            </div>
          ) : (
            <ChartErrorBoundary>
              <PlotlyFigureChart figure={visualizationFigure} mode="normalized" />
            </ChartErrorBoundary>
          )}
          {visualizationMeta && (
            <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs">
              <p className="font-medium">Data Fidelity</p>
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

      {!!visualizationCode && !visualizationFigure?.data?.length && (
        <div className="mb-3 rounded-md border border-amber-300/60 bg-amber-50/40 p-2 text-xs text-amber-900">
          Deterministic Plotly chart is unavailable for this response. Showing heuristic fallback below.
        </div>
      )}

      {!!queryRows?.length && !!columns?.length && !!visualizationCode && (
        <div className="mb-3">
          <p className="mb-2 text-muted-foreground text-xs">
            Heuristic Chart 3 (table-based fallback)
          </p>
          <ChartErrorBoundary>
            <QueryResultChart columns={columns} rows={queryRows} />
          </ChartErrorBoundary>
        </div>
      )}

      {!!queryRows?.length && !!visualizationSpec && (
        <div className="mb-3">
          <p className="mb-2 text-muted-foreground text-xs">
            Spec Chart 4 (new visualization-spec node)
          </p>
          <ChartErrorBoundary>
            <SpecChartRenderer rows={queryRows} visualizationSpec={visualizationSpec} />
          </ChartErrorBoundary>
        </div>
      )}

      {visualizationCode && !isMarketingHead && (
        <div className="mb-3">
          <p className="mb-1 text-muted-foreground text-xs">Visualization Payload</p>
          <pre className="overflow-x-auto rounded-md border bg-muted p-2 text-xs">
            <code>{visualizationCode}</code>
          </pre>
        </div>
      )}

      {visualizationSpec && !isMarketingHead && (
        <div className="mb-3">
          <p className="mb-1 text-muted-foreground text-xs">Visualization Spec Payload (New Node)</p>
          <pre className="overflow-x-auto rounded-md border bg-muted p-2 text-xs">
            <code>{visualizationSpec}</code>
          </pre>
        </div>
      )}

      {!!relevantQuestions?.length && (
        <div>
          <p className="mb-1 text-muted-foreground text-xs">Relevant Questions</p>
          <ul className="list-disc pl-5 text-sm">
            {relevantQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
