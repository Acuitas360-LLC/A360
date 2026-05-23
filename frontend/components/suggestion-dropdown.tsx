"use client";

import { cn } from "@/lib/utils";

export type SuggestionItem = {
  question: string;
  score?: number;
};

type SuggestionDropdownProps = {
  open: boolean;
  loading: boolean;
  hasLoaded: boolean;
  suggestions: SuggestionItem[];
  highlightedIndex: number;
  onSelect: (suggestion: SuggestionItem) => void;
  onHighlight: (index: number) => void;
  placement?: "above" | "below";
  className?: string;
};

export function SuggestionDropdown({
  open,
  loading,
  hasLoaded,
  suggestions,
  highlightedIndex,
  onSelect,
  onHighlight,
  placement = "above",
  className,
}: SuggestionDropdownProps) {
  if (!open) {
    return null;
  }

  const placementClassName =
    placement === "below"
      ? "top-full mt-2"
      : "bottom-full mb-2";

  return (
    <div
      className={cn(
        "absolute left-0 right-0 z-20 max-h-64 min-h-12 overflow-y-auto overscroll-contain rounded-xl border border-border bg-background shadow-lg",
        placementClassName,
        className
      )}
      role="listbox"
      aria-label="Suggestions"
    >
      {(loading || !hasLoaded) && suggestions.length === 0 ? (
        <div className="px-3 py-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-muted-foreground/70" />
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-muted-foreground/30 [animation-delay:300ms]" />
            <span className="ml-2">Loading suggestions</span>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-3 w-5/6 animate-pulse rounded bg-muted/60" />
            <div className="h-3 w-4/6 animate-pulse rounded bg-muted/50" />
            <div className="h-3 w-3/6 animate-pulse rounded bg-muted/40" />
          </div>
        </div>
      ) : hasLoaded && suggestions.length === 0 ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">
          No suggestions
        </div>
      ) : (
        suggestions.map((suggestion, index) => {
          const isActive = index === highlightedIndex;
          return (
            <button
              key={`${suggestion.question}-${index}`}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-muted text-foreground"
                  : "bg-transparent text-foreground hover:bg-muted/60"
              )}
              role="option"
              aria-selected={isActive}
              onMouseEnter={() => onHighlight(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(suggestion);
              }}
            >
              <span className="truncate">{suggestion.question}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
