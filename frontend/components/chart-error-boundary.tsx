"use client";

import type { ReactNode } from "react";
import { Component } from "react";

type ChartErrorBoundaryProps = {
  children: ReactNode;
  title?: string;
};

type ChartErrorBoundaryState = {
  hasError: boolean;
};

export class ChartErrorBoundary extends Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  state: ChartErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ChartErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Keep chart failures isolated from the rest of the message rendering.
    console.error("Chart rendering failed", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-md border border-amber-300/60 bg-amber-50/40 p-2 text-xs text-amber-900">
          {this.props.title || "Chart preview unavailable for this response. Data table and summary remain available."}
        </div>
      );
    }

    return this.props.children;
  }
}
