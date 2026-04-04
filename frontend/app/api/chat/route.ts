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

type EmittableDataPartType =
  | "data-progressStages"
  | "data-resultSummary"
  | "data-sqlQuery"
  | "data-sqlResult"
  | "data-sqlColumns"
  | "data-sqlRowCount"
  | "data-visualizationCode"
  | "data-visualizationSpec"
  | "data-visualizationFigure"
  | "data-visualizationMeta"
  | "data-relevantQuestions";

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

  const getSeparator = (value: string): { index: number; length: number } => {
    const lfIndex = value.indexOf("\n\n");
    const crlfIndex = value.indexOf("\r\n\r\n");

    if (lfIndex === -1 && crlfIndex === -1) {
      return { index: -1, length: 0 };
    }

    if (lfIndex === -1) {
      return { index: crlfIndex, length: 4 };
    }

    if (crlfIndex === -1) {
      return { index: lfIndex, length: 2 };
    }

    return lfIndex < crlfIndex
      ? { index: lfIndex, length: 2 }
      : { index: crlfIndex, length: 4 };
  };

  const parseRawEvent = (rawEvent: string): SseEvent | null => {
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

    if (dataLines.length === 0) {
      return null;
    }

    return { event: eventName, data: dataLines.join("\n") };
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const separator = getSeparator(buffer);
        if (separator.index < 0) {
          break;
        }

        const rawEvent = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator.length);

        const parsed = parseRawEvent(rawEvent);
        if (parsed) {
          yield parsed;
        }
      }
    }

    // Flush decoder tail and parse any trailing event that may not end with \n\n.
    buffer += decoder.decode();

    while (true) {
      const separator = getSeparator(buffer);
      if (separator.index < 0) {
        break;
      }

      const rawEvent = buffer.slice(0, separator.index);
      buffer = buffer.slice(separator.index + separator.length);
      const parsed = parseRawEvent(rawEvent);
      if (parsed) {
        yield parsed;
      }
    }

    const trailingEvent = buffer.trim();
    if (trailingEvent) {
      const parsed = parseRawEvent(trailingEvent);
      if (parsed) {
        yield parsed;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Reader may already be closed.
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
      signal: req.signal,
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
        const TEXT_DELTA_FLUSH_MS = 40;
        const textId = "assistant-text";
        let textStarted = false;
        let textEnded = false;
        let emittedAssistantText = "";
        let bufferedAssistantText = "";
        let textFlushTimer: ReturnType<typeof setTimeout> | null = null;
        const orderedProgressStageKeys: string[] = [];
        const progressStageMap = new Map<
          string,
          { key: string; label: string; state: string }
        >();
        const emittedPayloadByType = new Map<string, string>();
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

        const writeDataPartIfChanged = (type: EmittableDataPartType, data: unknown) => {
          let digest = "";

          if (typeof data === "string") {
            digest = data;
          } else {
            try {
              digest = JSON.stringify(data);
            } catch {
              digest = String(data);
            }
          }

          const previousDigest = emittedPayloadByType.get(type);
          if (previousDigest === digest) {
            return false;
          }

          emittedPayloadByType.set(type, digest);
          writer.write({ type, data });
          return true;
        };

        const flushBufferedAssistantText = () => {
          if (!bufferedAssistantText) {
            return;
          }

          if (!textStarted || textEnded) {
            bufferedAssistantText = "";
            return;
          }

          writer.write({ type: "text-delta", id: textId, delta: bufferedAssistantText });
          emittedAssistantText += bufferedAssistantText;
          bufferedAssistantText = "";
        };

        const scheduleTextFlush = () => {
          if (textFlushTimer) {
            return;
          }

          textFlushTimer = setTimeout(() => {
            textFlushTimer = null;
            flushBufferedAssistantText();
          }, TEXT_DELTA_FLUSH_MS);
        };

        const appendAssistantTextDelta = (delta: string) => {
          if (!delta) {
            return;
          }

          bufferedAssistantText += delta;
          scheduleTextFlush();
        };

        const flushAndClearTextTimer = () => {
          if (textFlushTimer) {
            clearTimeout(textFlushTimer);
            textFlushTimer = null;
          }

          flushBufferedAssistantText();
        };

        const reconcileMissingDataParts = async () => {
          const needsAnyBackfill = () =>
            Object.values(emittedDataParts).some((isEmitted) => !isEmitted);

          const fetchLatestAssistantParts = async (): Promise<HistoryMessagePart[]> => {
            const historyResponse = await fetch(
              `${BACKEND_API_BASE_URL}/api/v1/history/${encodeURIComponent(threadId)}`,
              { cache: "no-store", signal: req.signal }
            );

            if (!historyResponse.ok) {
              return [];
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

            return Array.isArray(latestAssistant?.parts) ? latestAssistant.parts : [];
          };

          const emitMissingPartsFrom = (latestParts: HistoryMessagePart[]) => {
            const findLatestData = (partType: string) =>
              [...latestParts]
                .reverse()
                .find((part) => part.type === partType)?.data;

            const sqlQuery = findLatestData("data-sqlQuery");
            if (!emittedDataParts.sqlQuery && typeof sqlQuery === "string" && sqlQuery.trim()) {
              emittedDataParts.sqlQuery = writeDataPartIfChanged("data-sqlQuery", sqlQuery);
            }

            const sqlResult = findLatestData("data-sqlResult");
            if (!emittedDataParts.sqlResult && sqlResult && typeof sqlResult === "object") {
              emittedDataParts.sqlResult = writeDataPartIfChanged("data-sqlResult", sqlResult);
            }

            const sqlColumns = findLatestData("data-sqlColumns");
            if (!emittedDataParts.sqlColumns && Array.isArray(sqlColumns) && sqlColumns.length > 0) {
              emittedDataParts.sqlColumns = writeDataPartIfChanged("data-sqlColumns", sqlColumns);
            }

            const sqlRowCount = findLatestData("data-sqlRowCount");
            if (
              !emittedDataParts.sqlRowCount &&
              typeof sqlRowCount === "number" &&
              Number.isFinite(sqlRowCount)
            ) {
              emittedDataParts.sqlRowCount = writeDataPartIfChanged(
                "data-sqlRowCount",
                sqlRowCount
              );
            }

            const resultSummary = findLatestData("data-resultSummary");
            if (
              typeof resultSummary === "string" &&
              resultSummary.trim()
            ) {
              const normalizedSummary = resultSummary.trim();
              if (!textStarted) {
                writer.write({ type: "text-start", id: textId });
                textStarted = true;
                appendAssistantTextDelta(normalizedSummary);
                flushAndClearTextTimer();
              } else if (
                !textEnded &&
                normalizedSummary.length > emittedAssistantText.length &&
                normalizedSummary.startsWith(emittedAssistantText)
              ) {
                const missingTail = normalizedSummary.slice(emittedAssistantText.length);
                appendAssistantTextDelta(missingTail);
                flushAndClearTextTimer();
              }
            }

            const visualizationCode = findLatestData("data-visualizationCode");
            if (
              !emittedDataParts.visualizationCode &&
              typeof visualizationCode === "string" &&
              visualizationCode.trim()
            ) {
              emittedDataParts.visualizationCode = writeDataPartIfChanged(
                "data-visualizationCode",
                visualizationCode
              );
            }

            const visualizationSpec = findLatestData("data-visualizationSpec");
            if (
              !emittedDataParts.visualizationSpec &&
              typeof visualizationSpec === "string" &&
              visualizationSpec.trim()
            ) {
              emittedDataParts.visualizationSpec = writeDataPartIfChanged(
                "data-visualizationSpec",
                visualizationSpec
              );
            }

            const visualizationFigure = findLatestData("data-visualizationFigure");
            if (
              !emittedDataParts.visualizationFigure &&
              visualizationFigure &&
              typeof visualizationFigure === "object"
            ) {
              emittedDataParts.visualizationFigure = writeDataPartIfChanged(
                "data-visualizationFigure",
                visualizationFigure
              );
            }

            const visualizationMeta = findLatestData("data-visualizationMeta");
            if (
              !emittedDataParts.visualizationMeta &&
              visualizationMeta &&
              typeof visualizationMeta === "object"
            ) {
              emittedDataParts.visualizationMeta = writeDataPartIfChanged(
                "data-visualizationMeta",
                visualizationMeta
              );
            }

            const relevantQuestions = findLatestData("data-relevantQuestions");
            if (
              !emittedDataParts.relevantQuestions &&
              Array.isArray(relevantQuestions) &&
              relevantQuestions.length > 0
            ) {
              emittedDataParts.relevantQuestions = writeDataPartIfChanged(
                "data-relevantQuestions",
                relevantQuestions
              );
            }
          };

          try {
            const maxAttempts = 4;
            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
              const latestParts = await fetchLatestAssistantParts();
              if (latestParts.length > 0) {
                emitMissingPartsFrom(latestParts);
              }

              if (!needsAnyBackfill()) {
                break;
              }

              await sleep(180);
            }
          } catch {
            // Best effort only; live stream should still complete if history sync fails.
            console.error("Failed to reconcile missing streamed data parts");
          }
        };

        const sleep = (ms: number) =>
          new Promise((resolve) => setTimeout(resolve, ms));

        writer.write({ type: "start" });

        for await (const event of parseSseEvents(backendResponse.body!)) {
          let payload: Record<string, unknown> = {};
          try {
            payload = JSON.parse(event.data) as Record<string, unknown>;
          } catch {
            payload = {};
          }

          if (event.event === "status") {
            const key = String(payload.key ?? "").trim();
            if (!key) {
              continue;
            }

            if (!progressStageMap.has(key)) {
              orderedProgressStageKeys.push(key);
            }

            progressStageMap.set(key, {
              key,
              label: String(payload.label ?? key),
              state: String(payload.state ?? "active"),
            });

            const normalizedStages = orderedProgressStageKeys
              .map((stageKey) => progressStageMap.get(stageKey))
              .filter(
                (
                  stage
                ): stage is { key: string; label: string; state: string } =>
                  Boolean(stage)
              );

            writeDataPartIfChanged("data-progressStages", normalizedStages);
            continue;
          }

          if (event.event === "summary_token") {
            if (!textStarted) {
              writer.write({ type: "text-start", id: textId });
              textStarted = true;
            }

            const delta = String(payload.delta ?? "");
            if (delta) {
              appendAssistantTextDelta(delta);
            }
            continue;
          }

          if (event.event === "summary_done") {
            flushAndClearTextTimer();
            const summary = String(payload.summary ?? "").trim();
            if (summary) {
              writeDataPartIfChanged("data-resultSummary", summary);
              if (!textStarted) {
                writer.write({ type: "text-start", id: textId });
                textStarted = true;
                appendAssistantTextDelta(
                  buildAssistantText({
                    thread_id: threadId,
                    assistant_text: summary,
                    result_summary: summary,
                  })
                );
                flushAndClearTextTimer();
              } else if (
                !textEnded &&
                summary.length > emittedAssistantText.length &&
                summary.startsWith(emittedAssistantText)
              ) {
                const missingTail = summary.slice(emittedAssistantText.length);
                appendAssistantTextDelta(missingTail);
                flushAndClearTextTimer();
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
              emittedDataParts.sqlQuery = writeDataPartIfChanged("data-sqlQuery", sqlQuery);
            }
            continue;
          }

          if (event.event === "results_ready") {
            const sqlResult = payload.sql_result;
            if (sqlResult && typeof sqlResult === "object") {
              emittedDataParts.sqlResult = writeDataPartIfChanged("data-sqlResult", sqlResult);

              const columns = (sqlResult as { columns?: unknown }).columns;
              if (Array.isArray(columns) && columns.length > 0) {
                emittedDataParts.sqlColumns = writeDataPartIfChanged(
                  "data-sqlColumns",
                  columns
                );
              }

              const rows = (sqlResult as { data?: unknown }).data;
              if (Array.isArray(rows)) {
                emittedDataParts.sqlRowCount = writeDataPartIfChanged(
                  "data-sqlRowCount",
                  rows.length
                );
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
              emittedDataParts.visualizationCode = writeDataPartIfChanged(
                "data-visualizationCode",
                visualizationCode
              );
            }

            if (typeof visualizationSpec === "string" && visualizationSpec.trim()) {
              emittedDataParts.visualizationSpec = writeDataPartIfChanged(
                "data-visualizationSpec",
                visualizationSpec
              );
            }

            if (visualizationFigure && typeof visualizationFigure === "object") {
              emittedDataParts.visualizationFigure = writeDataPartIfChanged(
                "data-visualizationFigure",
                visualizationFigure
              );
            }

            if (visualizationMeta && typeof visualizationMeta === "object") {
              emittedDataParts.visualizationMeta = writeDataPartIfChanged(
                "data-visualizationMeta",
                visualizationMeta
              );
            }
            continue;
          }

          if (event.event === "related_questions_ready") {
            const relevantQuestions = payload.relevant_questions;
            if (Array.isArray(relevantQuestions) && relevantQuestions.length > 0) {
              emittedDataParts.relevantQuestions = writeDataPartIfChanged(
                "data-relevantQuestions",
                relevantQuestions
              );
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
            appendAssistantTextDelta(`[[ERROR_RESPONSE]] ${detail}`);
            flushAndClearTextTimer();
            if (!textEnded) {
              writer.write({ type: "text-end", id: textId });
              textEnded = true;
            }
            break;
          }
        }

        flushAndClearTextTimer();
        await reconcileMissingDataParts();

        if (textStarted && !textEnded) {
          flushAndClearTextTimer();
          writer.write({ type: "text-end", id: textId });
          textEnded = true;
        }

        flushAndClearTextTimer();

        writer.write({ type: "finish" });
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
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
