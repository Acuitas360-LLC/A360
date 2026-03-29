import { ChatbotError } from "@/lib/errors";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

type DailyPulsePayload = {
  questions?: string[];
  count?: number;
};

export async function GET() {
  const backendResponse = await fetch(
    `${BACKEND_API_BASE_URL}/api/v1/daily-pulse/questions`,
    {
      cache: "no-store",
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
