"use client";

import type { DataUIPart } from "ai";
import type React from "react";
import { useMemo } from "react";
import type { CustomUIDataTypes } from "@/lib/types";
import { useStreamingStore } from "@/lib/streaming-store";

type DataStreamContextValue = {
  dataStream: DataUIPart<CustomUIDataTypes>[];
  setDataStream: React.Dispatch<
    React.SetStateAction<DataUIPart<CustomUIDataTypes>[]>
  >;
};

export function DataStreamProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Compatibility wrapper: stream state now lives in centralized store.
  return <>{children}</>;
}

export function useDataStream() {
  const dataStream = useStreamingStore((state) => state.dataStream);
  const setDataStream = useStreamingStore((state) => state.setDataStream);

  return useMemo<DataStreamContextValue>(
    () => ({ dataStream, setDataStream }),
    [dataStream, setDataStream]
  );
}
