"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PulseIcon } from "@/components/icons";
import { withBrowserAuthHeaders } from "@/lib/iframe-auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type DailyPulsePayload = {
  questions?: string[];
  count?: number;
};

export function DailyPulseSelector({
  onConfigured,
}: {
  onConfigured?: (questions: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const nonEmptyCount = useMemo(
    () => questions.map((q) => q.trim()).filter((q) => q.length > 0).length,
    [questions]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    const loadQuestions = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/daily-pulse", {
          cache: "no-store",
          headers: withBrowserAuthHeaders(),
        });
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(detail || "Failed to load Daily Pulse questions");
        }

        const payload = (await response.json()) as DailyPulsePayload;
        const loaded = Array.isArray(payload.questions)
          ? payload.questions.filter((q): q is string => typeof q === "string")
          : [];

        if (!active) {
          return;
        }

        setQuestions(loaded.length > 0 ? loaded : [""]);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load Daily Pulse questions"
        );
        if (active) {
          setQuestions([""]);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadQuestions();

    return () => {
      active = false;
    };
  }, [open]);

  const setQuestionAt = (index: number, value: string) => {
    setQuestions((current) =>
      current.map((question, idx) => (idx === index ? value : question))
    );
  };

  const removeQuestionAt = (index: number) => {
    setQuestions((current) => {
      const next = current.filter((_, idx) => idx !== index);
      return next.length > 0 ? next : [""];
    });
  };

  const addQuestion = () => {
    setQuestions((current) => [...current, ""]);
  };

  const persistQuestions = async ({ runAfterSave }: { runAfterSave: boolean }) => {
    if (isSaving) {
      return;
    }

    const normalized = questions
      .map((question) => question.trim())
      .filter((question) => question.length > 0);

    const deduped = Array.from(new Set(normalized));

    if (deduped.length === 0) {
      toast.error("Add at least one question before running Daily Pulse");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/daily-pulse", {
        method: "PUT",
        headers: withBrowserAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ questions: deduped }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to save Daily Pulse questions");
      }

      const payload = (await response.json()) as DailyPulsePayload;
      const savedQuestions = Array.isArray(payload.questions)
        ? payload.questions.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        : deduped;

      if (runAfterSave) {
        onConfigured?.(savedQuestions);
        toast.success(`Started batch run for ${savedQuestions.length} questions`);
      } else {
        toast.success(`Saved ${savedQuestions.length} question${savedQuestions.length === 1 ? "" : "s"}`);
      }

      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save and run Daily Pulse"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const saveAndRun = async () => {
    await persistQuestions({ runAfterSave: true });
  };

  const saveOnly = async () => {
    await persistQuestions({ runAfterSave: false });
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button
          className="h-8 max-w-[12rem] justify-start gap-2 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground data-[state=open]:bg-accent/70 data-[state=open]:text-foreground"
          type="button"
          variant="ghost"
        >
          <PulseIcon size={14} />
          <span className="truncate">Daily Pulse</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden border-border/70 bg-background p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/70 bg-gradient-to-r from-slate-50 via-blue-50/40 to-cyan-50/30 px-6 pt-6 pb-4 text-left dark:from-slate-950 dark:via-blue-950/20 dark:to-cyan-950/20">
          <DialogTitle>Daily Pulse Questions</DialogTitle>
          <DialogDescription className="text-muted-foreground/90">
            Review and edit FAQ questions, then run them one by one.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-gradient-to-b from-background to-muted/20 px-6 py-5">
          {isLoading ? (
            <div className="rounded-xl border bg-background/80 px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
              Loading FAQ questions...
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-xl border bg-background/80 px-4 py-3 text-sm shadow-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Questions ready to run
                </span>
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  {nonEmptyCount}
                </span>
              </div>

              <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-background/85 p-3 shadow-sm">
                <div className="min-h-0 max-h-[48vh] space-y-2 overflow-y-auto pb-1 pr-1">
                  {questions.map((question, index) => (
                    <div
                      className="flex items-center gap-2 rounded-lg border border-transparent bg-muted/20 px-2 py-2 transition-colors hover:border-border/70 hover:bg-muted/35"
                      key={`daily-pulse-question-${index}`}
                    >
                      <Input
                        className="h-10 bg-background focus-visible:border-ring focus-visible:ring-0 focus-visible:ring-offset-0"
                        onChange={(event) => setQuestionAt(index, event.target.value)}
                        placeholder={`Question ${index + 1}`}
                        value={question}
                      />
                      <Button
                        className="h-10 shrink-0 px-3"
                        onClick={() => removeQuestionAt(index)}
                        type="button"
                        variant="outline"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-start">
                <Button className="h-9 shadow-sm" onClick={addQuestion} type="button" variant="outline">
                  Add Question
                </Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border/70 bg-background/95 px-6 py-4 backdrop-blur">
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setOpen(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                className="w-full shadow-sm sm:w-auto"
                disabled={isLoading || isSaving}
                onClick={saveOnly}
                type="button"
                variant="outline"
              >
                Save
              </Button>

              <Button
                className="w-full min-w-32 shadow-sm sm:w-auto"
                disabled={isLoading || isSaving}
                onClick={saveAndRun}
                type="button"
              >
                {isSaving ? "Saving..." : "Save and Run"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
