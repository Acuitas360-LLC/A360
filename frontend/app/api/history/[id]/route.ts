import { ChatbotError } from "@/lib/errors";
import { withForwardedAuthHeaders } from "@/lib/server/auth-forward";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

type HistoryMessagesPayload = {
  messages?: unknown[];
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const chatId = params.id?.trim();

  if (!chatId) {
    return new ChatbotError("bad_request:api", "Missing chat id").toResponse();
  }

  const backendResponse = await fetch(
    `${BACKEND_API_BASE_URL}/api/v1/history/${encodeURIComponent(chatId)}`,
    {
      cache: "no-store",
      headers: withForwardedAuthHeaders(request),
    }
  );

  if (!backendResponse.ok) {
    if (backendResponse.status === 404) {
      return Response.json({ messages: [] });
    }

    const detail = await backendResponse.text();
    return new ChatbotError(
      "bad_request:api",
      detail || "History fetch failed"
    ).toResponse();
  }

  const payload = (await backendResponse.json()) as HistoryMessagesPayload;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];

  return Response.json({ messages });
}