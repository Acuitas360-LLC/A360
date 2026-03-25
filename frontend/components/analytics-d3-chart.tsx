"use client";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – d3 ships its own types; resolved via @types/d3
import * as d3 from "d3";
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

type DataRow = {
  week: number;
  revenue: number;
  sessions: number;
  conversions: number;
};

type MetricKey = "revenue" | "sessions" | "conversions";

type Props = {
  data: DataRow[];
  activeMetric: MetricKey;
  color: string;
  tickFormatter: (v: number) => string;
  tooltipFormatter: (v: number) => string;
};

export function AnalyticsD3Chart({
  data,
  activeMetric,
  color,
  tickFormatter,
  tooltipFormatter,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const tooltip = d3.select(tooltipRef.current);
    svg.selectAll("*").remove();

    const containerWidth = svgRef.current?.parentElement?.clientWidth ?? 600;
    const margin = { top: 16, right: 16, bottom: 36, left: 64 };
    const width = containerWidth - margin.left - margin.right;
    const height = 320 - margin.top - margin.bottom;

    const g = svg
      .attr("width", containerWidth)
      .attr("height", 320)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scaleLinear()
      .domain([1, data.length])
      .range([0, width]);

    const yMax = (d3.max(data, (row: DataRow) => row[activeMetric]) as number) ?? 0;
    const yScale = d3.scaleLinear().domain([0, yMax * 1.12]).nice().range([height, 0]);

    const mutedColor = isDark
      ? "hsl(240 5% 64.9%)"
      : "hsl(240 3.8% 46.1%)";
    const gridColor = isDark
      ? "hsl(240 3.7% 15.9%)"
      : "hsl(240 5.9% 90%)";

    // Grid lines
    g.append("g")
      .attr("class", "grid")
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-width)
          .tickFormat(() => "")
      )
      .call((ax: d3.Selection<SVGGElement, unknown, null, undefined>) => {
        ax.select(".domain").remove();
        ax.selectAll(".tick line")
          .attr("stroke", gridColor)
          .attr("stroke-dasharray", "3 3");
      });

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(8)
          .tickFormat((v: d3.NumberValue) => `W${v}`)
      )
      .call((ax: d3.Selection<SVGGElement, unknown, null, undefined>) => {
        ax.select(".domain").remove();
        ax.selectAll(".tick line").remove();
        ax.selectAll("text")
          .attr("fill", mutedColor)
          .attr("font-size", 11);
      });

    // Y axis
    g.append("g")
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((v: d3.NumberValue) => tickFormatter(v as number))
      )
      .call((ax: d3.Selection<SVGGElement, unknown, null, undefined>) => {
        ax.select(".domain").remove();
        ax.selectAll(".tick line").remove();
        ax.selectAll("text")
          .attr("fill", mutedColor)
          .attr("font-size", 11);
      });

    // Gradient
    const gradientId = "d3-area-gradient";
    const defs = svg.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0")
      .attr("y1", "0")
      .attr("x2", "0")
      .attr("y2", "1");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 0.45);
    gradient.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0.04);

    // Area
    const areaGen = d3
      .area<DataRow>()
      .x((row: DataRow) => xScale(row.week))
      .y0(height)
      .y1((row: DataRow) => yScale(row[activeMetric]))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", `url(#${gradientId})`)
      .attr("d", areaGen);

    // Line
    const lineGen = d3
      .line<DataRow>()
      .x((row: DataRow) => xScale(row.week))
      .y((row: DataRow) => yScale(row[activeMetric]))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 2)
      .attr("d", lineGen);

    // Hover overlay for tooltip
    const bisect = d3.bisector((row: DataRow) => row.week).left;

    const focus = g.append("g").style("display", "none");
    focus
      .append("circle")
      .attr("r", 4)
      .attr("fill", color)
      .attr("stroke", "white")
      .attr("stroke-width", 2);

    g.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .on("mouseover", () => {
        focus.style("display", null);
        tooltip.style("display", "block");
      })
      .on("mouseout", () => {
        focus.style("display", "none");
        tooltip.style("display", "none");
      })
      .on("mousemove", (event: MouseEvent) => {
        const [mx] = d3.pointer(event);
        const week = Math.round(xScale.invert(mx));
        const idx = bisect(data, week, 1);
        const d = data[Math.max(0, Math.min(idx, data.length - 1))];
        if (!d) return;
        const cx = xScale(d.week);
        const cy = yScale(d[activeMetric]);
        focus.attr("transform", `translate(${cx},${cy})`);
        const ttX = cx + margin.left + 12;
        const ttY = cy + margin.top - 16;
        tooltip
          .style("left", `${ttX}px`)
          .style("top", `${ttY}px`)
          .html(`<div class="font-medium text-xs">W${d.week}</div><div class="text-xs">${tooltipFormatter(d[activeMetric])}</div>`);
      });
  }, [data, activeMetric, color, tickFormatter, tooltipFormatter, isDark]);

  return (
    <div className="relative w-full">
      <svg ref={svgRef} className="w-full" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute hidden rounded-xl border bg-card px-3 py-2 shadow-lg text-foreground"
        style={{ minWidth: "100px" }}
      />
    </div>
  );
}
