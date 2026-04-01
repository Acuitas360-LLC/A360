import type { DataUIPart } from "ai";
import { create } from "zustand";
import type { CustomUIDataTypes } from "@/lib/types";

type StreamPart = DataUIPart<CustomUIDataTypes>;

const DEFAULT_FLUSH_MS = 40;

let flushTimer: ReturnType<typeof setTimeout> | null = null;

type StreamingStoreState = {
  activeRunId: string | null;
  dataStream: StreamPart[];
  queuedDataParts: StreamPart[];
  beginRun: (runId: string) => void;
  endRun: (runId?: string) => void;
  setDataStream: (
    updater:
      | StreamPart[]
      | ((current: StreamPart[]) => StreamPart[])
  ) => void;
  drainDataStream: () => StreamPart[];
  enqueueDataPart: (part: StreamPart, flushWindowMs?: number) => void;
  flushQueuedDataParts: () => void;
  resetStreamState: () => void;
};

export const useStreamingStore = create<StreamingStoreState>((set, get) => ({
  activeRunId: null,
  dataStream: [],
  queuedDataParts: [],
  beginRun: (runId) => {
    set({ activeRunId: runId });
  },
  endRun: (runId) => {
    if (!runId) {
      set({ activeRunId: null });
      return;
    }

    const currentRunId = get().activeRunId;
    if (currentRunId !== runId) {
      return;
    }

    set({ activeRunId: null });
  },
  setDataStream: (updater) => {
    set((current) => ({
      dataStream:
        typeof updater === "function"
          ? updater(current.dataStream)
          : updater,
    }));
  },
  drainDataStream: () => {
    const currentDataStream = get().dataStream;
    if (!currentDataStream.length) {
      return [];
    }

    set({ dataStream: [] });
    return currentDataStream;
  },
  enqueueDataPart: (part, flushWindowMs = DEFAULT_FLUSH_MS) => {
    set((current) => ({
      queuedDataParts: [...current.queuedDataParts, part],
    }));

    if (flushTimer) {
      return;
    }

    flushTimer = setTimeout(() => {
      flushTimer = null;
      get().flushQueuedDataParts();
    }, flushWindowMs);
  },
  flushQueuedDataParts: () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    const queuedDataParts = get().queuedDataParts;
    if (!queuedDataParts.length) {
      return;
    }

    set((current) => ({
      queuedDataParts: [],
      dataStream: [...current.dataStream, ...queuedDataParts],
    }));
  },
  resetStreamState: () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    set({
      activeRunId: null,
      queuedDataParts: [],
      dataStream: [],
    });
  },
}));
