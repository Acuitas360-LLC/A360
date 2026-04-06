import { ChatbotError } from "@/lib/errors";
import { withForwardedAuthHeaders } from "@/lib/server/auth-forward";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

type DailyPulsePayload = {
  questions?: string[];
  count?: number;
};

type DailyPulseUpdatePayload = {
  questions?: string[];
};

export async function GET(request: Request) {
  const backendResponse = await fetch(
    `${BACKEND_API_BASE_URL}/api/v1/daily-pulse/questions`,
    {
      cache: "no-store",
      headers: withForwardedAuthHeaders(request),
    }
  );

  if (!backendResponse.ok) {
    const detail = await backendResponse.text();
    return new ChatbotError(
      "bad_request:api",
      detail || "Daily Pulse fetch failed"
    ).toResponse();
  }

  const payload = (await backendResponse.json()) as DailyPulsePayload;
  const questions = Array.isArray(payload.questions)
    ? payload.questions.filter((item): item is string => typeof item === "string")
    : [];

  return Response.json({ questions, count: questions.length });
}

export async function PUT(req: Request) {
  let body: DailyPulseUpdatePayload;
  try {
    body = (await req.json()) as DailyPulseUpdatePayload;
  } catch {
    return new ChatbotError("bad_request:api", "Invalid JSON payload").toResponse();
  }

  const normalizedQuestions = Array.isArray(body.questions)
    ? body.questions
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

  const backendResponse = await fetch(
    `${BACKEND_API_BASE_URL}/api/v1/daily-pulse/questions`,
    {
      method: "PUT",
      headers: withForwardedAuthHeaders(req, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ questions: normalizedQuestions }),
    }
  );

  if (!backendResponse.ok) {
    const detail = await backendResponse.text();
    return new ChatbotError(
      "bad_request:api",
      detail || "Daily Pulse update failed"
    ).toResponse();
  }

  const payload = (await backendResponse.json()) as DailyPulsePayload;
  const questions = Array.isArray(payload.questions)
    ? payload.questions.filter((item): item is string => typeof item === "string")
    : [];

  return Response.json({ questions, count: questions.length });
}
