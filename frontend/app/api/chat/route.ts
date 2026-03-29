import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { ChatbotError } from "@/lib/errors";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

type RequestMessagePart = {
  type: string;
  text?: string;
};

type RequestMessage = {
  role?: string;
  parts?: RequestMessagePart[];
};

type BackendChatResponse = {
  thread_id: string;
  assistant_text: string;
  sql_query?: string;
  result_summary?: string;
  relevant_questions?: string[];
  sql_result?: {
    columns?: string[];
    data?: Array<Record<string, unknown>>;
  };
  visualization_code?: string;
  visualization_spec?: string;
  visualization_figure?: {
    data?: unknown[];
    layout?: Record<string, unknown>;
    frames?: unknown[];
    config?: Record<string, unknown>;
  };
  visualization_meta?: {
    source?: string;
    source_row_count?: number;
    source_column_count?: number;
    source_columns?: string[];
    source_data_sha256?: string;
    visualization_code_sha256?: string;
    plotly_trace_count?: number;
  };
};

type HistoryMessagePart = {
  type?: string;
  data?: unknown;
};

type HistoryMessage = {
  role?: string;
  parts?: HistoryMessagePart[];
};

function extractQuestion(body: { message?: RequestMessage; messages?: RequestMessage[] }): string {
  const candidate = body.message ?? body.messages?.at(-1);
  if (!candidate?.parts?.length) return "";

  return candidate.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join(" ")
    .trim();
}

function buildAssistantText(payload: BackendChatResponse): string {
  const baseText =
    (payload.result_summary || payload.assistant_text || "Completed").trim();

  if (baseText.length <= 1200) {
    return baseText;
  }

  return `${baseText.slice(0, 1200)}...\n\nDetailed output is available in Analysis Details.`;
}

type SseEvent = {
  event: string;
  data: string;
};

async function* parseSseEvents(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const separatorIndex = buffer.indexOf("\n\n");
      if (separatorIndex < 0) {
        break;
      }

      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const lines = rawEvent.split(/\r?\n/);
      let eventName = "message";
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
          continue;
        }

        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length > 0) {
        yield { event: eventName, data: dataLines.join("\n") };
      }
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string;
      message?: RequestMessage;
      messages?: RequestMessage[];
    };

    const question = extractQuestion(body);
    const threadId = body.id?.trim();

    if (!question || !threadId) {
      return new ChatbotError("bad_request:api", "Missing question or thread id").toResponse();
    }

    const backendResponse = await fetch(`${BACKEND_API_BASE_URL}/api/v1/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, thread_id: threadId }),
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

      if (backendResponse.status === 429) {
        return new ChatbotError(
          "rate_limit:chat",
          backendDetail || undefined
        ).toResponse();
      }

      if (backendResponse.status === 401) {
        return new ChatbotError(
          "unauthorized:chat",
          backendDetail || undefined
        ).toResponse();
      }

      if (backendResponse.status === 403) {
        return new ChatbotError(
          "forbidden:chat",
          backendDetail || undefined
        ).toResponse();
      }

      if (backendResponse.status === 404) {
        return new ChatbotError(
          "not_found:chat",
          backendDetail || undefined
        ).toResponse();
      }

      return new ChatbotError(
        "bad_request:chat",
        backendDetail || "Backend chat request failed"
      ).toResponse();
    }

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const textId = "assistant-text";
        let textStarted = false;
        let textEnded = false;
        const emittedDataParts = {
          sqlQuery: false,
          sqlResult: false,
          sqlColumns: false,
          sqlRowCount: false,
          visualizationCode: false,
          visualizationSpec: false,
          visualizationFigure: false,
          visualizationMeta: false,
          relevantQuestions: false,
        };

        const reconcileMissingDataParts = async () => {
          try {
            const historyResponse = await fetch(
              `${BACKEND_API_BASE_URL}/api/v1/history/${encodeURIComponent(threadId)}`,
              { cache: "no-store" }
            );

            if (!historyResponse.ok) {
              return;
            }

            const historyPayload = (await historyResponse.json()) as {
              messages?: HistoryMessage[];
            };
            const messages = Array.isArray(historyPayload.messages)
              ? historyPayload.messages
              : [];

            const latestAssistant = [...messages]
              .reverse()
              .find((message) => message.role === "assistant");
            const latestParts = Array.isArray(latestAssistant?.parts)
              ? latestAssistant.parts
              : [];

            const findLatestData = (partType: string) =>
              [...latestParts]
                .reverse()
                .find((part) => part.type === partType)?.data;

            const sqlQuery = findLatestData("data-sqlQuery");
            if (!emittedDataParts.sqlQuery && typeof sqlQuery === "string" && sqlQuery.trim()) {
              writer.write({ type: "data-sqlQuery", data: sqlQuery });
            }

            const sqlResult = findLatestData("data-sqlResult");
            if (!emittedDataParts.sqlResult && sqlResult && typeof sqlResult === "object") {
              writer.write({ type: "data-sqlResult", data: sqlResult });
            }

            const sqlColumns = findLatestData("data-sqlColumns");
            if (!emittedDataParts.sqlColumns && Array.isArray(sqlColumns) && sqlColumns.length > 0) {
              writer.write({ type: "data-sqlColumns", data: sqlColumns });
            }

            const sqlRowCount = findLatestData("data-sqlRowCount");
            if (
              !emittedDataParts.sqlRowCount &&
              typeof sqlRowCount === "number" &&
              Number.isFinite(sqlRowCount)
            ) {
              writer.write({ type: "data-sqlRowCount", data: sqlRowCount });
            }

            const visualizationCode = findLatestData("data-visualizationCode");
            if (
              !emittedDataParts.visualizationCode &&
              typeof visualizationCode === "string" &&
              visualizationCode.trim()
            ) {
              writer.write({ type: "data-visualizationCode", data: visualizationCode });
            }

            const visualizationSpec = findLatestData("data-visualizationSpec");
            if (
              !emittedDataParts.visualizationSpec &&
              typeof visualizationSpec === "string" &&
              visualizationSpec.trim()
            ) {
              writer.write({ type: "data-visualizationSpec", data: visualizationSpec });
            }

            const visualizationFigure = findLatestData("data-visualizationFigure");
            if (
              !emittedDataParts.visualizationFigure &&
              visualizationFigure &&
              typeof visualizationFigure === "object"
            ) {
              writer.write({ type: "data-visualizationFigure", data: visualizationFigure });
            }

            const visualizationMeta = findLatestData("data-visualizationMeta");
            if (
              !emittedDataParts.visualizationMeta &&
              visualizationMeta &&
              typeof visualizationMeta === "object"
            ) {
              writer.write({ type: "data-visualizationMeta", data: visualizationMeta });
            }

            const relevantQuestions = findLatestData("data-relevantQuestions");
            if (
              !emittedDataParts.relevantQuestions &&
              Array.isArray(relevantQuestions) &&
              relevantQuestions.length > 0
            ) {
              writer.write({ type: "data-relevantQuestions", data: relevantQuestions });
            }
          } catch {
            // Best effort only; live stream should still complete if history sync fails.
          }
        };

        const sleep = (ms: number) =>
          new Promise((resolve) => setTimeout(resolve, ms));

        const pacedWriteText = async (text: string) => {
          if (!text) {
            return;
          }

          if (!textStarted || textEnded) {
            return;
          }

          const chunkSize = 3;
          for (let i = 0; i < text.length; i += chunkSize) {
            if (textEnded) {
              break;
            }

            const chunk = text.slice(i, i + chunkSize);
            writer.write({ type: "text-delta", id: textId, delta: chunk });

            // Small pacing to keep typing feel visible even if upstream tokens are bursty.
            const delay = /[.!?]$/.test(chunk) ? 28 : /[,;:]$/.test(chunk) ? 18 : 10;
            await sleep(delay);
          }
        };

        writer.write({ type: "start" });

        for await (const event of parseSseEvents(backendResponse.body!)) {
          let payload: Record<string, unknown> = {};
          try {
            payload = JSON.parse(event.data) as Record<string, unknown>;
          } catch {
            payload = {};
          }

          if (event.event === "status") {
            continue;
          }

          if (event.event === "summary_token") {
            if (!textStarted) {
              writer.write({ type: "text-start", id: textId });
              textStarted = true;
            }

            const delta = String(payload.delta ?? "");
            if (delta) {
              await pacedWriteText(delta);
            }
            continue;
          }

          if (event.event === "summary_done") {
            const summary = String(payload.summary ?? "").trim();
            if (summary) {
              writer.write({ type: "data-resultSummary", data: summary });
              if (!textStarted) {
                writer.write({ type: "text-start", id: textId });
                textStarted = true;
                await pacedWriteText(
                  buildAssistantText({
                    thread_id: threadId,
                    assistant_text: summary,
                    result_summary: summary,
                  })
                );
              }
            }

            if (textStarted && !textEnded) {
              writer.write({ type: "text-end", id: textId });
              textEnded = true;
            }
            continue;
          }

          if (event.event === "sql_ready") {
            const sqlQuery = payload.sql_query;
            if (typeof sqlQuery === "string" && sqlQuery.trim()) {
              writer.write({ type: "data-sqlQuery", data: sqlQuery });
              emittedDataParts.sqlQuery = true;
            }
            continue;
          }

          if (event.event === "results_ready") {
            const sqlResult = payload.sql_result;
            if (sqlResult && typeof sqlResult === "object") {
              writer.write({ type: "data-sqlResult", data: sqlResult });
              emittedDataParts.sqlResult = true;

              const columns = (sqlResult as { columns?: unknown }).columns;
              if (Array.isArray(columns) && columns.length > 0) {
                writer.write({ type: "data-sqlColumns", data: columns });
                emittedDataParts.sqlColumns = true;
              }

              const rows = (sqlResult as { data?: unknown }).data;
              if (Array.isArray(rows)) {
                writer.write({ type: "data-sqlRowCount", data: rows.length });
                emittedDataParts.sqlRowCount = true;
              }
            }
            continue;
          }

          if (event.event === "chart_ready") {
            const visualizationCode = payload.visualization_code;
            const visualizationSpec = payload.visualization_spec;
            const visualizationFigure = payload.visualization_figure;
            const visualizationMeta = payload.visualization_meta;

            if (typeof visualizationCode === "string" && visualizationCode.trim()) {
              writer.write({ type: "data-visualizationCode", data: visualizationCode });
              emittedDataParts.visualizationCode = true;
            }

            if (typeof visualizationSpec === "string" && visualizationSpec.trim()) {
              writer.write({ type: "data-visualizationSpec", data: visualizationSpec });
              emittedDataParts.visualizationSpec = true;
            }

            if (visualizationFigure && typeof visualizationFigure === "object") {
              writer.write({ type: "data-visualizationFigure", data: visualizationFigure });
              emittedDataParts.visualizationFigure = true;
            }

            if (visualizationMeta && typeof visualizationMeta === "object") {
              writer.write({ type: "data-visualizationMeta", data: visualizationMeta });
              emittedDataParts.visualizationMeta = true;
            }
            continue;
          }

          if (event.event === "related_questions_ready") {
            const relevantQuestions = payload.relevant_questions;
            if (Array.isArray(relevantQuestions) && relevantQuestions.length > 0) {
              writer.write({ type: "data-relevantQuestions", data: relevantQuestions });
              emittedDataParts.relevantQuestions = true;
            }
            continue;
          }

          if (event.event === "error") {
            const detail = String(payload.detail ?? "Backend chat request failed").trim();

            if (textEnded) {
              break;
            }

            if (!textStarted) {
              writer.write({ type: "text-start", id: textId });
              textStarted = true;
            }
            await pacedWriteText(`[[ERROR_RESPONSE]] ${detail}`);
            if (!textEnded) {
              writer.write({ type: "text-end", id: textId });
              textEnded = true;
            }
            break;
          }
        }

        await reconcileMissingDataParts();

        if (textStarted && !textEnded) {
          writer.write({ type: "text-end", id: textId });
          textEnded = true;
        }

        writer.write({ type: "finish" });
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected chat error";
    return new ChatbotError("bad_request:chat", message).toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("id")?.trim();

  if (!chatId) {
    return new ChatbotError("bad_request:chat", "Missing chat id").toResponse();
  }

  const backendResponse = await fetch(
    `${BACKEND_API_BASE_URL}/api/v1/history/${encodeURIComponent(chatId)}`,
    { method: "DELETE" }
  );

  if (!backendResponse.ok) {
    const detail = await backendResponse.text();
    return new ChatbotError("bad_request:chat", detail || "Delete chat failed").toResponse();
  }

  return Response.json({ success: true });
}
