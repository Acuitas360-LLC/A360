import type { UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/artifact";
import type { Suggestion } from "./db/schema";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;
export type ChatTools = any;

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  sqlQuery: string;
  resultSummary: string;
  sqlColumns: string[];
  sqlResult: {
    columns?: string[];
    data?: Array<Record<string, unknown>>;
  };
  visualizationCode: string;
  visualizationFigure: {
    data?: unknown[];
    layout?: Record<string, unknown>;
    frames?: unknown[];
    config?: Record<string, unknown>;
  };
  visualizationMeta: {
    source?: string;
    source_row_count?: number;
    source_column_count?: number;
    source_columns?: string[];
    source_data_sha256?: string;
    visualization_code_sha256?: string;
    plotly_trace_count?: number;
  };
  sqlRowCount: number;
  relevantQuestions: string[];
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  "chat-title": string;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
