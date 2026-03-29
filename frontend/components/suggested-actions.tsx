"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { memo, useEffect, useMemo, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { Button } from "./ui/button";
import { Suggestion } from "./elements/suggestion";
import type { VisibilityType } from "./visibility-selector";

type SuggestedActionsProps = {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  selectedVisibilityType: VisibilityType;
  onSuggestionSelected?: () => void;
};

type StarterCategory = {
  id: "nation" | "geography" | "parentAccounts" | "childAccounts";
  label: string;
  questions: readonly string[];
};

const STARTER_QUESTION_CATEGORIES: readonly StarterCategory[] = [
  {
    id: "nation",
    label: "Nation",
    questions: [
      "Give me sales by week for recent 52 weeks?",
      "How much did sales grow in the recent 4 weeks?",
      "How many unique weeks of drug sales are available in the data?",
      "How much did drug sales grow in recent 4 weeks and how does that compare with growth in recent 8 weeks?",
    ],
  },
  {
    id: "geography",
    label: "Geography",
    questions: [
      "Provide weekly sales trend by area and nation.",
      "Provide weekly sales trend by region and nation.",
      "Provide sales contribution by area and estimate growth in recent 4 weeks compared to previous 4 weeks.",
      "Provide sales contribution by region and estimate growth in recent 4 weeks compared to previous 4 weeks.",
    ],
  },
  {
    id: "parentAccounts",
    label: "Parent Accounts",
    questions: [
      "What is the sales contribution of parent accounts by BC potential segment?",
      "What is the sales contribution of parent accounts which are academic, IDNs, and community?",
      "What is the sales growth in recent 4 weeks by parent account type and how does that compare with nation?",
      "What is the sales growth in recent 4 weeks by BC potential segment and how does that compare with nation?",
    ],
  },
  {
    id: "childAccounts",
    label: "Child Accounts",
    questions: [
      "What is the sales contribution of child accounts by BC potential segment?",
      "What is the sales contribution of child accounts which are academic and community?",
      "What is the sales growth in recent 4 weeks by child account type and how does that compare with nation?",
      "What is the sales growth in recent 4 weeks by child BC potential segment and how does that compare with nation?",
    ],
  },
];

const DEFAULT_CATEGORY_BY_VISIBILITY: Record<VisibilityType, StarterCategory["id"]> = {
  private: "nation",
  public: "geography",
};

function PureSuggestedActions({
  chatId,
  sendMessage,
  selectedVisibilityType,
  onSuggestionSelected,
}: SuggestedActionsProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<
    StarterCategory["id"]
  >(DEFAULT_CATEGORY_BY_VISIBILITY[selectedVisibilityType]);

  const selectedCategory = useMemo(
    () =>
      STARTER_QUESTION_CATEGORIES.find(
        (category) => category.id === selectedCategoryId
      ) ?? STARTER_QUESTION_CATEGORIES[0],
    [selectedCategoryId]
  );

  useEffect(() => {
    setSelectedCategoryId(DEFAULT_CATEGORY_BY_VISIBILITY[selectedVisibilityType]);
  }, [selectedVisibilityType]);

  const categoryQuestions = selectedCategory.questions;

  const sendStarterQuestion = (suggestion: string) => {
    onSuggestionSelected?.();
    window.history.pushState({}, "", `/chat/${chatId}`);
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: suggestion }],
    });
  };

  return (
    <div className="w-full space-y-3" data-testid="suggested-actions">
      <div className="flex flex-wrap gap-2">
        {STARTER_QUESTION_CATEGORIES.map((category) => {
          const isActive = category.id === selectedCategoryId;
          return (
            <Button
              className="h-8 rounded-full px-3"
              key={category.id}
              onClick={() => {
                setSelectedCategoryId(category.id);
              }}
              size="sm"
              variant={isActive ? "default" : "outline"}
            >
              {category.label}
            </Button>
          );
        })}
      </div>

      <div className="grid w-full gap-2 sm:grid-cols-2">
        {categoryQuestions.map((suggestedAction) => (
          <div className="h-full" key={`${selectedCategory.id}-${suggestedAction}`}>
            <Suggestion
              className="h-full min-h-[76px] w-full items-start justify-start whitespace-normal rounded-2xl px-4 py-2.5 text-left"
              onClick={sendStarterQuestion}
              suggestion={suggestedAction}
              title={suggestedAction}
              variant="outline"
            >
              <div className="line-clamp-3 text-sm leading-relaxed">{suggestedAction}</div>
            </Suggestion>
          </div>
        ))}
      </div>
    </div>
  );
}

export const SuggestedActions = memo(
  PureSuggestedActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }

    return true;
  }
);
