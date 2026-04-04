"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { ChatHeader } from "@/components/chat-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useArtifactSelector } from "@/hooks/use-artifact";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import type { Vote } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { useStreamingStore } from "@/lib/streaming-store";
import type { Attachment, ChatMessage } from "@/lib/types";
import { fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { Artifact } from "./artifact";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { getChatHistoryPaginationKey } from "./sidebar-history";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";

const ANALYTICS_DEMO_TRIGGER = "give me my last 52 weeks analytics";
const ANALYTICS_RESPONSE_MARKER = "[[ANALYTICS_52_WEEKS_RESPONSE]]";
const ERROR_RESPONSE_MARKER = "[[ERROR_RESPONSE]]";
const ANALYTICS_RESPONSE_DELAY_MS = 1200;

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume: _autoResume,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
}) {
  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();
  const enqueueDataPart = useStreamingStore((state) => state.enqueueDataPart);
  const flushQueuedDataParts = useStreamingStore(
    (state) => state.flushQueuedDataParts
  );
  const resetStreamState = useStreamingStore((state) => state.resetStreamState);
  const beginRun = useStreamingStore((state) => state.beginRun);
  const endRun = useStreamingStore((state) => state.endRun);

  const [input, setInput] = useState<string>("");
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const [submitSequence, setSubmitSequence] = useState(0);
  const [bulkQueue, setBulkQueue] = useState<{
    active: boolean;
    questions: string[];
    index: number;
  }>({ active: false, questions: [], index: 0 });
  const handleSubmitTriggered = useCallback(() => {
    setSubmitSequence((current) => current + 1);
  }, []);
  const bulkDispatchInFlightRef = useRef(false);
  const previousStatusRef = useRef("ready");
  const bulkQueueRef = useRef<{ questions: string[]; index: number }>({
    questions: [],
    index: 0,
  });
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [failedPromptByErrorMessageId, setFailedPromptByErrorMessageId] =
    useState<Record<string, string>>({});
  const [pendingFeedbackRetry, setPendingFeedbackRetry] = useState<
    { text: string } | null
  >(null);
  const currentModelIdRef = useRef(currentModelId);
  const analyticsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    addToolApprovalResponse,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    generateId: generateUUID,
    sendAutomaticallyWhen: ({ messages: currentMessages }) => {
      const lastMessage = currentMessages.at(-1);
      const shouldContinue =
        lastMessage?.parts?.some(
          (part) =>
            "state" in part &&
            part.state === "approval-responded" &&
            "approval" in part &&
            (part.approval as { approved?: boolean })?.approved === true
        ) ?? false;
      return shouldContinue;
    },
    transport: new DefaultChatTransport({
      api: "/api/chat",
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        const lastMessage = request.messages.at(-1);
        const isToolApprovalContinuation =
          lastMessage?.role !== "user" ||
          request.messages.some((msg) =>
            msg.parts?.some((part) => {
              const state = (part as { state?: string }).state;
              return (
                state === "approval-responded" || state === "output-denied"
              );
            })
          );

        return {
          body: {
            id: request.id,
            ...(isToolApprovalContinuation
              ? { messages: request.messages }
              : { message: lastMessage }),
            selectedChatModel: currentModelIdRef.current,
            selectedVisibilityType: visibilityType,
            ...request.body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      enqueueDataPart(dataPart);
    },
    onFinish: () => {
      flushQueuedDataParts();
      endRun();
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(`chat:${id}:pendingResume`);
        window.sessionStorage.removeItem(`chat:${id}:lastRequestFailed`);
      }
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      flushQueuedDataParts();
      endRun();
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(`chat:${id}:pendingResume`);
        window.sessionStorage.setItem(`chat:${id}:lastRequestFailed`, "1");
      }

      const hasUsableAssistantResponseForCurrentTurn = (() => {
        const lastUserIndex = [...messages]
          .map((msg, idx) => ({ msg, idx }))
          .reverse()
          .find(({ msg }) => msg.role === "user")?.idx;

        if (typeof lastUserIndex !== "number") {
          return false;
        }

        return messages.slice(lastUserIndex + 1).some((msg) => {
          if (msg.role !== "assistant") {
            return false;
          }

          const hasNormalText = msg.parts?.some(
            (part) =>
              part.type === "text" &&
              part.text.trim().length > 0 &&
              !part.text.includes(ERROR_RESPONSE_MARKER)
          );

          const hasStructuredResult = msg.parts?.some(
            (part) =>
              part.type === "data-resultSummary" ||
              part.type === "data-sqlResult" ||
              part.type === "data-visualizationFigure"
          );

          return Boolean(hasNormalText || hasStructuredResult);
        });
      })();

      const lastUserMessage = [...messages]
        .reverse()
        .find((msg) => msg.role === "user");
      const lastUserText =
        lastUserMessage?.parts
          ?.filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n")
          .trim() || "";

      const inlineErrorText =
        error instanceof ChatbotError
          ? error.message
          : "Something went wrong while processing your request.";

      const inlineErrorMessageId = generateUUID();

      if (lastUserText) {
        setFailedPromptByErrorMessageId((current) => ({
          ...current,
          [inlineErrorMessageId]: lastUserText,
        }));
      }

      setMessages((currentMessages) => {
        const alreadyHasErrorMessage = currentMessages.some(
          (msg) =>
            msg.role === "assistant" &&
            msg.parts?.some(
              (part) =>
                part.type === "text" &&
                part.text.includes(ERROR_RESPONSE_MARKER)
            )
        );

        // If we already produced a usable assistant response for the latest
        // user prompt, avoid appending a second synthetic failure block.
        const lastUserIndex = [...currentMessages]
          .map((msg, idx) => ({ msg, idx }))
          .reverse()
          .find(({ msg }) => msg.role === "user")?.idx;

        const hasUsableAssistantResponse =
          typeof lastUserIndex === "number"
            ? currentMessages.slice(lastUserIndex + 1).some((msg) => {
                if (msg.role !== "assistant") {
                  return false;
                }

                const hasNormalText = msg.parts?.some(
                  (part) =>
                    part.type === "text" &&
                    part.text.trim().length > 0 &&
                    !part.text.includes(ERROR_RESPONSE_MARKER)
                );

                const hasStructuredResult = msg.parts?.some(
                  (part) =>
                    part.type === "data-resultSummary" ||
                    part.type === "data-sqlResult" ||
                    part.type === "data-visualizationFigure"
                );

                return Boolean(hasNormalText || hasStructuredResult);
              })
            : false;

        if (alreadyHasErrorMessage || hasUsableAssistantResponse) {
          return currentMessages;
        }

        return [
          ...currentMessages,
          {
            id: inlineErrorMessageId,
            role: "assistant",
            parts: [
              {
                type: "text",
                text: `${ERROR_RESPONSE_MARKER} ${inlineErrorText}`,
              },
            ],
          },
        ];
      });

      if (bulkQueue.active && !hasUsableAssistantResponseForCurrentTurn) {
        bulkDispatchInFlightRef.current = false;
        bulkQueueRef.current = { questions: [], index: 0 };
        setBulkQueue({ active: false, questions: [], index: 0 });
      }

      if (error.message?.includes("AI Gateway requires a valid credit card")) {
        setShowCreditCardAlert(true);
      } else if (error instanceof ChatbotError) {
        toast({
          type: "error",
          description: error.message,
        });
      } else {
        toast({
          type: "error",
          description: error.message || "Oops, an error occurred!",
        });
      }

      if (bulkQueue.active && !hasUsableAssistantResponseForCurrentTurn) {
        toast({
          type: "error",
          description: "Bulk run stopped due to an error. You can retry from Bulk Upload.",
        });
      }
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const pendingKey = `chat:${id}:pendingResume`;

    if (status === "submitted" || status === "streaming") {
      window.sessionStorage.setItem(pendingKey, "1");
      return;
    }

    window.sessionStorage.removeItem(pendingKey);
  }, [id, status]);

  useEffect(() => {
    setFailedPromptByErrorMessageId((current) => {
      let changed = false;
      const next = { ...current };

      for (let i = 0; i < messages.length; i += 1) {
        const message = messages[i];
        if (!message || message.role !== "assistant" || next[message.id]) {
          continue;
        }

        const hasInlineErrorMarker = (message.parts || []).some(
          (part) =>
            part.type === "text" && part.text.includes(ERROR_RESPONSE_MARKER)
        );
        if (!hasInlineErrorMarker) {
          continue;
        }

        const previousUser = [...messages.slice(0, i)]
          .reverse()
          .find((candidate) => candidate.role === "user");

        const previousUserText =
          previousUser?.parts
            ?.filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n")
            .trim() || "";

        if (previousUserText) {
          next[message.id] = previousUserText;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [messages]);

  const sendMessageWithDemo = useCallback<typeof sendMessage>(
    (...args) => {
      const [message] = args;
      if (!message) {
        return sendMessage(...args);
      }

      // Ensure at most one active stream before dispatching a new prompt.
      stop();

      // Start each turn from a clean transient stream state so follow-up
      // prompts do not inherit stale buffered deltas from the previous turn.
      resetStreamState();
      beginRun(generateUUID());

      const prompt = (message.parts ?? [])
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(" ")
        .trim()
        .toLowerCase();

      if (prompt === ANALYTICS_DEMO_TRIGGER) {
        const userMessage: ChatMessage = {
          id: generateUUID(),
          role: "user",
          parts: message.parts ?? [],
        };

        const assistantMessage: ChatMessage = {
          id: generateUUID(),
          role: "assistant",
          parts: [{ type: "text", text: ANALYTICS_RESPONSE_MARKER }],
        };

        if (analyticsTimeoutRef.current) {
          clearTimeout(analyticsTimeoutRef.current);
        }

        setIsAnalyticsLoading(true);
        setMessages((currentMessages) => [...currentMessages, userMessage]);

        analyticsTimeoutRef.current = setTimeout(() => {
          setMessages((currentMessages) => [...currentMessages, assistantMessage]);
          setIsAnalyticsLoading(false);
          analyticsTimeoutRef.current = null;
        }, ANALYTICS_RESPONSE_DELAY_MS);

        return Promise.resolve(undefined as never);
      }

      return sendMessage(...args);
    },
    [beginRun, resetStreamState, sendMessage, setMessages, stop]
  );

  const handleRetryFailedResponse = useCallback(
    (errorMessageId: string) => {
      const failedPrompt = failedPromptByErrorMessageId[errorMessageId]?.trim();
      if (!failedPrompt) {
        toast({
          type: "error",
          description: "No failed prompt found to retry.",
        });
        return;
      }

      sendMessageWithDemo({
        role: "user",
        parts: [{ type: "text", text: failedPrompt }],
      });
    },
    [failedPromptByErrorMessageId, sendMessageWithDemo]
  );

  const handleEditFailedResponse = useCallback(
    (errorMessageId: string) => {
      const failedPrompt = failedPromptByErrorMessageId[errorMessageId]?.trim();
      if (!failedPrompt) {
        toast({
          type: "error",
          description: "No failed prompt found to edit.",
        });
        return;
      }

      setInput(failedPrompt);
    },
    [failedPromptByErrorMessageId]
  );

  const handleNegativeFeedbackRetry = useCallback(
    (originalUserQuery: string, feedbackText: string) => {
      const feedback = feedbackText.trim();

      if (!feedback) {
        toast({
          type: "error",
          description: "Please describe what went wrong before retrying.",
        });
        return;
      }

      setPendingFeedbackRetry({ text: feedback });
    },
    [sendMessageWithDemo]
  );

  useEffect(() => {
    if (!pendingFeedbackRetry) {
      return;
    }

    if (status !== "ready") {
      return;
    }

    const pending = pendingFeedbackRetry.text;
    setPendingFeedbackRetry(null);
    sendMessageWithDemo({
      role: "user",
      parts: [{ type: "text", text: pending }],
    });
  }, [pendingFeedbackRetry, sendMessageWithDemo, status]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;

    if (!bulkQueue.active) {
      return;
    }

    if (status !== "ready") {
      return;
    }

    if (previousStatus !== "ready") {
      bulkDispatchInFlightRef.current = false;
    }

    if (bulkDispatchInFlightRef.current) {
      return;
    }

    const queue = bulkQueueRef.current;

    while (queue.index < queue.questions.length) {
      const currentQuestion = queue.questions[queue.index]?.trim();
      queue.index += 1;

      setBulkQueue((current) => ({
        ...current,
        index: queue.index,
      }));

      if (!currentQuestion) {
        continue;
      }

      bulkDispatchInFlightRef.current = true;
      handleSubmitTriggered();
      sendMessageWithDemo({
        role: "user",
        parts: [{ type: "text", text: currentQuestion }],
      });
      return;
    }

    toast({
      type: "success",
      description: "Bulk run complete",
    });
    bulkDispatchInFlightRef.current = false;
    bulkQueueRef.current = { questions: [], index: 0 };
    setBulkQueue({ active: false, questions: [], index: 0 });
  }, [bulkQueue.active, handleSubmitTriggered, sendMessageWithDemo, status]);

  const handleBulkUploadStart = useCallback((questions: string[]) => {
    const normalizedQuestions = questions
      .map((question) => question.trim())
      .filter((question) => question.length > 0);

    if (normalizedQuestions.length === 0) {
      toast({
        type: "error",
        description: "No valid questions found in selected column",
      });
      return;
    }

    setBulkQueue({
      active: true,
      questions: normalizedQuestions,
      index: 0,
    });

    bulkQueueRef.current = {
      questions: normalizedQuestions,
      index: 0,
    };

    bulkDispatchInFlightRef.current = false;

    toast({
      type: "success",
      description: `Bulk run started for ${normalizedQuestions.length} questions`,
    });
  }, []);

  const effectiveStatus = isAnalyticsLoading ? "submitted" : status;

  const searchParams = useSearchParams();
  const query = searchParams.get("query");

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      setInput((current) => (current.trim().length > 0 ? current : query));

      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);
  const isInitialHomeState = messages.length === 0;

  useEffect(() => {
    return () => {
      stop();
      endRun();
      resetStreamState();
      if (analyticsTimeoutRef.current) {
        clearTimeout(analyticsTimeoutRef.current);
      }
    };
  }, [endRun, resetStreamState, stop]);

  return (
    <>
      <div className="overscroll-behavior-contain flex h-dvh min-w-0 touch-pan-y flex-col bg-background">
        <ChatHeader
          chatId={id}
          isReadonly={isReadonly}
          selectedVisibilityType={initialVisibilityType}
        />

        <Messages
          addToolApprovalResponse={addToolApprovalResponse}
          chatId={id}
          submitSequence={submitSequence}
          initialInputSlot={
            isInitialHomeState && !isReadonly ? (
              <div className="mx-auto mt-5 w-full max-w-5xl px-2 md:mt-6 md:px-4">
                <MultimodalInput
                  attachments={attachments}
                  chatId={id}
                  input={input}
                  messages={messages}
                  onBulkUploadStart={handleBulkUploadStart}
                  onModelChange={setCurrentModelId}
                  onSubmitTriggered={handleSubmitTriggered}
                  prominent={true}
                  selectedModelId={currentModelId}
                  selectedVisibilityType={visibilityType}
                  sendMessage={sendMessageWithDemo}
                  setAttachments={setAttachments}
                  setInput={setInput}
                  setMessages={setMessages}
                  status={effectiveStatus}
                  stop={stop}
                />
              </div>
            ) : undefined
          }
          isArtifactVisible={isArtifactVisible}
          isReadonly={isReadonly}
          messages={messages}
          onEditFailedResponse={handleEditFailedResponse}
          onNegativeFeedbackRetry={handleNegativeFeedbackRetry}
          onRetryFailedResponse={handleRetryFailedResponse}
          regenerate={regenerate}
          selectedModelId={initialChatModel}
          selectedVisibilityType={visibilityType}
          setMessages={setMessages}
          status={effectiveStatus}
          votes={votes}
        />

        <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-5xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
          {!isReadonly && !isInitialHomeState && (
            <MultimodalInput
              attachments={attachments}
              chatId={id}
              input={input}
              messages={messages}
              onBulkUploadStart={handleBulkUploadStart}
              onModelChange={setCurrentModelId}
              onSubmitTriggered={handleSubmitTriggered}
              selectedModelId={currentModelId}
              selectedVisibilityType={visibilityType}
              sendMessage={sendMessageWithDemo}
              setAttachments={setAttachments}
              setInput={setInput}
              setMessages={setMessages}
              status={effectiveStatus}
              stop={stop}
            />
          )}
        </div>
      </div>

      <Artifact
        addToolApprovalResponse={addToolApprovalResponse}
        attachments={attachments}
        chatId={id}
        input={input}
        isReadonly={isReadonly}
        messages={messages}
        regenerate={regenerate}
        selectedModelId={currentModelId}
        selectedVisibilityType={visibilityType}
        sendMessage={sendMessageWithDemo}
        setAttachments={setAttachments}
        setInput={setInput}
        setMessages={setMessages}
        status={effectiveStatus}
        stop={stop}
        votes={votes}
      />

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate AI Gateway</AlertDialogTitle>
            <AlertDialogDescription>
              This application requires{" "}
              {process.env.NODE_ENV === "production" ? "the owner" : "you"} to
              activate Vercel AI Gateway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.open(
                  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card",
                  "_blank"
                );
                window.location.href = "/";
              }}
            >
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
