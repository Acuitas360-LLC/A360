"use client";

import { useEffect } from "react";
import {
  authDebugLog,
  extractIdTokenFromPostMessage,
  getAuthDebugSnapshot,
  isAuthDebugEnabled,
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
    authDebugLog("info", "Iframe auth bridge initialized", {
      debugEnabled: isAuthDebugEnabled(),
      currentOrigin: window.location.origin,
    });

    const handleMessage = (event: MessageEvent) => {
      authDebugLog("info", "Received postMessage event", {
        origin: event.origin,
        data: event.data,
      });

      if (!isTrustedParentOrigin(event.origin)) {
        authDebugLog("warn", "Rejected message from untrusted origin", {
          origin: event.origin,
        });
        return;
      }

      const payload = event.data;
      if (!payload || typeof payload !== "object") {
        authDebugLog("warn", "Ignored message with non-object payload");
        return;
      }

      const messageType = String((payload as Record<string, unknown>).type ?? "").trim();
      if (messageType && !AUTH_TOKEN_MESSAGE_TYPES.has(messageType)) {
        authDebugLog("warn", "Ignored message with unsupported type", {
          messageType,
        });
        return;
      }

      const token = extractIdTokenFromPostMessage(payload);
      if (!token) {
        authDebugLog("warn", "Message received but token was empty/missing", {
          messageType,
        });
        return;
      }

      setStoredIdToken(token);
      authDebugLog("info", "Token accepted and stored", getAuthDebugSnapshot());

      if (window.parent !== window) {
        window.parent.postMessage(
          { type: "CHATBOT_AUTH_TOKEN_RECEIVED" },
          event.origin
        );
        authDebugLog("info", "Sent token received acknowledgement to parent", {
          targetOrigin: event.origin,
        });
      }
    };

    window.addEventListener("message", handleMessage);

    if (window.parent !== window) {
      const parentOrigin = process.env.NEXT_PUBLIC_PARENT_APP_ORIGIN ?? "*";
      window.parent.postMessage({ type: "CHATBOT_AUTH_TOKEN_REQUEST" }, parentOrigin);
      authDebugLog("info", "Requested token from parent", {
        targetOrigin: parentOrigin,
      });
    }

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return null;
}
