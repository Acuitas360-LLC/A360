import type { Vote } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { withForwardedAuthHeaders } from "@/lib/server/auth-forward";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId")?.trim();

  if (!chatId) {
    return Response.json([] as Vote[]);
  }

  const backendResponse = await fetch(
    `${BACKEND_API_BASE_URL}/api/v1/votes?thread_id=${encodeURIComponent(chatId)}`,
    {
      headers: withForwardedAuthHeaders(request),
    }
  );

  if (!backendResponse.ok) {
    const detail = await backendResponse.text();
    return new ChatbotError("bad_request:vote", detail || "Vote fetch failed").toResponse();
  }

  const votes = (await backendResponse.json()) as Vote[];
  return Response.json(votes);
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    chatId?: string;
    messageId?: string;
    phase?: "rating_only" | "feedback_only" | "enrich_only";
    type?: "up" | "down";
    feedbackText?: string;
    userQuery?: string;
    assistantResponse?: string;
    feedbackQueryMessageId?: string;
    feedbackResponseMessageId?: string;
  };

  if (!body.chatId || !body.messageId || !body.type) {
    return new ChatbotError("bad_request:vote", "Invalid vote payload").toResponse();
  }

  const phase = body.phase ?? "rating_only";

  const backendResponse = await fetch(`${BACKEND_API_BASE_URL}/api/v1/votes`, {
    method: "PATCH",
    headers: withForwardedAuthHeaders(request, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      thread_id: body.chatId,
      message_id: body.messageId,
      phase,
      rating: body.type === "up" ? 1 : -1,
      feedback_text: body.feedbackText?.trim() || undefined,
      user_query: body.userQuery?.trim() || undefined,
      assistant_response: body.assistantResponse?.trim() || undefined,
      feedback_query_message_id: body.feedbackQueryMessageId?.trim() || undefined,
      feedback_response_message_id: body.feedbackResponseMessageId?.trim() || undefined,
    }),
  });

  if (!backendResponse.ok) {
    const rawDetail = await backendResponse.text();
    let parsedDetail: string | undefined;
    let retriable = false;

    try {
      const parsed = JSON.parse(rawDetail) as {
        detail?: string;
        retriable?: boolean;
      };
      parsedDetail = parsed.detail;
      retriable = Boolean(parsed.retriable);
    } catch {
      parsedDetail = rawDetail;
    }

    if (backendResponse.status === 409 && retriable) {
      return Response.json(
        {
          success: false,
          retriable: true,
          detail: parsedDetail || "Vote save retriable",
        },
        { status: 409 }
      );
    }

    return new ChatbotError(
      "bad_request:vote",
      parsedDetail || "Vote save failed"
    ).toResponse();
  }

  const result = (await backendResponse.json()) as {
    inserted: boolean;
    updated?: boolean;
    retriable?: boolean;
  };

  return Response.json({
    success: true,
    inserted: result.inserted,
    updated: Boolean(result.updated),
    retriable: Boolean(result.retriable),
  });
}
