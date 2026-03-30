import equal from "fast-deep-equal";
import { memo, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { useCopyToClipboard } from "usehooks-ts";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { Action, Actions } from "./elements/actions";
import { CopyIcon, PencilEditIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

const ERROR_RESPONSE_MARKER = "[[ERROR_RESPONSE]]";

export function PureMessageActions({
  chatId,
  message,
  vote,
  isLoading,
  setMode,
  previousUserQuery,
  onNegativeFeedbackRetry,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMode?: (mode: "view" | "edit") => void;
  previousUserQuery: string;
  onNegativeFeedbackRetry?: (
    originalUserQuery: string,
    feedbackText: string
  ) => void;
}) {
  const { mutate } = useSWRConfig();
  const [_, copyToClipboard] = useCopyToClipboard();
  const hasSubmittedFeedback = Boolean(vote);
  const [showDownvoteFeedback, setShowDownvoteFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmittingDownvoteFeedback, setIsSubmittingDownvoteFeedback] =
    useState(false);

  if (isLoading) {
    return null;
  }

  const textFromParts = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  const persistVoteState = (isUpvoted: boolean) => {
    mutate<Vote[]>(
      `/api/vote?chatId=${chatId}`,
      (currentVotes) => {
        if (!currentVotes) {
          return [];
        }

        const votesWithoutCurrent = currentVotes.filter(
          (currentVote) => currentVote.messageId !== message.id
        );

        return [
          ...votesWithoutCurrent,
          {
            chatId,
            messageId: message.id,
            isUpvoted,
          },
        ];
      },
      { revalidate: false }
    );
  };

  const isInlineErrorMessage =
    message.role === "assistant" &&
    message.parts?.some(
      (part) =>
        part.type === "text" && part.text.includes(ERROR_RESPONSE_MARKER)
    );

  if (isInlineErrorMessage) {
    return null;
  }

  const handleCopy = async () => {
    if (!textFromParts) {
      toast.error("There's no text to copy!");
      return;
    }

    await copyToClipboard(textFromParts);
    toast.success("Copied to clipboard!");
  };

  // User messages get edit (on hover) and copy actions
  if (message.role === "user") {
    return (
      <Actions className="-mr-0.5 justify-end">
        <div className="relative">
          {setMode && (
            <Action
              className="absolute top-0 -left-10 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/message:opacity-100"
              data-testid="message-edit-button"
              onClick={() => setMode("edit")}
              tooltip="Edit"
            >
              <PencilEditIcon />
            </Action>
          )}
          <Action onClick={handleCopy} tooltip="Copy">
            <CopyIcon />
          </Action>
        </div>
      </Actions>
    );
  }

  return (
    <Actions className="-ml-0.5">
      <Action onClick={handleCopy} tooltip="Copy">
        <CopyIcon />
      </Action>

      <Action
        data-testid="message-upvote"
        disabled={hasSubmittedFeedback}
        onClick={() => {
          const upvote = fetch("/api/vote", {
            method: "PATCH",
            body: JSON.stringify({
              chatId,
              messageId: message.id,
              type: "up",
              userQuery: previousUserQuery,
              assistantResponse: textFromParts,
            }),
          });

          toast.promise(upvote, {
            loading: "Upvoting Response...",
            success: () => {
              persistVoteState(true);

              return "Upvoted Response!";
            },
            error: "Failed to upvote response.",
          });
        }}
        tooltip="Upvote Response"
      >
        <ThumbUpIcon />
      </Action>

      <Action
        data-testid="message-downvote"
        disabled={hasSubmittedFeedback}
        onClick={() => {
          const downvote = fetch("/api/vote", {
            method: "PATCH",
            body: JSON.stringify({
              chatId,
              messageId: message.id,
              type: "down",
              userQuery: previousUserQuery,
              assistantResponse: textFromParts,
            }),
          });

          toast.promise(downvote, {
            loading: "Downvoting Response...",
            success: () => {
              persistVoteState(false);
              setShowDownvoteFeedback(true);

              return "Downvoted Response!";
            },
            error: "Failed to downvote response.",
          });
        }}
        tooltip="Downvote Response"
      >
        <ThumbDownIcon />
      </Action>

      {showDownvoteFeedback && (
        <div className="mt-2 w-full rounded-xl border bg-background p-3">
          <p className="mb-2 font-medium text-sm">What went wrong?</p>
          <Textarea
            className="min-h-[88px]"
            onChange={(event) => setFeedbackText(event.target.value)}
            placeholder="Share what was wrong so we can regenerate a better response..."
            value={feedbackText}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              disabled={isSubmittingDownvoteFeedback}
              onClick={async () => {
                const trimmed = feedbackText.trim();
                if (!trimmed) {
                  toast.error("Please describe what went wrong.");
                  return;
                }

                setIsSubmittingDownvoteFeedback(true);
                try {
                  const response = await fetch("/api/vote", {
                    method: "PATCH",
                    body: JSON.stringify({
                      chatId,
                      messageId: message.id,
                      type: "down",
                      feedbackText: trimmed,
                      userQuery: previousUserQuery,
                      assistantResponse: textFromParts,
                    }),
                  });

                  if (!response.ok) {
                    throw new Error("Failed to save detailed feedback.");
                  }

                  onNegativeFeedbackRetry?.(previousUserQuery, trimmed);
                  setShowDownvoteFeedback(false);
                  setFeedbackText("");
                  toast.success("Feedback saved. Retrying with your input.");
                } catch {
                  toast.error("Failed to save feedback details.");
                } finally {
                  setIsSubmittingDownvoteFeedback(false);
                }
              }}
              size="sm"
              type="button"
            >
              Submit and retry
            </Button>
            <Button
              disabled={isSubmittingDownvoteFeedback}
              onClick={() => {
                setShowDownvoteFeedback(false);
                setFeedbackText("");
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Actions>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => {
    if (!equal(prevProps.vote, nextProps.vote)) {
      return false;
    }
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (prevProps.previousUserQuery !== nextProps.previousUserQuery) {
      return false;
    }

    return true;
  }
);
