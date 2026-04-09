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

      "How are sales trending?",
      "Are we seeing strong short-term sales momentum?",
      "How is sales performance in the recent quarter?",
      "How has our sales performance evolved over the past year?",
      "Is Relmora gaining or losing market share?"

    ],
  },
  {
    id: "geography",
    label: "Geography",
    questions: [

      "Which regions are growing, and which are slowing down ?",
      "How do new account additions look across regions?",
      "How does account adoption look across regions?",
      "In which regions is Relmora gaining or losing market share?",

    ],
  },

  {
    id: "childAccounts",
    label: "Campus Accounts",
    questions: [

      "How do new account additions look by tier type?",
      "How does our breadth look?",
      "How are we performing in terms of adding new businesses?",
      "How does account adoption look within target campuses across campus tiers?",

    ],
  },
];

function PureSuggestedActions({
  chatId,
  sendMessage,
  selectedVisibilityType,
  onSuggestionSelected,
}: SuggestedActionsProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<
    StarterCategory["id"] | null
  >(null);

  const selectedCategory = useMemo(
    () =>
      !selectedCategoryId
        ? null
        :
        STARTER_QUESTION_CATEGORIES.find(
          (category) => category.id === selectedCategoryId
        ) ?? null,
    [selectedCategoryId]
  );

  useEffect(() => {
    setSelectedCategoryId(null);
  }, [selectedVisibilityType]);

  const categoryQuestions = selectedCategory?.questions ?? [];

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
      <p className="text-muted-foreground text-sm">
        Try asking questions related to...
      </p>

      <div className="flex flex-wrap gap-2">
        {STARTER_QUESTION_CATEGORIES.map((category) => {
          const isActive = category.id === selectedCategoryId;
          return (
            <Button
              className="h-8 rounded-full px-3"
              key={category.id}
              onClick={() => {
                setSelectedCategoryId((currentCategoryId) =>
                  currentCategoryId === category.id ? null : category.id
                );
              }}
              aria-pressed={isActive}
              size="sm"
              variant={isActive ? "default" : "outline"}
            >
              {category.label}
            </Button>
          );
        })}
      </div>

      {!!selectedCategory && (
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
      )}
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
