import type { UseChatHelpers } from "@ai-sdk/react";
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
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  selectedModelId: string;
  selectedVisibilityType: VisibilityType;
  onEditFailedResponse?: (errorMessageId: string) => void;
  onRetryFailedResponse?: (errorMessageId: string) => void;
  onNegativeFeedbackRetry?: (
    originalUserQuery: string,
    feedbackText: string
  ) => void;
};

function PureMessages({
  addToolApprovalResponse,
  chatId,
  status,
  votes,
  messages,
  setMessages,
  regenerate,
  isReadonly,
  selectedModelId: _selectedModelId,
  selectedVisibilityType,
  onEditFailedResponse,
  onRetryFailedResponse,
  onNegativeFeedbackRetry,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  const latestUserIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.role === "user")?.index;

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

  return (
    <div className="relative flex-1 bg-background">
      <div
        className="absolute inset-0 touch-pan-y overflow-y-auto bg-background"
        ref={messagesContainerRef}
      >
        <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {messages.length === 0 && <Greeting />}

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

          {(status === "submitted" ||
            (status === "streaming" && !hasVisibleAssistantMessageForCurrentTurn)) &&
            !messages.some((msg) =>
              msg.parts?.some(
                (part) => "state" in part && part.state === "approval-responded"
              )
            ) && <ThinkingMessage />}

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />
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
