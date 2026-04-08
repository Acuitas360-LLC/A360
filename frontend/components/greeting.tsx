"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  AUTH_TOKEN_UPDATED_EVENT,
  getTokenProfileFromStorage,
  type TokenProfile,
} from "@/lib/iframe-auth";

export const Greeting = () => {
  const [tokenProfile, setTokenProfile] = useState<TokenProfile | null>(null);

  useEffect(() => {
    const syncProfile = () => {
      setTokenProfile(getTokenProfileFromStorage());
    };

    syncProfile();

    window.addEventListener(AUTH_TOKEN_UPDATED_EVENT, syncProfile);
    window.addEventListener("storage", syncProfile);

    return () => {
      window.removeEventListener(AUTH_TOKEN_UPDATED_EVENT, syncProfile);
      window.removeEventListener("storage", syncProfile);
    };
  }, []);

  const greetingName = useMemo(() => {
    const sanitizeName = (value?: string | null) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        return null;
      }

      // Ignore placeholder-style values so UI falls back to plain greeting.
      if (/[{}$<>]/.test(trimmed)) {
        return null;
      }

      const firstWord = trimmed.split(/\s+/)[0]?.trim();
      return firstWord || null;
    };

    const name = sanitizeName(tokenProfile?.name);
    if (name) {
      return name;
    }

    const email = tokenProfile?.email?.trim();
    if (!email) {
      return null;
    }

    return sanitizeName(email.split("@")[0]);
  }, [tokenProfile]);

  return (
    <div
      className="mx-auto mt-4 flex size-full w-full max-w-5xl flex-col justify-center px-2 md:mt-16 md:px-4"
      key="overview"
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="whitespace-nowrap text-[clamp(1.2rem,2.2vw,2rem)] leading-tight tracking-tight"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
      >
        <span className="font-semibold text-foreground">
          Hi{greetingName ? `, ${greetingName}` : ","}
        </span>
        <span className="ml-1 font-normal text-muted-foreground">what can I help you with?</span>
      </motion.div>
    </div>
  );
};
