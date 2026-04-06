import { cookies, headers } from "next/headers";
import { Suspense } from "react";

import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { withForwardedAuthHeaders } from "@/lib/server/auth-forward";
import type { ChatMessage } from "@/lib/types";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

async function getInitialMessages(chatId: string, authHeaders?: HeadersInit): Promise<ChatMessage[]> {
  try {
    const response = await fetch(
      `${BACKEND_API_BASE_URL}/api/v1/history/${encodeURIComponent(chatId)}`,
      {
        cache: "no-store",
        headers: authHeaders,
      }
    );

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { messages?: ChatMessage[] };
    return Array.isArray(payload.messages) ? payload.messages : [];
  } catch {
    return [];
  }
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <ChatPage params={props.params} />
    </Suspense>
  );
}

async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const requestLike = new Request("http://localhost", { headers: requestHeaders });
  const initialMessages = await getInitialMessages(
    id,
    withForwardedAuthHeaders(requestLike)
  );
  const chatModelFromCookie = cookieStore.get("chat-model");

  if (!chatModelFromCookie) {
    return (
      <>
        <Chat
          autoResume={true}
          id={id}
          initialChatModel={DEFAULT_CHAT_MODEL}
          initialMessages={initialMessages}
          initialVisibilityType="private"
          isReadonly={false}
        />
        <DataStreamHandler />
      </>
    );
  }

  return (
    <>
      <Chat
        autoResume={true}
        id={id}
        initialChatModel={chatModelFromCookie.value}
        initialMessages={initialMessages}
        initialVisibilityType="private"
        isReadonly={false}
      />
      <DataStreamHandler />
    </>
  );
}
