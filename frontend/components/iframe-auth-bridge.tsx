"use client";

import { useEffect } from "react";
import {
  extractIdTokenFromPostMessage,
  isTrustedParentOrigin,
  setStoredIdToken,
} from "@/lib/iframe-auth";

const AUTH_TOKEN_MESSAGE_TYPES = new Set([
  "onehum_auth",
  "AUTH_TOKEN",
  "id_token",
  "ID_TOKEN",
  "ONEHUM_ID_TOKEN",
]);

export function IframeAuthBridge() {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedParentOrigin(event.origin)) {
        return;
      }

      const payload = event.data;
      if (!payload || typeof payload !== "object") {
        return;
      }

      const messageType = String((payload as Record<string, unknown>).type ?? "").trim();
      if (messageType && !AUTH_TOKEN_MESSAGE_TYPES.has(messageType)) {
        return;
      }

      const token = extractIdTokenFromPostMessage(payload);
      if (!token) {
        return;
      }

      setStoredIdToken(token);

      if (window.parent !== window) {
        window.parent.postMessage(
          { type: "CHATBOT_AUTH_TOKEN_RECEIVED" },
          event.origin
        );
      }
    };

    window.addEventListener("message", handleMessage);

    if (window.parent !== window) {
      const parentOrigin = process.env.NEXT_PUBLIC_PARENT_APP_ORIGIN ?? "*";
      window.parent.postMessage({ type: "CHATBOT_AUTH_TOKEN_REQUEST" }, parentOrigin);
    }

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return null;
}
