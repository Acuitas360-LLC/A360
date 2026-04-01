import type { DataUIPart } from "ai";
import type { UIArtifact } from "@/components/artifact";
import { initialArtifactData } from "@/hooks/use-artifact";
import type { CustomUIDataTypes } from "@/lib/types";

type StreamDelta = DataUIPart<CustomUIDataTypes>;

export type ArtifactStateDelta = {
  type: "data-id" | "data-title" | "data-kind" | "data-clear" | "data-finish";
  data: unknown;
};

const SINGLE_VALUE_TYPES = new Set([
  "data-sqlQuery",
  "data-resultSummary",
  "data-sqlColumns",
  "data-sqlResult",
  "data-sqlRowCount",
  "data-visualizationCode",
  "data-visualizationSpec",
  "data-visualizationFigure",
  "data-visualizationMeta",
  "data-relevantQuestions",
  "data-id",
  "data-title",
  "data-kind",
  "data-clear",
  "data-finish",
  "data-chat-title",
]);

export function buildStreamDeltaKey(delta: { type: string; data?: unknown }) {
  if (!delta.type.startsWith("data-")) {
    return null;
  }

  if (!SINGLE_VALUE_TYPES.has(delta.type)) {
    return null;
  }

  if (delta.data === undefined) {
    return `${delta.type}:__undefined__`;
  }

  if (typeof delta.data === "string") {
    return `${delta.type}:${delta.data}`;
  }

  if (typeof delta.data === "number" || typeof delta.data === "boolean") {
    return `${delta.type}:${String(delta.data)}`;
  }

  try {
    return `${delta.type}:${JSON.stringify(delta.data)}`;
  } catch {
    return null;
  }
}

export function collectStreamDeltaEffects({
  deltas,
  seenDeltaKeys,
  onChatTitle,
  onStreamPart,
}: {
  deltas: StreamDelta[];
  seenDeltaKeys: Set<string>;
  onChatTitle: () => void;
  onStreamPart: (delta: StreamDelta) => void;
}) {
  const artifactStateDeltas: ArtifactStateDelta[] = [];

  for (const delta of deltas) {
    const deltaKey = buildStreamDeltaKey(delta as { type: string; data?: unknown });
    if (deltaKey && seenDeltaKeys.has(deltaKey)) {
      continue;
    }

    if (deltaKey) {
      seenDeltaKeys.add(deltaKey);
    }

    if (delta.type === "data-chat-title") {
      onChatTitle();
      continue;
    }

    onStreamPart(delta);

    if (
      delta.type === "data-id" ||
      delta.type === "data-title" ||
      delta.type === "data-kind" ||
      delta.type === "data-clear" ||
      delta.type === "data-finish"
    ) {
      artifactStateDeltas.push({
        type: delta.type,
        data: delta.data,
      });
    }

    if (delta.type === "data-finish") {
      seenDeltaKeys.clear();
    }
  }

  return artifactStateDeltas;
}

export function applyArtifactStateDeltas(
  draftArtifact: UIArtifact,
  artifactStateDeltas: ArtifactStateDelta[]
): UIArtifact {
  let nextArtifact = draftArtifact || {
    ...initialArtifactData,
    status: "streaming" as const,
  };

  for (const artifactDelta of artifactStateDeltas) {
    switch (artifactDelta.type) {
      case "data-id":
        if (typeof artifactDelta.data !== "string") {
          break;
        }
        nextArtifact = {
          ...nextArtifact,
          documentId: artifactDelta.data,
          status: "streaming",
        };
        break;

      case "data-title":
        if (typeof artifactDelta.data !== "string") {
          break;
        }
        nextArtifact = {
          ...nextArtifact,
          title: artifactDelta.data,
          status: "streaming",
        };
        break;

      case "data-kind":
        if (typeof artifactDelta.data !== "string") {
          break;
        }
        nextArtifact = {
          ...nextArtifact,
          kind: artifactDelta.data as UIArtifact["kind"],
          status: "streaming",
        };
        break;

      case "data-clear":
        nextArtifact = {
          ...nextArtifact,
          content: "",
          status: "streaming",
        };
        break;

      case "data-finish":
        nextArtifact = {
          ...nextArtifact,
          status: "idle",
        };
        break;

      default:
        break;
    }
  }

  return nextArtifact;
}
