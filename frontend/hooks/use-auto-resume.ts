"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { useEffect, useRef } from "react";
import { useDataStream } from "@/components/data-stream-provider";
import type { ChatMessage } from "@/lib/types";

export type UseAutoResumeParams = {
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
};

export function useAutoResume({
  setMessages,
}: UseAutoResumeParams) {
  const { dataStream } = useDataStream();

  const setMessagesRef = useRef(setMessages);
  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  useEffect(() => {
    if (!dataStream) {
      return;
    }
    if (dataStream.length === 0) {
      return;
    }

    const dataPart = dataStream[0];

    if (dataPart.type === "data-appendMessage") {
      try {
        const message = JSON.parse(dataPart.data);
        setMessagesRef.current((currentMessages) => {
          if (currentMessages.some((current) => current.id === message.id)) {
            return currentMessages;
          }

          return [...currentMessages, message];
        });
      } catch {
        // Ignore malformed append payloads and keep active stream state intact.
      }
    }
  }, [dataStream]);
}
