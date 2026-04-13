import { withBrowserAuthHeaders } from "@/lib/iframe-auth";
import type { ChatMessage } from "@/lib/types";

const MAX_CACHED_THREADS = 12;

const threadMessageCache = new Map<string, ChatMessage[]>();
const inFlightThreadRequests = new Map<string, Promise<ChatMessage[]>>();

function promoteCacheKey(threadId: string): void {
  const cached = threadMessageCache.get(threadId);
  if (!cached) {
    return;
  }

  threadMessageCache.delete(threadId);
  threadMessageCache.set(threadId, cached);
}

function putThreadCache(threadId: string, messages: ChatMessage[]): void {
  threadMessageCache.set(threadId, messages);

  if (threadMessageCache.size <= MAX_CACHED_THREADS) {
    return;
  }

  const oldestKey = threadMessageCache.keys().next().value;
  if (typeof oldestKey === "string") {
    threadMessageCache.delete(oldestKey);
  }
}

async function fetchThreadMessages(threadId: string): Promise<ChatMessage[]> {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[thread-prefetch] fetch:start", { threadId });
  }

  const response = await fetch(`/api/history/${encodeURIComponent(threadId)}`, {
    cache: "no-store",
    headers: withBrowserAuthHeaders(),
  });

  if (!response.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[thread-prefetch] fetch:non-ok", {
        threadId,
        status: response.status,
      });
    }
    return [];
  }

  const payload = (await response.json()) as { messages?: ChatMessage[] };
  const messages = Array.isArray(payload.messages) ? payload.messages : [];

  if (process.env.NODE_ENV !== "production") {
    console.debug("[thread-prefetch] fetch:done", {
      threadId,
      messageCount: messages.length,
    });
  }

  return messages;
}

export function getCachedThreadMessages(threadId: string): ChatMessage[] | null {
  const cached = threadMessageCache.get(threadId) ?? null;
  if (cached) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[thread-prefetch] cache:hit", {
        threadId,
        messageCount: cached.length,
      });
    }
    promoteCacheKey(threadId);
  }
  return cached;
}

export async function prefetchThreadMessages(
  threadId: string,
  options?: { force?: boolean }
): Promise<ChatMessage[]> {
  if (!options?.force) {
    const cached = getCachedThreadMessages(threadId);
    if (cached) {
      return cached;
    }
  }

  const existingRequest = inFlightThreadRequests.get(threadId);
  if (existingRequest) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[thread-prefetch] in-flight:reuse", { threadId });
    }
    return existingRequest;
  }

  const request = fetchThreadMessages(threadId)
    .then((messages) => {
      // Avoid caching empty responses from transient auth/network states.
      if (messages.length > 0) {
        putThreadCache(threadId, messages);
      }
      return messages;
    })
    .catch(() => {
      return [];
    })
    .finally(() => {
      inFlightThreadRequests.delete(threadId);
    });

  inFlightThreadRequests.set(threadId, request);
  return request;
}
