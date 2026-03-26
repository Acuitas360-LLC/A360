import type { Vote } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId")?.trim();

  if (!chatId) {
    return Response.json([] as Vote[]);
  }

  const backendResponse = await fetch(
    `${BACKEND_API_BASE_URL}/api/v1/votes?thread_id=${encodeURIComponent(chatId)}`
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
    type?: "up" | "down";
  };

  if (!body.chatId || !body.messageId || !body.type) {
    return new ChatbotError("bad_request:vote", "Invalid vote payload").toResponse();
  }

  const backendResponse = await fetch(`${BACKEND_API_BASE_URL}/api/v1/votes`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: body.chatId,
      message_id: body.messageId,
      rating: body.type === "up" ? 1 : -1,
    }),
  });

  if (!backendResponse.ok) {
    const detail = await backendResponse.text();
    return new ChatbotError("bad_request:vote", detail || "Vote save failed").toResponse();
  }

  const result = (await backendResponse.json()) as { inserted: boolean };

  return Response.json({ success: true, inserted: result.inserted });
}
