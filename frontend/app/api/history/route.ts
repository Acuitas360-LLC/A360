import type { Chat } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const endingBefore = searchParams.get("ending_before") ?? undefined;
  const limit = Number(limitRaw ?? 20);
  const query = searchParams.get("q") ?? undefined;

  const params = new URLSearchParams();
  params.set("limit", String(Number.isFinite(limit) && limit > 0 ? limit : 20));
  if (endingBefore) {
    params.set("ending_before", endingBefore);
  }
  if (query) {
    params.set("q", query);
  }

  const backendResponse = await fetch(
    `${BACKEND_API_BASE_URL}/api/v1/history?${params.toString()}`
  );

  if (!backendResponse.ok) {
    const detail = await backendResponse.text();
    return new ChatbotError("bad_request:history", detail || "History fetch failed").toResponse();
  }

  const payload = (await backendResponse.json()) as { chats: Chat[]; hasMore: boolean };

  return Response.json(payload);
}

export async function DELETE() {
  const backendResponse = await fetch(`${BACKEND_API_BASE_URL}/api/v1/history`, {
    method: "DELETE",
  });

  if (!backendResponse.ok) {
    const detail = await backendResponse.text();
    return new ChatbotError("bad_request:history", detail || "Delete history failed").toResponse();
  }

  return Response.json({ success: true });
}
