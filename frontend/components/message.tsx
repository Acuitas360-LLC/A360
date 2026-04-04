"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import { useState } from "react";
import { AnalyticsInsight } from "@/components/analytics-demo";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { DocumentToolResult } from "./document";
import { DocumentPreview } from "./document-preview";
import { MessageContent } from "./elements/message";
import { Response } from "./elements/response";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "./elements/tool";
import { SparklesIcon } from "./icons";
import { MessageActions } from "./message-actions";
import { MessageEditor } from "./message-editor";
import { MessageReasoning } from "./message-reasoning";
import { PreviewAttachment } from "./preview-attachment";
import { SQLTransparencyPanel } from "./sql-transparency-panel";
import { Button } from "./ui/button";
import type { VisibilityType } from "./visibility-selector";
import { Weather } from "./weather";

const ANALYTICS_RESPONSE_MARKER = "[[ANALYTICS_52_WEEKS_RESPONSE]]";
const ERROR_RESPONSE_MARKER = "[[ERROR_RESPONSE]]";

const PurePreviewMessage = ({
  addToolApprovalResponse,
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  regenerate,
  isReadonly,
  requiresScrollPadding: _requiresScrollPadding,
  rootRef,
  selectedVisibilityType,
  onEditFailedResponse,
  onRetryFailedResponse,
  onNegativeFeedbackRetry,
  previousUserQuery,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
  rootRef?: (element: HTMLDivElement | null) => void;
  selectedVisibilityType: VisibilityType;
  onEditFailedResponse?: (errorMessageId: string) => void;
  onRetryFailedResponse?: (errorMessageId: string) => void;
  onNegativeFeedbackRetry?: (
    originalUserQuery: string,
    feedbackText: string
  ) => void;
  previousUserQuery: string;
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );

  const sqlQuery = message.parts.find(
    (part) => part.type === "data-sqlQuery"
  ) as { type: "data-sqlQuery"; data: string } | undefined;
  const resultSummary = message.parts.find(
    (part) => part.type === "data-resultSummary"
  ) as { type: "data-resultSummary"; data: string } | undefined;
  const sqlColumns = message.parts.find(
    (part) => part.type === "data-sqlColumns"
  ) as { type: "data-sqlColumns"; data: string[] } | undefined;
  const sqlResult = message.parts.find(
    (part) => part.type === "data-sqlResult"
  ) as
    | {
        type: "data-sqlResult";
        data: { columns?: string[]; data?: Array<Record<string, unknown>> };
      }
    | undefined;
  const sqlRowCount = message.parts.find(
    (part) => part.type === "data-sqlRowCount"
  ) as { type: "data-sqlRowCount"; data: number } | undefined;
  const latestSqlColumns = [...message.parts]
    .reverse()
    .find((part) => part.type === "data-sqlColumns") as
    | { type: "data-sqlColumns"; data: string[] }
    | undefined;
  const latestSqlResult = [...message.parts]
    .reverse()
    .find((part) => part.type === "data-sqlResult") as
    | {
        type: "data-sqlResult";
        data: { columns?: string[]; data?: Array<Record<string, unknown>> };
      }
    | undefined;
  const latestSqlRowCount = [...message.parts]
    .reverse()
    .find((part) => part.type === "data-sqlRowCount") as
    | { type: "data-sqlRowCount"; data: number }
    | undefined;
  const visualizationCode = [...message.parts]
    .reverse()
    .find((part) => part.type === "data-visualizationCode") as
    | { type: "data-visualizationCode"; data: string }
    | undefined;
  const visualizationSpec = [...message.parts]
    .reverse()
    .find((part) => part.type === "data-visualizationSpec") as
    | { type: "data-visualizationSpec"; data: string }
    | undefined;
  const visualizationFigure = [...message.parts]
    .reverse()
    .find((part) => part.type === "data-visualizationFigure") as
    | {
        type: "data-visualizationFigure";
        data: {
          data?: unknown[];
          layout?: Record<string, unknown>;
          frames?: unknown[];
          config?: Record<string, unknown>;
        };
      }
    | undefined;
  const visualizationMeta = [...message.parts]
    .reverse()
    .find((part) => part.type === "data-visualizationMeta") as
    | {
        type: "data-visualizationMeta";
        data: {
          source?: string;
          source_row_count?: number;
          source_column_count?: number;
          source_columns?: string[];
          source_data_sha256?: string;
          visualization_code_sha256?: string;
          plotly_trace_count?: number;
        };
      }
    | undefined;
  const relevantQuestionsParts = message.parts.filter(
    (part) => part.type === "data-relevantQuestions"
  ) as Array<{ type: "data-relevantQuestions"; data: string[] }>;

  const relevantQuestions = [...relevantQuestionsParts]
    .reverse()
    .find((part) => Array.isArray(part.data) && part.data.length > 0);

  const hasStructuredInsightData = Boolean(
    sqlQuery?.data ||
      resultSummary?.data ||
      (latestSqlColumns?.data && latestSqlColumns.data.length > 0) ||
      (latestSqlResult?.data?.data && latestSqlResult.data.data.length > 0) ||
      typeof latestSqlRowCount?.data === "number" ||
      visualizationCode?.data ||
      visualizationSpec?.data ||
      (visualizationFigure?.data?.data && visualizationFigure.data.data.length > 0) ||
      relevantQuestions?.data?.length
  );

  const hasInlineErrorText = message.parts.some(
    (part) =>
      part.type === "text" &&
      message.role === "assistant" &&
      part.text.includes(ERROR_RESPONSE_MARKER)
  );
  const hasAssistantNarrativeText = message.parts.some(
    (part) =>
      part.type === "text" &&
      message.role === "assistant" &&
      part.text.trim().length > 0 &&
      !part.text.includes(ERROR_RESPONSE_MARKER) &&
      !part.text.includes(ANALYTICS_RESPONSE_MARKER)
  );

  const hasReasoningText = message.parts.some(
    (part) => part.type === "reasoning" && part.text?.trim().length > 0
  );

  const hasToolContent = message.parts.some((part) =>
    part.type.startsWith("tool-")
  );

  const hasRenderableAssistantContent =
    hasInlineErrorText ||
    hasAssistantNarrativeText ||
    hasStructuredInsightData ||
    hasReasoningText ||
    hasToolContent ||
    attachmentsFromMessage.length > 0;

  if (message.role === "assistant" && !hasRenderableAssistantContent) {
    return null;
  }

  return (
    <div
      className="group/message fade-in w-full animate-in duration-300"
      data-role={message.role}
      data-testid={`message-${message.role}`}
      ref={rootRef}
    >
      <div
        className={cn("relative flex w-full items-start gap-3 md:gap-4", {
          "justify-end": message.role === "user" && mode !== "edit",
          "justify-start": message.role === "assistant",
          "pl-2": message.role === "assistant",
        })}
      >
        {message.role === "assistant" && (
          <div className="pointer-events-none hidden size-8 items-center justify-center rounded-full bg-background ring-1 ring-border xl:absolute xl:left-0 xl:top-0 xl:flex xl:-translate-x-[calc(100%+0.5rem)]">
            <SparklesIcon size={14} />
          </div>
        )}

        <div
          className={cn("flex flex-col", {
            "gap-3 md:gap-4": message.parts?.some(
              (p) => p.type === "text" && p.text?.trim()
            ),
            "min-w-0 flex-1": message.role === "assistant" || mode === "edit",
            "max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]":
              message.role === "user" && mode !== "edit",
          },
          message.role === "assistant" &&
            mode === "view" &&
            "response-shell"
          )}
        >
          {attachmentsFromMessage.length > 0 && (
            <div
              className="flex flex-row justify-end gap-2"
              data-testid={"message-attachments"}
            >
              {attachmentsFromMessage.map((attachment) => (
                <PreviewAttachment
                  attachment={{
                    name: attachment.filename ?? "file",
                    contentType: attachment.mediaType,
                    url: attachment.url,
                  }}
                  key={attachment.url}
                />
              ))}
            </div>
          )}

          {message.parts?.map((part, index) => {
            const { type } = part;
            const key = `message-${message.id}-part-${index}`;

            if (type.startsWith("data-")) {
              return null;
            }

            if (type === "reasoning") {
              const hasContent = part.text?.trim().length > 0;
              if (hasContent) {
                const isStreaming =
                  "state" in part && part.state === "streaming";
                return (
                  <MessageReasoning
                    isLoading={isLoading || isStreaming}
                    key={key}
                    reasoning={part.text}
                  />
                );
              }
            }

            if (type === "text") {
              if (mode === "view") {
                if (
                  message.role === "assistant" &&
                  part.text.includes(ANALYTICS_RESPONSE_MARKER)
                ) {
                  return (
                    <div className="w-full" key={key}>
                      <AnalyticsInsight />
                    </div>
                  );
                }

                if (
                  message.role === "assistant" &&
                  part.text.includes(ERROR_RESPONSE_MARKER)
                ) {
                  const errorText = part.text
                    .replace(ERROR_RESPONSE_MARKER, "")
                    .trim();

                  return (
                    <div className="w-full" key={key}>
                      <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                        <p className="font-medium text-sm">I couldn't generate a response.</p>
                        <p className="mt-1 text-muted-foreground text-sm">
                          {errorText ||
                            "Something went wrong while processing your request. Please try again."}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button
                            onClick={() => onRetryFailedResponse?.(message.id)}
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            Retry
                          </Button>
                          <Button
                            onClick={() => onEditFailedResponse?.(message.id)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Edit and resend
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className={cn("w-full", message.role === "assistant" && "response-section")} key={key}>
                    <MessageContent
                      className={cn({
                        "wrap-break-word w-fit rounded-3xl bg-primary px-4 py-2.5 text-right text-primary-foreground":
                          message.role === "user",
                        "w-full rounded-none border-0 bg-transparent px-0 py-0 text-left shadow-none":
                          message.role === "assistant",
                      })}
                      data-testid="message-content"
                    >
                      <Response>{sanitizeText(part.text)}</Response>
                    </MessageContent>
                  </div>
                );
              }

              if (mode === "edit") {
                return (
                  <div
                    className="flex w-full flex-row items-start gap-3"
                    key={key}
                  >
                    <div className="size-8" />
                    <div className="min-w-0 flex-1">
                      <MessageEditor
                        key={message.id}
                        message={message}
                        regenerate={regenerate}
                        setMessages={setMessages}
                        setMode={setMode}
                      />
                    </div>
                  </div>
                );
              }
            }

            if (type === "tool-getWeather") {
              const { toolCallId, state } = part;
              const approvalId = (part as { approval?: { id: string } })
                .approval?.id;
              const isDenied =
                state === "output-denied" ||
                (state === "approval-responded" &&
                  (part as { approval?: { approved?: boolean } }).approval
                    ?.approved === false);
              const widthClass = "w-[min(100%,450px)]";

              if (state === "output-available") {
                return (
                  <div className={widthClass} key={toolCallId}>
                    <Weather weatherAtLocation={part.output} />
                  </div>
                );
              }

              if (isDenied) {
                return (
                  <div className={widthClass} key={toolCallId}>
                    <Tool className="w-full" defaultOpen={true}>
                      <ToolHeader
                        state="output-denied"
                        type="tool-getWeather"
                      />
                      <ToolContent>
                        <div className="px-4 py-3 text-muted-foreground text-sm">
                          Weather lookup was denied.
                        </div>
                      </ToolContent>
                    </Tool>
                  </div>
                );
              }

              if (state === "approval-responded") {
                return (
                  <div className={widthClass} key={toolCallId}>
                    <Tool className="w-full" defaultOpen={true}>
                      <ToolHeader state={state} type="tool-getWeather" />
                      <ToolContent>
                        <ToolInput input={part.input} />
                      </ToolContent>
                    </Tool>
                  </div>
                );
              }

              return (
                <div className={widthClass} key={toolCallId}>
                  <Tool className="w-full" defaultOpen={true}>
                    <ToolHeader state={state} type="tool-getWeather" />
                    <ToolContent>
                      {(state === "input-available" ||
                        state === "approval-requested") && (
                        <ToolInput input={part.input} />
                      )}
                      {state === "approval-requested" && approvalId && (
                        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                          <button
                            className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => {
                              addToolApprovalResponse({
                                id: approvalId,
                                approved: false,
                                reason: "User denied weather lookup",
                              });
                            }}
                            type="button"
                          >
                            Deny
                          </button>
                          <button
                            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm transition-colors hover:bg-primary/90"
                            onClick={() => {
                              addToolApprovalResponse({
                                id: approvalId,
                                approved: true,
                              });
                            }}
                            type="button"
                          >
                            Allow
                          </button>
                        </div>
                      )}
                    </ToolContent>
                  </Tool>
                </div>
              );
            }

            if (type === "tool-createDocument") {
              const { toolCallId } = part;

              if (part.output && "error" in part.output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error creating document: {String(part.output.error)}
                  </div>
                );
              }

              return (
                <DocumentPreview
                  isReadonly={isReadonly}
                  key={toolCallId}
                  result={part.output}
                />
              );
            }

            if (type === "tool-updateDocument") {
              const { toolCallId } = part;

              if (part.output && "error" in part.output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error updating document: {String(part.output.error)}
                  </div>
                );
              }

              return (
                <div className="relative" key={toolCallId}>
                  <DocumentPreview
                    args={{ ...part.output, isUpdate: true }}
                    isReadonly={isReadonly}
                    result={part.output}
                  />
                </div>
              );
            }

            if (type === "tool-requestSuggestions") {
              const { toolCallId, state } = part;

              return (
                <Tool defaultOpen={true} key={toolCallId}>
                  <ToolHeader state={state} type="tool-requestSuggestions" />
                  <ToolContent>
                    {state === "input-available" && (
                      <ToolInput input={part.input} />
                    )}
                    {state === "output-available" && (
                      <ToolOutput
                        errorText={undefined}
                        output={
                          "error" in part.output ? (
                            <div className="rounded border p-2 text-red-500">
                              Error: {String(part.output.error)}
                            </div>
                          ) : (
                            <DocumentToolResult
                              isReadonly={isReadonly}
                              result={part.output}
                              type="request-suggestions"
                            />
                          )
                        }
                      />
                    )}
                  </ToolContent>
                </Tool>
              );
            }

            return null;
          })}

          {message.role === "assistant" &&
            !isLoading &&
            !hasInlineErrorText &&
            (hasAssistantNarrativeText || hasStructuredInsightData) && (
            <SQLTransparencyPanel
              columns={latestSqlColumns?.data || latestSqlResult?.data?.columns}
              queryRows={latestSqlResult?.data?.data}
              relevantQuestions={relevantQuestions?.data}
              resultSummary={resultSummary?.data}
              showResultSummary={false}
              rowCount={latestSqlRowCount?.data}
              selectedVisibilityType={selectedVisibilityType}
              sqlQuery={sqlQuery?.data}
              visualizationCode={visualizationCode?.data}
              visualizationSpec={visualizationSpec?.data}
              visualizationFigure={visualizationFigure?.data}
              visualizationMeta={visualizationMeta?.data}
            />
          )}

          {!isReadonly && (
            <div className={cn(message.role === "assistant" && mode === "view" && "response-utility-row")}>
              <MessageActions
                chatId={chatId}
                isLoading={isLoading}
                key={`action-${message.id}`}
                message={message}
                onNegativeFeedbackRetry={onNegativeFeedbackRetry}
                previousUserQuery={previousUserQuery}
                setMode={setMode}
                vote={vote}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const PreviewMessage = PurePreviewMessage;

export const ThinkingMessage = () => {
  return (
    <div
      className="group/message fade-in w-full animate-in duration-300"
      data-role="assistant"
      data-testid="message-assistant-loading"
    >
      <div className="relative flex items-start justify-start gap-3">
        <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border md:absolute md:-left-10 md:top-0">
          <div className="animate-pulse">
            <SparklesIcon size={14} />
          </div>
        </div>

        <div className="response-shell flex min-w-0 w-full flex-col gap-2 md:gap-4">
          <div className="flex items-center gap-1 p-0 text-muted-foreground text-sm">
            <span className="animate-pulse">Thinking</span>
            <span className="inline-flex">
              <span className="animate-bounce [animation-delay:0ms]">.</span>
              <span className="animate-bounce [animation-delay:150ms]">.</span>
              <span className="animate-bounce [animation-delay:300ms]">.</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
