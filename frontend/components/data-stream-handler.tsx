"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { initialArtifactData, useArtifact } from "@/hooks/use-artifact";
import { artifactDefinitions } from "./artifact";
import { useDataStream } from "./data-stream-provider";
import { getChatHistoryPaginationKey } from "./sidebar-history";

export function DataStreamHandler() {
  const STREAM_DELTA_PROCESS_MS = 40;
  const { dataStream, setDataStream } = useDataStream();
  const { mutate } = useSWRConfig();

  const { artifact, setArtifact, setMetadata } = useArtifact();
  const artifactKindRef = useRef(artifact.kind);
  const setArtifactRef = useRef(setArtifact);
  const setMetadataRef = useRef(setMetadata);
  const mutateRef = useRef(mutate);
  const seenDeltaKeysRef = useRef<Set<string>>(new Set());
  const lastDeltaAtRef = useRef<number>(0);
  const pendingDeltasRef = useRef<typeof dataStream>([]);
  const processTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildDeltaKey = (delta: { type: string; data?: unknown }) => {
    if (!delta.type.startsWith("data-")) {
      return null;
    }

    const singleValueTypes = new Set([
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

    if (!singleValueTypes.has(delta.type)) {
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
  };

  useEffect(() => {
    artifactKindRef.current = artifact.kind;
  }, [artifact.kind]);

  useEffect(() => {
    setArtifactRef.current = setArtifact;
  }, [setArtifact]);

  useEffect(() => {
    setMetadataRef.current = setMetadata;
  }, [setMetadata]);

  useEffect(() => {
    mutateRef.current = mutate;
  }, [mutate]);

  const processPendingDeltas = useCallback(() => {
    if (processTimerRef.current) {
      clearTimeout(processTimerRef.current);
      processTimerRef.current = null;
    }

    if (!pendingDeltasRef.current.length) {
      return;
    }

    const deltasToProcess = pendingDeltasRef.current.splice(
      0,
      pendingDeltasRef.current.length
    );

    const now = Date.now();
    // Prevent dedupe keys from leaking across independent turns.
    if (now - lastDeltaAtRef.current > 5000) {
      seenDeltaKeysRef.current.clear();
    }
    lastDeltaAtRef.current = now;

    const artifactStateDeltas: Array<{
      type: "data-id" | "data-title" | "data-kind" | "data-clear" | "data-finish";
      data: unknown;
    }> = [];

    for (const delta of deltasToProcess) {
      const deltaKey = buildDeltaKey(delta as { type: string; data?: unknown });
      if (deltaKey && seenDeltaKeysRef.current.has(deltaKey)) {
        continue;
      }

      if (deltaKey) {
        seenDeltaKeysRef.current.add(deltaKey);
      }

      // Handle chat title updates
      if (delta.type === "data-chat-title") {
        mutateRef.current(unstable_serialize(getChatHistoryPaginationKey));
        continue;
      }
      const artifactDefinition = artifactDefinitions.find(
        (currentArtifactDefinition) =>
          currentArtifactDefinition.kind === artifactKindRef.current
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact: setArtifactRef.current,
          setMetadata: setMetadataRef.current,
        });
      }

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
        seenDeltaKeysRef.current.clear();
      }
    }

    if (artifactStateDeltas.length > 0) {
      setArtifactRef.current((draftArtifact) => {
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
                kind: artifactDelta.data as typeof nextArtifact.kind,
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
      });
    }
  }, []);

  useEffect(() => {
    if (!dataStream?.length) {
      return;
    }

    pendingDeltasRef.current.push(...dataStream);
    setDataStream([]);

    if (processTimerRef.current) {
      return;
    }

    processTimerRef.current = setTimeout(() => {
      processPendingDeltas();
    }, STREAM_DELTA_PROCESS_MS);
  }, [dataStream, processPendingDeltas]);

  useEffect(() => {
    return () => {
      if (processTimerRef.current) {
        clearTimeout(processTimerRef.current);
        processTimerRef.current = null;
      }

      pendingDeltasRef.current = [];
      seenDeltaKeysRef.current.clear();
    };
  }, []);

  return null;
}
