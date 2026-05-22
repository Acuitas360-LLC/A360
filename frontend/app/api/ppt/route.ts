import { ChatbotError } from "@/lib/errors";
import { withForwardedAuthHeaders } from "@/lib/server/auth-forward";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

type PptRequestBody = {
  mode?: "slide" | "deck";
  chatId?: string;
  messageId?: string;
  disposition?: "inline" | "attachment";
};

export async function POST(request: Request) {
  let body: PptRequestBody;
  try {
    body = (await request.json()) as PptRequestBody;
  } catch {
    return new ChatbotError("bad_request:ppt", "Invalid request body").toResponse();
  }

  const mode = body.mode?.trim();
  const threadId = body.chatId?.trim();
  const messageId = body.messageId?.trim();
  const disposition = body.disposition?.trim();

  if (!threadId || (mode !== "slide" && mode !== "deck")) {
    return new ChatbotError("bad_request:ppt", "Invalid PPT request").toResponse();
  }

  if (mode === "slide" && !messageId) {
    return new ChatbotError("bad_request:ppt", "messageId is required").toResponse();
  }

  const endpoint = mode === "slide" ? "/api/v1/pptx/slide" : "/api/v1/pptx/deck";

  const backendResponse = await fetch(`${BACKEND_API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: withForwardedAuthHeaders(request, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      thread_id: threadId,
      message_id: messageId,
      disposition,
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
      "bad_request:ppt",
      backendDetail || "PPT generation failed"
    ).toResponse();
  }

  const headers = new Headers();
  const contentType = backendResponse.headers.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  const contentDisposition = backendResponse.headers.get("content-disposition");
  if (contentDisposition) {
    headers.set("Content-Disposition", contentDisposition);
  }
  headers.set("Cache-Control", "no-store");

  return new Response(backendResponse.body, {
    status: 200,
    headers,
  });
}
