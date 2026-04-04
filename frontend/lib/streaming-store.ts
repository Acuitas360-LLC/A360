import type { DataUIPart } from "ai";
import { create } from "zustand";
import type { CustomUIDataTypes } from "@/lib/types";

type StreamPart = DataUIPart<CustomUIDataTypes>;
type ChatScopedStreamPart = {
  chatId: string;
  part: StreamPart;
};

const DEFAULT_FLUSH_MS = 40;

let flushTimer: ReturnType<typeof setTimeout> | null = null;

type StreamingStoreState = {
  activeRunId: string | null;
  activeRunChatId: string | null;
  currentChatId: string | null;
  runningChatIds: Record<string, true>;
  dataStream: StreamPart[];
  queuedDataParts: StreamPart[];
  scopedDataStream: ChatScopedStreamPart[];
  queuedScopedDataParts: ChatScopedStreamPart[];
  beginRun: (chatId: string, runId: string) => void;
  endRun: (chatId: string, runId?: string) => void;
  setCurrentChatId: (chatId: string | null) => void;
  setDataStream: (
    updater: StreamPart[] | ((current: StreamPart[]) => StreamPart[])
  ) => void;
  drainDataStream: (chatId: string) => StreamPart[];
  enqueueDataPart: (
    part: StreamPart,
    chatId: string,
    flushWindowMs?: number
  ) => void;
  flushQueuedDataParts: () => void;
  isChatRunning: (chatId: string) => boolean;
  resetStreamState: () => void;
};

export const useStreamingStore = create<StreamingStoreState>((set, get) => ({
  activeRunId: null,
  activeRunChatId: null,
  currentChatId: null,
  runningChatIds: {},
  dataStream: [],
  queuedDataParts: [],
  scopedDataStream: [],
  queuedScopedDataParts: [],
  beginRun: (chatId, runId) => {
    set((current) => ({
      activeRunId: runId,
      activeRunChatId: chatId,
      runningChatIds: {
        ...current.runningChatIds,
        [chatId]: true,
      },
    }));
  },
  endRun: (chatId, runId) => {
    const currentState = get();
    const nextRunningChatIds = { ...currentState.runningChatIds };
    delete nextRunningChatIds[chatId];

    if (!runId) {
      const shouldClearActiveRun = currentState.activeRunChatId === chatId;
      set({
        runningChatIds: nextRunningChatIds,
        ...(shouldClearActiveRun
          ? { activeRunId: null, activeRunChatId: null }
          : {}),
      });
      return;
    }

    if (
      currentState.activeRunId !== runId ||
      currentState.activeRunChatId !== chatId
    ) {
      set({ runningChatIds: nextRunningChatIds });
      return;
    }

    set({
      activeRunId: null,
      activeRunChatId: null,
      runningChatIds: nextRunningChatIds,
    });
  },
  setCurrentChatId: (chatId) => {
    set({ currentChatId: chatId });
  },
  setDataStream: (updater) => {
    set((current) => ({
      dataStream:
        typeof updater === "function"
          ? updater(current.dataStream)
          : updater,
    }));
  },
  drainDataStream: (chatId) => {
    const currentDataStream = get().scopedDataStream;
    if (!currentDataStream.length) {
      return [];
    }

    const drainedParts: StreamPart[] = [];
    const remainingParts: ChatScopedStreamPart[] = [];

    for (const entry of currentDataStream) {
      if (entry.chatId === chatId) {
        drainedParts.push(entry.part);
      } else {
        remainingParts.push(entry);
      }
    }

    if (!drainedParts.length) {
      return [];
    }

    set({ scopedDataStream: remainingParts });
    return drainedParts;
  },
  enqueueDataPart: (part, chatId, flushWindowMs = DEFAULT_FLUSH_MS) => {
    const scopedPart: ChatScopedStreamPart = { chatId, part };

    set((current) => ({
      queuedDataParts: [...current.queuedDataParts, part],
      queuedScopedDataParts: [...current.queuedScopedDataParts, scopedPart],
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
    const queuedScopedDataParts = get().queuedScopedDataParts;
    if (!queuedDataParts.length && !queuedScopedDataParts.length) {
      return;
    }

    set((current) => ({
      queuedDataParts: [],
      queuedScopedDataParts: [],
      dataStream: [...current.dataStream, ...queuedDataParts],
      scopedDataStream: [...current.scopedDataStream, ...queuedScopedDataParts],
    }));
  },
  isChatRunning: (chatId) => {
    return Boolean(get().runningChatIds[chatId]);
  },
  resetStreamState: () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    set({
      activeRunId: null,
      activeRunChatId: null,
      runningChatIds: {},
      queuedDataParts: [],
      queuedScopedDataParts: [],
      dataStream: [],
      scopedDataStream: [],
    });
  },
}));
