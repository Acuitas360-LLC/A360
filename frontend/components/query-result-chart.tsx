"use client";

type QueryResultChartProps = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

function isNumericValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed);
  }

  return false;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

const CHART_COLORS = ["#2a9d8f", "#e76f51", "#457b9d", "#f4a261"];

export function QueryResultChart({ columns, rows }: QueryResultChartProps) {
  if (!columns.length || !rows.length) {
    return null;
  }

  const sampleRows = rows.slice(0, 50);

  const numericColumns = columns.filter((column) =>
    sampleRows.some((row) => isNumericValue(row[column]))
  );

  if (numericColumns.length === 0) {
    return null;
  }

  const categoryColumn =
    columns.find((column) => !numericColumns.includes(column)) ?? columns[0];

  const metricColumns = numericColumns
    .filter((column) => column !== categoryColumn)
    .slice(0, 2);

  if (metricColumns.length === 0) {
    return null;
  }

  const chartRows = rows.slice(0, 20).map((row, index) => {
    const label = row[categoryColumn];
    const dataPoint: Record<string, unknown> = {
      id: index,
      label: String(label ?? `Row ${index + 1}`),
    };

    for (const metricColumn of metricColumns) {
      dataPoint[metricColumn] = toNumber(row[metricColumn]);
    }

    return dataPoint;
  });

  const chartMax = Math.max(
    1,
    ...chartRows.flatMap((row) =>
      metricColumns.map((metric) => toNumber(row[metric]))
    )
  );

  return (
    <div className="rounded-md border p-3">
      <p className="mb-2 text-muted-foreground text-xs">Chart Preview</p>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3 text-xs">
          {metricColumns.map((metric, index) => (
            <div className="flex items-center gap-2" key={`legend-${metric}`}>
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
              />
              <span className="text-muted-foreground">{metric}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {chartRows.map((row) => (
            <div className="grid grid-cols-[140px_1fr] items-center gap-3" key={String(row.id)}>
              <div className="truncate text-xs text-muted-foreground">
                {String(row.label)}
              </div>
              <div className="space-y-1">
                {metricColumns.map((metric, index) => {
                  const value = toNumber(row[metric]);
                  const widthPct = Math.max(2, Math.round((value / chartMax) * 100));
                  return (
                    <div className="flex items-center gap-2" key={`${row.id}-${metric}`}>
                      <div className="h-2 flex-1 rounded-full bg-muted/40">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                          }}
                        />
                      </div>
                      <div className="w-16 text-right text-[10px] text-muted-foreground">
                        {value.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
