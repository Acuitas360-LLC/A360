import type {
  AssistantModelMessage,
  ToolModelMessage,
  UIMessage,
  UIMessagePart,
} from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { formatISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import type { DBMessage, Document } from '@/lib/db/schema';
import { clearStoredIdToken, withBrowserAuthHeaders } from '@/lib/iframe-auth';
import { ChatbotError, type ErrorCode } from './errors';
import type { ChatMessage, ChatTools, CustomUIDataTypes } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fetcher = async (url: string) => {
  const response = await fetch(url, {
    headers: withBrowserAuthHeaders(),
  });

  if (!response.ok) {
    let code: ErrorCode = 'bad_request:api';
    let cause = '';

    try {
      const payload = (await response.json()) as {
        code?: ErrorCode;
        cause?: string;
      };
      code = payload.code ?? code;
      cause = payload.cause ?? '';
    } catch {
      cause = response.statusText || 'Request failed';
    }

    throw new ChatbotError(code, cause);
  }

  return response.json();
};

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const response = await fetch(input, {
      ...init,
      headers: withBrowserAuthHeaders(init?.headers),
    });

    if (!response.ok) {
      let code: ErrorCode = 'bad_request:chat';
      let cause = '';

      if (response.status === 429) {
        code = 'rate_limit:chat';
      } else if (response.status === 401) {
        code = 'unauthorized:chat';
        clearStoredIdToken();
      } else if (response.status === 403) {
        code = 'forbidden:chat';
      } else if (response.status === 404) {
        code = 'not_found:chat';
      }

      try {
        const payload = (await response.json()) as {
          code?: ErrorCode;
          cause?: string;
        };
        code = payload.code ?? code;
        cause = payload.cause ?? '';
      } catch {
        cause = response.statusText || 'Chat request failed';
      }

      throw new ChatbotError(code, cause);
    }

    return response;
  } catch (error: unknown) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new ChatbotError('offline:chat');
    }

    if (error instanceof ChatbotError) {
      throw error;
    }

    throw new ChatbotError('bad_request:chat');
  }
}

export function getLocalStorage(key: string) {
  if (typeof window !== 'undefined') {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return [];
}

export function generateUUID(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) {
    return randomUUID();
  }

  // Fallback for environments without crypto.randomUUID.
  return '00000000-0000-4000-8000-000000000000'.replace(/[08]/g, (char) => {
    const randomBuffer = new Uint8Array(1);
    globalThis.crypto?.getRandomValues?.(randomBuffer);
    const random = randomBuffer[0] ?? 0;
    return (Number(char) ^ (random & 15) >> (Number(char) / 4)).toString(16);
  });
}

export function generateThreadId(): string {
  // Keep conversation routing id-based using stable UUIDs.
  return generateUUID();
}

type ResponseMessageWithoutId = ToolModelMessage | AssistantModelMessage;
type ResponseMessage = ResponseMessageWithoutId & { id: string };

export function getMostRecentUserMessage(messages: UIMessage[]) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

export function getDocumentTimestampByIndex(
  documents: Document[],
  index: number,
) {
  if (!documents) { return new Date(); }
  if (index > documents.length) { return new Date(); }

  return documents[index].createdAt;
}

export function getTrailingMessageId({
  messages,
}: {
  messages: ResponseMessage[];
}): string | null {
  const trailingMessage = messages.at(-1);

  if (!trailingMessage) { return null; }

  return trailingMessage.id;
}

export function sanitizeText(text: string) {
  return text.replace('<has_function_call>', '');
}

export function convertToUIMessages(messages: DBMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant' | 'system',
    parts: message.parts as UIMessagePart<CustomUIDataTypes, ChatTools>[],
    metadata: {
      createdAt: formatISO(message.createdAt),
    },
  }));
}

export function getTextFromMessage(message: ChatMessage | UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string}).text)
    .join('');
}
