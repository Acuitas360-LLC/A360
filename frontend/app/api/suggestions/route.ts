import { withForwardedAuthHeaders } from "@/lib/server/auth-forward";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") ?? "";

  const backendResponse = await fetch(
    `${BACKEND_API_BASE_URL}/api/v1/suggestions?q=${encodeURIComponent(query)}`,
    {
      headers: withForwardedAuthHeaders(req),
    }
  );

  const bodyText = await backendResponse.text();

  if (!backendResponse.ok) {
    return new Response(bodyText, {
      status: backendResponse.status,
      headers: {
        "Content-Type": backendResponse.headers.get("Content-Type") || "text/plain",
      },
    });
  }

  return new Response(bodyText, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
