"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter, useSearchParams } from "next/navigation";
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
import { useAutoResume } from "@/hooks/use-auto-resume";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import type { Vote } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import type { Attachment, ChatMessage } from "@/lib/types";
import { fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { Artifact } from "./artifact";
import { useDataStream } from "./data-stream-provider";
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
  autoResume,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
}) {
  const router = useRouter();

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      // When user navigates back/forward, refresh to sync with URL
      router.refresh();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [router]);
  const { setDataStream } = useDataStream();

  const [input, setInput] = useState<string>("");
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const [bulkQueue, setBulkQueue] = useState<{
    active: boolean;
    questions: string[];
    index: number;
  }>({ active: false, questions: [], index: 0 });
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [failedPromptByErrorMessageId, setFailedPromptByErrorMessageId] =
    useState<Record<string, string>>({});
  const currentModelIdRef = useRef(currentModelId);
  const analyticsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  useEffect(() => {
    return () => {
      if (analyticsTimeoutRef.current) {
        clearTimeout(analyticsTimeoutRef.current);
      }
    };
  }, []);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
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
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
    },
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
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

        if (alreadyHasErrorMessage) {
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

      if (bulkQueue.active) {
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

      if (bulkQueue.active) {
        toast({
          type: "error",
          description: "Bulk run stopped due to an error. You can retry from Bulk Upload.",
        });
      }
    },
  });

  const sendMessageWithDemo = useCallback<typeof sendMessage>(
    (...args) => {
      const [message] = args;
      if (!message) {
        return sendMessage(...args);
      }

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
    [sendMessage, setMessages]
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

  useEffect(() => {
    if (!bulkQueue.active) {
      return;
    }

    if (status !== "ready") {
      return;
    }

    if (bulkQueue.index >= bulkQueue.questions.length) {
      toast({
        type: "success",
        description: "Bulk run complete",
      });
      setBulkQueue({ active: false, questions: [], index: 0 });
      return;
    }

    const currentQuestion = bulkQueue.questions[bulkQueue.index];
    if (!currentQuestion?.trim()) {
      setBulkQueue((current) => ({
        ...current,
        index: current.index + 1,
      }));
      return;
    }

    sendMessageWithDemo({
      role: "user",
      parts: [{ type: "text", text: currentQuestion }],
    });

    setBulkQueue((current) => ({
      ...current,
      index: current.index + 1,
    }));
  }, [bulkQueue, sendMessageWithDemo, status]);

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
      sendMessageWithDemo({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, sendMessageWithDemo, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

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
          isArtifactVisible={isArtifactVisible}
          isReadonly={isReadonly}
          messages={messages}
          onEditFailedResponse={handleEditFailedResponse}
          onRetryFailedResponse={handleRetryFailedResponse}
          regenerate={regenerate}
          selectedModelId={initialChatModel}
          setMessages={setMessages}
          status={effectiveStatus}
          votes={votes}
        />

        <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
          {!isReadonly && (
            <MultimodalInput
              attachments={attachments}
              chatId={id}
              input={input}
              messages={messages}
              onBulkUploadStart={handleBulkUploadStart}
              onModelChange={setCurrentModelId}
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
