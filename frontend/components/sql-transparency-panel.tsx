"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryResultChart } from "@/components/query-result-chart";

type SQLTransparencyPanelProps = {
  sqlQuery?: string;
  resultSummary?: string;
  columns?: string[];
  queryRows?: Array<Record<string, unknown>>;
  rowCount?: number;
  visualizationCode?: string;
  relevantQuestions?: string[];
};

export function SQLTransparencyPanel({
  sqlQuery,
  resultSummary,
  columns,
  queryRows,
  rowCount,
  visualizationCode,
  relevantQuestions,
}: SQLTransparencyPanelProps) {
  const [showAllRows, setShowAllRows] = useState(false);

  const visibleRows = useMemo(() => {
    if (!queryRows?.length) {
      return [];
    }

    if (showAllRows) {
      return queryRows;
    }

    return queryRows.slice(0, 20);
  }, [queryRows, showAllRows]);

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
    Boolean(sqlQuery) ||
    Boolean(resultSummary) ||
    Boolean(columns?.length) ||
    Boolean(queryRows?.length) ||
    typeof rowCount === "number" ||
    Boolean(visualizationCode) ||
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

      {resultSummary && (
        <div className="mb-3">
          <p className="mb-1 text-muted-foreground text-xs">Result Summary</p>
          <p className="text-sm">{resultSummary}</p>
        </div>
      )}

      {sqlQuery && (
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

      {!!queryRows?.length && !!columns?.length && !!visualizationCode && (
        <div className="mb-3">
          <QueryResultChart columns={columns} rows={queryRows} />
        </div>
      )}

      {visualizationCode && (
        <div className="mb-3">
          <p className="mb-1 text-muted-foreground text-xs">Visualization Payload</p>
          <pre className="overflow-x-auto rounded-md border bg-muted p-2 text-xs">
            <code>{visualizationCode}</code>
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
