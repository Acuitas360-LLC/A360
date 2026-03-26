"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

  return (
    <div className="rounded-md border p-3">
      <p className="mb-2 text-muted-foreground text-xs">Chart Preview</p>
      <div className="h-72 w-full">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={chartRows} margin={{ top: 8, right: 8, bottom: 8, left: 4 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="label"
              interval={0}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              tickLine={false}
              tickMargin={8}
            />
            <Tooltip />
            <Legend />
            {metricColumns.map((metricColumn, index) => (
              <Bar
                dataKey={metricColumn}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
                key={metricColumn}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
