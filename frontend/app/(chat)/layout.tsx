import { cookies } from "next/headers";
import Script from "next/script";
import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import type { ChatHistory } from "@/components/sidebar-history";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

async function getInitialSidebarHistory(): Promise<ChatHistory | undefined> {
  try {
    const response = await fetch(`${BACKEND_API_BASE_URL}/api/v1/history?limit=20`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as ChatHistory;
    if (!Array.isArray(payload.chats) || typeof payload.hasMore !== "boolean") {
      return undefined;
    }

    return payload;
  } catch {
    return undefined;
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
        strategy="beforeInteractive"
      />
      <DataStreamProvider>
        <Suspense fallback={<div className="flex h-dvh" />}>
          <SidebarWrapper>{children}</SidebarWrapper>
        </Suspense>
      </DataStreamProvider>
    </>
  );
}

async function SidebarWrapper({ children }: { children: React.ReactNode }) {
  const [cookieStore, initialHistory] = await Promise.all([
    cookies(),
    getInitialSidebarHistory(),
  ]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <AppSidebar initialHistory={initialHistory} user={undefined} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
