import type { UseChatHelpers } from "@ai-sdk/react";
import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { ArrowDownIcon } from "lucide-react";
import { useMessages } from "@/hooks/use-messages";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";
import type { VisibilityType } from "./visibility-selector";

type MessagesProps = {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  submitSequence: number;
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  selectedModelId: string;
  selectedVisibilityType: VisibilityType;
  isHydratingHistory: boolean;
  initialInputSlot?: ReactNode;
  onEditFailedResponse?: (errorMessageId: string) => void;
  onRetryFailedResponse?: (errorMessageId: string) => void;
  onNegativeFeedbackRetry?: (
    originalUserQuery: string,
    feedbackText: string,
    downvotedMessageId: string
  ) => void;
};

function PureMessages({
  addToolApprovalResponse,
  chatId,
  status,
  submitSequence,
  votes,
  messages,
  setMessages,
  regenerate,
  isReadonly,
  selectedModelId: _selectedModelId,
  selectedVisibilityType,
  isHydratingHistory,
  initialInputSlot,
  onEditFailedResponse,
  onRetryFailedResponse,
  onNegativeFeedbackRetry,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    onViewportLeave,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  const anchoredSequenceRef = useRef(0);
  const chartScrollSequenceRef = useRef(0);
  const lastAnchoredUserMessageIdRef = useRef<string | null>(null);
  const userMessageElementRefs = useRef(new Map<string, HTMLDivElement>());

  const latestUserMessageId = useMemo(
    () => [...messages].reverse().find((message) => message.role === "user")?.id,
    [messages]
  );

  const latestUserIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.role === "user")?.index;

  const hasAssistantStartedForCurrentTurn =
    typeof latestUserIndex === "number"
      ? messages
          .slice(latestUserIndex + 1)
          .some((message) => message.role === "assistant")
      : false;

  useEffect(() => {
    if (submitSequence <= anchoredSequenceRef.current) {
      return;
    }

    // If assistant content has already started for this turn, do not anchor late.
    if (hasAssistantStartedForCurrentTurn) {
      anchoredSequenceRef.current = submitSequence;
      return;
    }

    if (!latestUserMessageId) {
      return;
    }

    // Submit can fire before the new user message is appended. In that case,
    // wait for a different latest user message id instead of anchoring the old one.
    if (latestUserMessageId === lastAnchoredUserMessageIdRef.current) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 10;

    const anchorLatestUserMessage = () => {
      if (cancelled) {
        return;
      }

      const container = messagesContainerRef.current;
      const messageNode = userMessageElementRefs.current.get(latestUserMessageId);

      if (!container || !messageNode) {
        attempts += 1;
        if (attempts <= maxAttempts) {
          requestAnimationFrame(anchorLatestUserMessage);
        }
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const messageRect = messageNode.getBoundingClientRect();
      const messageTopWithinContainer =
        messageRect.top - containerRect.top + container.scrollTop;
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      const topOffset = isDesktop ? 24 : 16;
      const messageTopInViewport = messageRect.top - containerRect.top;
      const isAlreadyNearTarget =
        messageTopInViewport >= topOffset - 16 &&
        messageTopInViewport <= topOffset + 24;

      if (isAlreadyNearTarget) {
        lastAnchoredUserMessageIdRef.current = latestUserMessageId;
        anchoredSequenceRef.current = submitSequence;
        return;
      }

      const targetTop = Math.max(0, messageTopWithinContainer - topOffset);
      const maxScrollableTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const boundedTargetTop = Math.min(targetTop, maxScrollableTop);

      // Anchor once, bounded by the current bottom limit. Do not re-anchor later
      // as assistant content grows, otherwise the viewport can jump unexpectedly.
      container.scrollTo({ top: boundedTargetTop, behavior: "instant" });
      onViewportLeave();
      lastAnchoredUserMessageIdRef.current = latestUserMessageId;
      anchoredSequenceRef.current = submitSequence;
    };

    requestAnimationFrame(anchorLatestUserMessage);

    return () => {
      cancelled = true;
    };
  }, [
    hasAssistantStartedForCurrentTurn,
    latestUserMessageId,
    messagesContainerRef,
    onViewportLeave,
    submitSequence,
  ]);

  const hasVisibleAssistantMessageForCurrentTurn =
    typeof latestUserIndex === "number"
      ? messages.slice(latestUserIndex + 1).some((message) => {
          if (message.role !== "assistant") {
            return false;
          }

          return message.parts.some((part) => {
            if (part.type === "text") {
              return Boolean(part.text?.trim());
            }

            return (
              part.type === "data-resultSummary" ||
              part.type === "data-sqlQuery" ||
              part.type === "data-sqlColumns" ||
              part.type === "data-sqlResult" ||
              part.type === "data-sqlRowCount" ||
              part.type === "data-visualizationCode" ||
              part.type === "data-visualizationSpec" ||
              part.type === "data-visualizationFigure" ||
              part.type === "data-visualizationMeta" ||
              part.type === "data-relevantQuestions"
            );
          });
        })
      : messages.some((message) => {
          if (message.role !== "assistant") {
            return false;
          }

          return message.parts.some((part) => {
            if (part.type === "text") {
              return Boolean(part.text?.trim());
            }

            return (
              part.type === "data-resultSummary" ||
              part.type === "data-sqlQuery" ||
              part.type === "data-sqlColumns" ||
              part.type === "data-sqlResult" ||
              part.type === "data-sqlRowCount" ||
              part.type === "data-visualizationCode" ||
              part.type === "data-visualizationSpec" ||
              part.type === "data-visualizationFigure" ||
              part.type === "data-visualizationMeta" ||
              part.type === "data-relevantQuestions"
            );
          });
        });

  const progressStagesForCurrentTurn =
    typeof latestUserIndex === "number"
      ? [...messages.slice(latestUserIndex + 1)]
          .reverse()
          .find((message) => message.role === "assistant")
          ?.parts
          .slice()
          .reverse()
          .find((part) => part.type === "data-progressStages")
      : undefined;

  const currentTurnProgressStages =
    progressStagesForCurrentTurn &&
    "data" in progressStagesForCurrentTurn &&
    Array.isArray(progressStagesForCurrentTurn.data)
      ? progressStagesForCurrentTurn.data
      : [];

  const hasChartForCurrentTurn =
    typeof latestUserIndex === "number"
      ? messages.slice(latestUserIndex + 1).some((message) => {
          if (message.role !== "assistant") {
            return false;
          }

          return message.parts.some((part) => {
            if (part.type === "data-visualizationFigure") {
              const figurePart = part as {
                type: "data-visualizationFigure";
                data?: { data?: unknown[] };
              };

              return Boolean(figurePart.data?.data?.length);
            }

            return false;
          });
        })
      : false;

  const hasSummaryForCurrentTurn =
    typeof latestUserIndex === "number"
      ? messages.slice(latestUserIndex + 1).some((message) => {
          if (message.role !== "assistant") {
            return false;
          }

          return message.parts.some((part) => part.type === "data-resultSummary");
        })
      : false;

  const hasTableForCurrentTurn =
    typeof latestUserIndex === "number"
      ? messages.slice(latestUserIndex + 1).some((message) => {
          if (message.role !== "assistant") {
            return false;
          }

          return message.parts.some((part) => part.type === "data-sqlResult");
        })
      : false;

  useEffect(() => {
    if (submitSequence <= 0) {
      return;
    }

    if (!hasChartForCurrentTurn || !hasSummaryForCurrentTurn || !hasTableForCurrentTurn) {
      return;
    }

    if (chartScrollSequenceRef.current >= submitSequence) {
      return;
    }

    const firstNudge = window.setTimeout(() => {
      scrollToBottom("smooth");
    }, 420);

    // Plotly/chart containers can resize after initial mount.
    // A second nudge keeps the chart in view after the final layout settles.
    const secondNudge = window.setTimeout(() => {
      scrollToBottom("smooth");
    }, 980);

    const followUntil = Date.now() + 1800;
    const followInterval = window.setInterval(() => {
      if (Date.now() > followUntil) {
        window.clearInterval(followInterval);
        return;
      }

      scrollToBottom("smooth");
    }, 220);

    chartScrollSequenceRef.current = submitSequence;

    return () => {
      window.clearTimeout(firstNudge);
      window.clearTimeout(secondNudge);
      window.clearInterval(followInterval);
    };
  }, [
    hasChartForCurrentTurn,
    hasSummaryForCurrentTurn,
    hasTableForCurrentTurn,
    scrollToBottom,
    submitSequence,
  ]);

  return (
    <div className="relative flex-1 bg-background">
      <div
        className="absolute inset-0 touch-pan-y overflow-y-auto bg-background"
        ref={messagesContainerRef}
      >
        <div className="mx-auto flex min-w-0 max-w-5xl flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {isHydratingHistory && messages.length === 0 && (
            <div className="flex flex-col gap-3 pt-2">
              <div className="h-5 w-40 animate-pulse rounded bg-muted/50" />
              <div className="h-14 w-full animate-pulse rounded-xl bg-muted/40" />
              <div className="h-14 w-[90%] animate-pulse rounded-xl bg-muted/35" />
              <div className="h-14 w-[86%] animate-pulse rounded-xl bg-muted/30" />
            </div>
          )}

          {!isHydratingHistory && messages.length === 0 && (
            <>
              <Greeting />
              <div>{initialInputSlot}</div>
            </>
          )}

          {messages.map((message, index) => (
            <PreviewMessage
              addToolApprovalResponse={addToolApprovalResponse}
              chatId={chatId}
              isLoading={
                status === "streaming" && messages.length - 1 === index
              }
              isReadonly={isReadonly}
              key={message.id}
              message={message}
              onEditFailedResponse={onEditFailedResponse}
              onNegativeFeedbackRetry={onNegativeFeedbackRetry}
              onRetryFailedResponse={onRetryFailedResponse}
              previousUserQuery={
                [...messages.slice(0, index)]
                  .reverse()
                  .find((candidate) => candidate.role === "user")
                  ?.parts?.filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join("\n")
                  .trim() || ""
              }
              regenerate={regenerate}
              rootRef={
                message.role === "user"
                  ? (element) => {
                      if (!element) {
                        userMessageElementRefs.current.delete(message.id);
                        return;
                      }

                      userMessageElementRefs.current.set(message.id, element);
                    }
                  : undefined
              }
              requiresScrollPadding={
                hasSentMessage && index === messages.length - 1
              }
              selectedVisibilityType={selectedVisibilityType}
              setMessages={setMessages}
              vote={
                votes
                  ? votes.find((vote) => vote.messageId === message.id)
                  : undefined
              }
            />
          ))}

          {((status === "submitted" || status === "streaming") &&
            !hasVisibleAssistantMessageForCurrentTurn) &&
            !messages.some((msg) =>
              msg.parts?.some(
                (part) => "state" in part && part.state === "approval-responded"
              )
            ) && (
              <ThinkingMessage progressStages={currentTurnProgressStages} />
            )}

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />

          {messages.length > 0 && (
            <div aria-hidden="true" className="h-[45vh] w-full shrink-0" />
          )}
        </div>
      </div>

      <button
        aria-label="Scroll to bottom"
        className={`absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background p-2 shadow-lg transition-all hover:bg-muted ${
          isAtBottom
            ? "pointer-events-none scale-0 opacity-0"
            : "pointer-events-auto scale-100 opacity-100"
        }`}
        onClick={() => scrollToBottom("smooth")}
        type="button"
      >
        <ArrowDownIcon className="size-4" />
      </button>
    </div>
  );
}

export const Messages = PureMessages;
