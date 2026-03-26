import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { ChatbotError } from "@/lib/errors";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

type RequestMessagePart = {
  type: string;
  text?: string;
};

type RequestMessage = {
  role?: string;
  parts?: RequestMessagePart[];
};

type BackendChatResponse = {
  thread_id: string;
  assistant_text: string;
  sql_query?: string;
  result_summary?: string;
  relevant_questions?: string[];
  sql_result?: {
    columns?: string[];
    data?: Array<Record<string, unknown>>;
  };
  visualization_code?: string;
};

function extractQuestion(body: { message?: RequestMessage; messages?: RequestMessage[] }): string {
  const candidate = body.message ?? body.messages?.at(-1);
  if (!candidate?.parts?.length) return "";

  return candidate.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join(" ")
    .trim();
}

function buildAssistantText(payload: BackendChatResponse): string {
  const baseText =
    (payload.result_summary || payload.assistant_text || "Completed").trim();

  if (baseText.length <= 1200) {
    return baseText;
  }

  return `${baseText.slice(0, 1200)}...\n\nDetailed output is available in Analysis Details.`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string;
      message?: RequestMessage;
      messages?: RequestMessage[];
    };

    const question = extractQuestion(body);
    const threadId = body.id?.trim();

    if (!question || !threadId) {
      return new ChatbotError("bad_request:api", "Missing question or thread id").toResponse();
    }

    const backendResponse = await fetch(`${BACKEND_API_BASE_URL}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, thread_id: threadId }),
    });

    if (!backendResponse.ok) {
      if (backendResponse.status === 429) {
        return new ChatbotError("rate_limit:chat").toResponse();
      }

      if (backendResponse.status === 401) {
        return new ChatbotError("unauthorized:chat").toResponse();
      }

      if (backendResponse.status === 403) {
        return new ChatbotError("forbidden:chat").toResponse();
      }

      if (backendResponse.status === 404) {
        return new ChatbotError("not_found:chat").toResponse();
      }

      return new ChatbotError("bad_request:chat").toResponse();
    }

    const payload = (await backendResponse.json()) as BackendChatResponse;
    const assistantText = buildAssistantText(payload);

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const textId = "assistant-text";
        writer.write({ type: "start" });

        if (payload.sql_query) {
          writer.write({ type: "data-sqlQuery", data: payload.sql_query });
        }

        if (payload.result_summary) {
          writer.write({
            type: "data-resultSummary",
            data: payload.result_summary,
          });
        }

        if (payload.relevant_questions?.length) {
          writer.write({
            type: "data-relevantQuestions",
            data: payload.relevant_questions,
          });
        }

        if (payload.sql_result?.columns?.length) {
          writer.write({
            type: "data-sqlColumns",
            data: payload.sql_result.columns,
          });
        }

        if (payload.sql_result) {
          writer.write({
            type: "data-sqlResult",
            data: payload.sql_result,
          });
        }

        if (payload.visualization_code) {
          writer.write({
            type: "data-visualizationCode",
            data: payload.visualization_code,
          });
        }

        if (payload.sql_result?.data?.length) {
          writer.write({
            type: "data-sqlRowCount",
            data: payload.sql_result.data.length,
          });
        }

        writer.write({ type: "text-start", id: textId });
        writer.write({ type: "text-delta", id: textId, delta: assistantText });
        writer.write({ type: "text-end", id: textId });
        writer.write({ type: "finish" });
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected chat error";
    return new ChatbotError("bad_request:chat", message).toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("id")?.trim();

  if (!chatId) {
    return new ChatbotError("bad_request:chat", "Missing chat id").toResponse();
  }

  const backendResponse = await fetch(
    `${BACKEND_API_BASE_URL}/api/v1/history/${encodeURIComponent(chatId)}`,
    { method: "DELETE" }
  );

  if (!backendResponse.ok) {
    const detail = await backendResponse.text();
    return new ChatbotError("bad_request:chat", detail || "Delete chat failed").toResponse();
  }

  return Response.json({ success: true });
}
