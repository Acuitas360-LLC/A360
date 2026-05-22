import { ChatbotError } from "@/lib/errors";
import { withForwardedAuthHeaders } from "@/lib/server/auth-forward";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

type PreviewRequestBody = {
  chatId?: string;
  messageId?: string;
};

export async function POST(request: Request) {
  let body: PreviewRequestBody;
  try {
    body = (await request.json()) as PreviewRequestBody;
  } catch {
    return new ChatbotError("bad_request:api", "Invalid request body").toResponse();
  }

  const threadId = body.chatId?.trim();
  const messageId = body.messageId?.trim();

  if (!threadId) {
    return new ChatbotError("bad_request:api", "Invalid preview request").toResponse();
  }

  const backendResponse = await fetch(`${BACKEND_API_BASE_URL}/api/v1/pptx/preview`, {
    method: "POST",
    headers: withForwardedAuthHeaders(request, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      thread_id: threadId,
      message_id: messageId,
    }),
  });

  if (!backendResponse.ok) {
    let backendDetail = "";
    try {
      const maybeJson = (await backendResponse.json()) as { detail?: string };
      backendDetail = String(maybeJson?.detail ?? "").trim();
    } catch {
      try {
        backendDetail = (await backendResponse.text()).trim();
      } catch {
        backendDetail = "";
      }
    }

    return new ChatbotError(
      "bad_request:api",
      backendDetail || "PPT preview failed"
    ).toResponse();
  }

  const payload = (await backendResponse.json()) as {
    slides?: Array<Record<string, unknown>>;
  };

  return Response.json(payload);
}
