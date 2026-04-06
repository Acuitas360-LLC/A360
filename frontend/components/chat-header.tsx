"use client";

import { useRouter } from "next/navigation";
import { memo, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useWindowSize } from "usehooks-ts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import {
  AUTH_TOKEN_UPDATED_EVENT,
  getTokenProfileFromStorage,
  type TokenProfile,
} from "@/lib/iframe-auth";
import { PlusIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const router = useRouter();
  const { open } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const [tokenProfile, setTokenProfile] = useState<TokenProfile | null>(null);

  const { width: windowWidth } = useWindowSize();

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

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      <SidebarToggle />

      {(!open || windowWidth < 768) && (
        <Button
          className="order-2 ml-auto h-8 px-2 md:order-1 md:ml-0 md:h-fit md:px-2"
          onClick={() => {
            router.push("/");
            router.refresh();
          }}
          variant="outline"
        >
          <PlusIcon />
          <span className="md:sr-only">New Chat</span>
        </Button>
      )}

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-1 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      <div className="order-3 ml-auto flex items-center gap-2">
        <Button
          aria-label="Toggle theme"
          className="h-8 px-2 md:h-fit"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          variant="outline"
        >
          <span aria-hidden="true" className="text-base leading-none">
            {resolvedTheme === "dark" ? "☀" : "🌙"}
          </span>
        </Button>

        <Button
          aria-label="Authenticated user"
          className="h-8 w-8 rounded-full p-0"
          title={tokenProfile?.email ?? tokenProfile?.name ?? "Authenticated user"}
          variant="outline"
        >
          <Avatar className="h-7 w-7">
            <AvatarImage
              alt={tokenProfile?.email ?? "User"}
              src={tokenProfile?.avatarUrl}
            />
            <AvatarFallback className="text-[10px] font-semibold uppercase">
              {tokenProfile?.initials ?? "U"}
            </AvatarFallback>
          </Avatar>
        </Button>
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});
