import equal from "fast-deep-equal";
import { memo, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { useCopyToClipboard } from "usehooks-ts";
import type { Vote } from "@/lib/db/schema";
import { withBrowserAuthHeaders } from "@/lib/iframe-auth";
import type { ChatMessage } from "@/lib/types";
import { Action, Actions } from "./elements/actions";
import { CopyIcon, PencilEditIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

const ERROR_RESPONSE_MARKER = "[[ERROR_RESPONSE]]";
const RETRIABLE_VOTE_DELAYS_MS = [250, 500, 1000, 1500] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

type VotePatchPayload = {
  chatId: string;
  messageId: string;
  phase: "rating_only" | "feedback_only" | "enrich_only";
  type: "up" | "down";
  feedbackText?: string;
  userQuery?: string;
  assistantResponse?: string;
};

async function patchVoteWithRetry(payload: VotePatchPayload): Promise<Response> {
  let lastDetail = "Vote save failed.";

  for (const retryDelayMs of RETRIABLE_VOTE_DELAYS_MS) {
    const response = await fetch("/api/vote", {
      method: "PATCH",
      headers: withBrowserAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return response;
    }

    const body = (await response.json().catch(() => null)) as
      | { retriable?: boolean; detail?: string }
      | null;
    lastDetail = body?.detail?.trim() || `Vote save failed (${response.status})`;

    const retriable = response.status === 409 && Boolean(body?.retriable);
    if (!retriable) {
      throw new Error(lastDetail);
    }

    await delay(retryDelayMs);
  }

  throw new Error(lastDetail);
}

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
    feedbackText: string,
    downvotedMessageId: string
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
      <Actions className="mt-1 -mr-0.5 justify-end">
        <div className="relative">
          {setMode && (
            <Action
              className="absolute top-0 -left-10 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/message:opacity-100"
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
    <Actions className="mt-1.5 pl-0.5 md:pl-0">
      <Action onClick={handleCopy} tooltip="Copy">
        <CopyIcon />
      </Action>

      <Action
        data-testid="message-upvote"
        disabled={hasSubmittedFeedback}
        onClick={() => {
          // Optimistic update so UI reflects the vote instantly.
          persistVoteState(true);

          const upvote = patchVoteWithRetry({
            chatId,
            messageId: message.id,
            phase: "rating_only",
            type: "up",
          });

          toast.promise(upvote, {
            loading: "Upvoting Response...",
            success: () => "Upvoted Response!",
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
          // Optimistic update so UI reflects the vote instantly.
          persistVoteState(false);

          const downvote = patchVoteWithRetry({
            chatId,
            messageId: message.id,
            phase: "rating_only",
            type: "down",
          });

          toast.promise(downvote, {
            loading: "Downvoting Response...",
            success: () => {
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
        <div className="response-evidence mt-2 w-full p-3">
          <p className="mb-2 font-medium text-sm">What went wrong?</p>
          <Textarea
            className="min-h-[88px] bg-background/80"
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
                  // Trigger feedback query immediately; persist feedback text in parallel.
                  onNegativeFeedbackRetry?.(
                    previousUserQuery,
                    trimmed,
                    message.id
                  );
                  setShowDownvoteFeedback(false);
                  setFeedbackText("");

                  const saveFeedbackPromise = patchVoteWithRetry({
                    chatId,
                    messageId: message.id,
                    phase: "feedback_only",
                    type: "down",
                    feedbackText: trimmed,
                  });

                  await saveFeedbackPromise;
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
