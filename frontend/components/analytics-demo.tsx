"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { AnalyticsD3Chart } from "@/components/analytics-d3-chart";
import { useSizeBreakpoints } from "@/hooks/use-size-breakpoints";

type AnalyticsRow = {
  week: number;
  label: string;
  sessions: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
};

type MetricKey = "revenue" | "sessions" | "conversions";

const rows: AnalyticsRow[] = Array.from({ length: 52 }, (_, index) => {
  const week = index + 1;
  const baseSessions = 1600 + week * 18;
  const seasonal = Math.sin(week / 3.7) * 160 + Math.cos(week / 5.2) * 90;
  const sessions = Math.max(900, Math.round(baseSessions + seasonal));
  const conversionRate = 0.041 + (week % 8) * 0.0011 + Math.sin(week / 6) * 0.002;
  const conversions = Math.round(sessions * conversionRate);
  const averageOrderValue = 88 + (week % 6) * 3 + Math.cos(week / 4.2) * 5;
  const revenue = Math.round(conversions * averageOrderValue);

  const weekStartDay = ((week - 1) * 7) % 365;
  const month = Math.floor(weekStartDay / 30.4) + 1;
  const day = (weekStartDay % 30) + 1;
  const label = `W${week} · ${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;

  return {
    week,
    label,
    sessions,
    conversions,
    revenue,
    conversionRate,
  };
});

const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
const totalSessions = rows.reduce((sum, row) => sum + row.sessions, 0);
const totalConversions = rows.reduce((sum, row) => sum + row.conversions, 0);
const avgConversionRate = totalConversions / Math.max(1, totalSessions);

const latest = rows.at(-1)!;
const previous = rows.at(-2)!;
const revenueDelta = latest.revenue - previous.revenue;
const revenueDeltaPct = (revenueDelta / Math.max(1, previous.revenue)) * 100;

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

const currencyTickFormatter = (value: number) => {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value}`;
};

export function AnalyticsInsight() {
  const { containerRef, ready, width, height, widthBucket } = useSizeBreakpoints({
    widthBreakpoints: [640, 960, 1280],
    heightBreakpoints: [260, 320, 420],
  });

  const [activeMetric, setActiveMetric] = useState<MetricKey>("revenue");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const metricConfig = useMemo(
    () => ({
      revenue: {
        label: "Revenue",
        color: isDark ? "#60a5fa" : "#e76f51",
        formatter: (value: number) => formatCurrency(value),
        tickFormatter: (value: number) => currencyTickFormatter(value),
      },
      sessions: {
        label: "Sessions",
        color: isDark ? "#34d399" : "#2a9d8f",
        formatter: (value: number) => formatNumber(value),
        tickFormatter: (value: number) => formatCompactNumber(value),
      },
      conversions: {
        label: "Conversions",
        color: isDark ? "#f59e0b" : "#f4a261",
        formatter: (value: number) => formatNumber(value),
        tickFormatter: (value: number) => formatCompactNumber(value),
      },
    }),
    [isDark]
  );

  const activeSeries = metricConfig[activeMetric];
  const xAxisInterval = widthBucket === 0 ? 8 : widthBucket === 1 ? 6 : 5;

  return (
    <div className="w-full space-y-4 rounded-2xl border bg-card p-4 md:p-5">
      <div className="space-y-2">
        <h3 className="font-semibold text-lg">Last 52 Weeks Analytics</h3>
        <p className="text-sm leading-relaxed text-foreground/95">
          Performance is trending positively across the year. Weekly demand is
          steadily growing, conversion efficiency remains stable, and the latest
          week shows a {revenueDelta >= 0 ? "positive" : "negative"} movement of{" "}
          <span className="font-medium">{formatCurrency(Math.abs(revenueDelta))}</span>
          {" "}({Math.abs(revenueDeltaPct).toFixed(1)}%) versus the prior week.
        </p>
        <div className="rounded-xl border bg-muted/40 p-3 text-sm">
          <div className="font-medium">Summary</div>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Consistent traffic lift with healthy week-over-week growth.</li>
            <li>Conversion quality is resilient through seasonal variation.</li>
            <li>Revenue momentum accelerates in the final third of the period.</li>
          </ul>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-xl border bg-background p-3">
          <div className="text-muted-foreground text-xs">Total Sessions</div>
          <div className="font-semibold text-base">
            {formatNumber(totalSessions)}
          </div>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <div className="text-muted-foreground text-xs">Total Conversions</div>
          <div className="font-semibold text-base">
            {formatNumber(totalConversions)}
          </div>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <div className="text-muted-foreground text-xs">Total Revenue</div>
          <div className="font-semibold text-base">
            {formatCurrency(totalRevenue)}
          </div>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <div className="text-muted-foreground text-xs">Avg Conversion Rate</div>
          <div className="font-semibold text-base">
            {formatPercent(avgConversionRate)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="font-medium text-sm">52-Week Trend</div>
          <div className="text-muted-foreground text-xs">Weekly timeline</div>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(metricConfig) as MetricKey[]).map((metric) => (
            <Button
              className="h-8"
              key={metric}
              onClick={() => setActiveMetric(metric)}
              size="sm"
              variant={activeMetric === metric ? "default" : "outline"}
            >
              {metricConfig[metric].label}
            </Button>
          ))}
        </div>

        <div className="h-80 w-full min-w-0" ref={containerRef}>
          {ready && width > 0 && height > 0 ? (
            <ResponsiveContainer height={height} minHeight={320} minWidth={0} width={width}>
              <AreaChart data={rows} margin={{ top: 8, right: 12, left: 8, bottom: 6 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={activeSeries.color} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={activeSeries.color} stopOpacity={0.04} />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke="hsl(var(--border))"
                strokeDasharray="3 3"
                vertical={false}
              />

              <XAxis
                axisLine={false}
                dataKey="week"
                interval={xAxisInterval}
                tickLine={false}
                tickMargin={10}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              />

              <YAxis
                axisLine={false}
                tickCount={6}
                tickFormatter={activeSeries.tickFormatter}
                tickLine={false}
                tickMargin={8}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                width={58}
              />

              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
                formatter={(value, _name, item) => {
                  const numericValue =
                    typeof value === "number" ? value : Number(value ?? 0);

                  if (item?.dataKey === activeMetric) {
                    return [activeSeries.formatter(numericValue), activeSeries.label];
                  }
                  return [String(numericValue), ""];
                }}
                labelFormatter={(label) => {
                  const row = rows.find((item) => item.week === Number(label));
                  return row?.label ?? `Week ${label}`;
                }}
              />

              <Area
                dataKey={activeMetric}
                fill="url(#revenueGradient)"
                fillOpacity={1}
                isAnimationActive={true}
                stroke={activeSeries.color}
                strokeWidth={2}
                type="monotone"
              />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
              Preparing chart...
            </div>
          )}
        </div>
      </div>

      {/* D3.js Chart */}
      <div className="rounded-xl border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="font-medium text-sm">52-Week Trend — D3.js</div>
          <div className="text-muted-foreground text-xs">Compare with Recharts above</div>
        </div>
        <AnalyticsD3Chart
          activeMetric={activeMetric}
          color={activeSeries.color}
          data={rows}
          tickFormatter={activeSeries.tickFormatter}
          tooltipFormatter={activeSeries.formatter}
        />
      </div>

      <div className="rounded-xl border">
        <div className="border-b px-3 py-2 font-medium text-sm">
          Weekly Data (52 rows)
        </div>
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left">
                <th className="px-3 py-2 font-medium">Week</th>
                <th className="px-3 py-2 font-medium">Sessions</th>
                <th className="px-3 py-2 font-medium">Conversions</th>
                <th className="px-3 py-2 font-medium">Conv. Rate</th>
                <th className="px-3 py-2 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-b/60" key={`row-${row.week}`}>
                  <td className="px-3 py-1.5">{row.label}</td>
                  <td className="px-3 py-1.5">{formatNumber(row.sessions)}</td>
                  <td className="px-3 py-1.5">
                    {formatNumber(row.conversions)}
                  </td>
                  <td className="px-3 py-1.5">{formatPercent(row.conversionRate)}</td>
                  <td className="px-3 py-1.5">{formatCurrency(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
