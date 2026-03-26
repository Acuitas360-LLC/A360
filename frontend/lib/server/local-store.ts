import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Chat, Vote } from "@/lib/db/schema";

type StoredChat = {
  id: string;
  createdAt: string;
  title: string;
  userId: string;
  visibility: "public" | "private";
};

type StoreShape = {
  chats: StoredChat[];
  votes: StoredVote[];
};

type StoredVote = Vote & {
  createdAt: string;
};

const DATA_DIR = path.join(process.cwd(), "frontend", ".data");
const STORE_FILE = path.join(DATA_DIR, "local-store.json");

const DEFAULT_STORE: StoreShape = {
  chats: [],
  votes: [],
};

async function ensureStoreFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(STORE_FILE, "utf8");
  } catch {
    await writeFile(STORE_FILE, JSON.stringify(DEFAULT_STORE, null, 2), "utf8");
  }
}

async function readStore(): Promise<StoreShape> {
  await ensureStoreFile();
  const raw = await readFile(STORE_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    return {
      chats: Array.isArray(parsed.chats) ? parsed.chats : [],
      votes: Array.isArray(parsed.votes) ? parsed.votes : [],
    };
  } catch {
    return DEFAULT_STORE;
  }
}

async function writeStore(store: StoreShape) {
  await ensureStoreFile();
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

export async function upsertChat(params: {
  id: string;
  title: string;
  visibility: "public" | "private";
  userId?: string;
}) {
  const store = await readStore();
  const existing = store.chats.find((chat) => chat.id === params.id);

  if (existing) {
    existing.title = existing.title || params.title;
    existing.visibility = params.visibility;
  } else {
    store.chats.push({
      id: params.id,
      createdAt: new Date().toISOString(),
      title: params.title,
      userId: params.userId ?? "local-user",
      visibility: params.visibility,
    });
  }

  await writeStore(store);
}

export async function getChats(params: { limit: number; endingBefore?: string }) {
  const store = await readStore();

  const sorted = [...store.chats].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  let startIndex = 0;
  if (params.endingBefore) {
    const index = sorted.findIndex((chat) => chat.id === params.endingBefore);
    if (index >= 0) {
      startIndex = index + 1;
    }
  }

  const slice = sorted.slice(startIndex, startIndex + params.limit);
  const hasMore = startIndex + params.limit < sorted.length;

  const chats: Chat[] = slice.map((chat) => ({
    ...chat,
    createdAt: new Date(chat.createdAt),
  }));

  return { chats, hasMore };
}

export async function deleteChat(chatId: string) {
  const store = await readStore();
  store.chats = store.chats.filter((chat) => chat.id !== chatId);
  store.votes = store.votes.filter((vote) => vote.chatId !== chatId);
  await writeStore(store);
}

export async function getVotes(chatId: string): Promise<Vote[]> {
  const store = await readStore();
  return store.votes
    .filter((vote) => vote.chatId === chatId)
    .map(({ chatId: currentChatId, messageId, isUpvoted }) => ({
      chatId: currentChatId,
      messageId,
      isUpvoted,
    }));
}

export async function saveVoteIfMissing(vote: Vote): Promise<{ inserted: boolean }> {
  const store = await readStore();

  const exists = store.votes.some(
    (existing) =>
      existing.chatId === vote.chatId && existing.messageId === vote.messageId
  );

  if (exists) {
    return { inserted: false };
  }

  store.votes.push({
    ...vote,
    createdAt: new Date().toISOString(),
  });
  await writeStore(store);

  return { inserted: true };
}
