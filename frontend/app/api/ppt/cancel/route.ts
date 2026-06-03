import { ChatbotError } from "@/lib/errors";
import { withForwardedAuthHeaders } from "@/lib/server/auth-forward";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

type CancelRequestBody = {
  requestId?: string;
};

export async function POST(request: Request) {
  let body: CancelRequestBody;
  try {
    body = (await request.json()) as CancelRequestBody;
  } catch {
    return new ChatbotError("bad_request:api", "Invalid request body").toResponse();
  }

  const requestId = body.requestId?.trim();
  if (!requestId) {
    return new ChatbotError("bad_request:api", "requestId is required").toResponse();
  }

  const backendResponse = await fetch(`${BACKEND_API_BASE_URL}/api/v1/pptx/cancel`, {
    method: "POST",
    headers: withForwardedAuthHeaders(request, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      request_id: requestId,
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
      backendDetail || "Failed to cancel PPT generation"
    ).toResponse();
  }

  const payload = (await backendResponse.json().catch(() => null)) as
    | { cancelled?: boolean }
    | null;

  return Response.json({ cancelled: Boolean(payload?.cancelled) });
}
