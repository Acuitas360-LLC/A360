"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import {
  applyArtifactStateDeltas,
  collectStreamDeltaEffects,
} from "@/lib/streaming-processor";
import { useArtifact } from "@/hooks/use-artifact";
import { useStreamingStore } from "@/lib/streaming-store";
import { artifactDefinitions } from "./artifact";
import { getChatHistoryPaginationKey } from "./sidebar-history";

export function DataStreamHandler() {
  const STREAM_DELTA_PROCESS_MS = 40;
  const dataStream = useStreamingStore((state) => state.dataStream);
  const drainDataStream = useStreamingStore((state) => state.drainDataStream);
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
  const isProcessingRef = useRef(false);

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

    if (isProcessingRef.current) {
      return;
    }

    if (!pendingDeltasRef.current.length) {
      return;
    }

    isProcessingRef.current = true;

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

    const artifactDefinition = artifactDefinitions.find(
      (currentArtifactDefinition) =>
        currentArtifactDefinition.kind === artifactKindRef.current
    );

    const artifactStateDeltas = collectStreamDeltaEffects({
      deltas: deltasToProcess,
      seenDeltaKeys: seenDeltaKeysRef.current,
      onChatTitle: () => {
        mutateRef.current(unstable_serialize(getChatHistoryPaginationKey));
      },
      onStreamPart: (delta) => {
        if (!artifactDefinition?.onStreamPart) {
          return;
        }

        artifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact: setArtifactRef.current,
          setMetadata: setMetadataRef.current,
        });
      },
    });

    if (artifactStateDeltas.length > 0) {
      setArtifactRef.current((draftArtifact) =>
        applyArtifactStateDeltas(draftArtifact, artifactStateDeltas)
      );
    }

    isProcessingRef.current = false;
  }, []);

  useEffect(() => {
    if (!dataStream?.length) {
      return;
    }

    const drained = drainDataStream();
    if (!drained.length) {
      return;
    }

    pendingDeltasRef.current.push(...drained);

    if (processTimerRef.current) {
      return;
    }

    processTimerRef.current = setTimeout(() => {
      processPendingDeltas();
    }, STREAM_DELTA_PROCESS_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataStream]);

  useEffect(() => {
    return () => {
      if (processTimerRef.current) {
        clearTimeout(processTimerRef.current);
        processTimerRef.current = null;
      }

      isProcessingRef.current = false;
      pendingDeltasRef.current = [];
      seenDeltaKeysRef.current.clear();
    };
  }, []);

  return null;
}
