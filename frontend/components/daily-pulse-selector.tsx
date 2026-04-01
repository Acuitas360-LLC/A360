"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PulseIcon } from "@/components/icons";
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
        const response = await fetch("/api/daily-pulse", { cache: "no-store" });
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

  const saveAndRun = async () => {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: deduped }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to save FAQ questions");
      }

      const payload = (await response.json()) as DailyPulsePayload;
      const savedQuestions = Array.isArray(payload.questions)
        ? payload.questions.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        : deduped;

      onConfigured?.(savedQuestions);
      toast.success(`Started batch run for ${savedQuestions.length} questions`);
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save and run Daily Pulse"
      );
    } finally {
      setIsSaving(false);
    }
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

      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 pt-6 pb-4 text-left">
          <DialogTitle>Daily Pulse Questions</DialogTitle>
          <DialogDescription>
            Review and edit FAQ.csv questions, then run them one by one.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="rounded-lg border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              Loading FAQ.csv questions...
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                <span className="font-medium">Questions ready to run</span>
                <span className="font-medium text-muted-foreground">{nonEmptyCount}</span>
              </div>

              <div className="min-h-0 rounded-lg border bg-background p-3">
                <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                  {questions.map((question, index) => (
                    <div
                      className="flex items-center gap-2"
                      key={`daily-pulse-question-${index}`}
                    >
                      <Input
                        className="h-10 focus-visible:border-ring focus-visible:ring-0 focus-visible:ring-offset-0"
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
                <Button className="h-9" onClick={addQuestion} type="button" variant="outline">
                  Add Question
                </Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t bg-background/95 px-6 py-4">
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

            <Button
              className="w-full sm:w-auto"
              disabled={isLoading || isSaving}
              onClick={saveAndRun}
              type="button"
            >
              {isSaving ? "Saving..." : "Save and Run"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
