"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type UseSizeBreakpointsOptions = {
  widthBreakpoints?: number[];
  heightBreakpoints?: number[];
};

type SizeBreakpointState = {
  ready: boolean;
  width: number;
  height: number;
  widthBucket: number;
  heightBucket: number;
};

const DEFAULT_WIDTH_BREAKPOINTS = [560, 840, 1120];
const DEFAULT_HEIGHT_BREAKPOINTS = [240, 320, 420];

function bucketIndex(value: number, breakpoints: number[]) {
  let index = 0;
  while (index < breakpoints.length && value >= breakpoints[index]) {
    index += 1;
  }
  return index;
}

export function useSizeBreakpoints(options?: UseSizeBreakpointsOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastMeasuredRef = useRef<{ width: number; height: number } | null>(null);

  const rawWidthBreakpoints = options?.widthBreakpoints ?? DEFAULT_WIDTH_BREAKPOINTS;
  const rawHeightBreakpoints = options?.heightBreakpoints ?? DEFAULT_HEIGHT_BREAKPOINTS;

  // Memoize the breakpoint keys to prevent recomputation on every render
  const widthBreakpointsKey = useMemo(
    () => rawWidthBreakpoints.join(","),
    [rawWidthBreakpoints]
  );
  const heightBreakpointsKey = useMemo(
    () => rawHeightBreakpoints.join(","),
    [rawHeightBreakpoints]
  );

  const widthBreakpoints = useMemo(
    () => [...rawWidthBreakpoints],
    [widthBreakpointsKey]
  );
  const heightBreakpoints = useMemo(
    () => [...rawHeightBreakpoints],
    [heightBreakpointsKey]
  );

  const [state, setState] = useState<SizeBreakpointState>({
    ready: false,
    width: 0,
    height: 0,
    widthBucket: 0,
    heightBucket: 0,
  });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        const width = Math.floor(entry.contentRect.width);
        const height = Math.floor(entry.contentRect.height);

        if (width <= 0 || height <= 0) {
          // Mark as not ready while hidden/collapsed so chart libraries
          // do not attempt layout with invalid dimensions.
          lastMeasuredRef.current = null;
          setState((current) => {
            if (!current.ready) {
              return current;
            }

            return {
              ...current,
              ready: false,
              width: 0,
              height: 0,
            };
          });
          return;
        }

        const lastMeasured = lastMeasuredRef.current;
        if (lastMeasured && lastMeasured.width === width && lastMeasured.height === height) {
          return;
        }

        lastMeasuredRef.current = { width, height };

        const nextWidthBucket = bucketIndex(width, widthBreakpoints);
        const nextHeightBucket = bucketIndex(height, heightBreakpoints);

        setState((current) => {
          if (
            current.ready &&
            current.width === width &&
            current.height === height &&
            current.widthBucket === nextWidthBucket &&
            current.heightBucket === nextHeightBucket
          ) {
            return current;
          }

          return {
            ready: true,
            width,
            height,
            widthBucket: nextWidthBucket,
            heightBucket: nextHeightBucket,
          };
        });
      });
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [heightBreakpoints, widthBreakpoints]);

  return {
    containerRef,
    ready: state.ready,
    width: state.width,
    height: state.height,
    widthBucket: state.widthBucket,
    heightBucket: state.heightBucket,
  };
}
