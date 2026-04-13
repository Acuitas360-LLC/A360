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

export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh min-w-0 flex-col bg-background">
          <div className="h-14 border-b bg-background" />
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
            <div className="h-6 w-40 animate-pulse rounded bg-muted/50" />
            <div className="h-16 w-full animate-pulse rounded-xl bg-muted/40" />
            <div className="h-16 w-[88%] animate-pulse rounded-xl bg-muted/35" />
            <div className="h-16 w-[92%] animate-pulse rounded-xl bg-muted/30" />
          </div>
        </div>
      }
    >
      <ChatPage params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const isNewThread = resolvedSearchParams?.new === "1";
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const requestLike = new Request("http://localhost", { headers: requestHeaders });
  const initialMessages = isNewThread
    ? []
    : await getInitialMessages(id, withForwardedAuthHeaders(requestLike));
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
