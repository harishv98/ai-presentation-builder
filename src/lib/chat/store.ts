import { create } from "zustand";
import { HISTORY_MESSAGES, type ChatMessage } from "@/lib/agent/protocol";

export type ChatItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "tool"; ok: boolean; summary: string }
  | { id: string; kind: "notice"; tone: "info" | "error"; text: string; retryPrompt?: string }
  | { id: string; kind: "generation"; runId: number };

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
export type NewChatItem = WithoutId<ChatItem>;
export type TurnChanges = { prompt: string; changes: string[] };

type ChatState = {
  items: ChatItem[];
  history: ChatMessage[];
  recentChanges: TurnChanges[];
  draft: string;
  abort: AbortController | null;
  setDraft: (draft: string) => void;
  pushItem: (item: NewChatItem) => string;
  appendText: (id: string, delta: string) => void;
  beginTurn: (abort: AbortController) => void;
  endTurn: (exchange: ChatMessage[], changes: TurnChanges) => void;
};

let nextItemId = 1;

export const useChatStore = create<ChatState>()((set) => ({
  items: [],
  history: [],
  recentChanges: [],
  draft: "",
  abort: null,
  setDraft: (draft) => set({ draft }),
  pushItem(item) {
    const id = `c${nextItemId++}`;
    set((s) => ({ items: [...s.items, { ...item, id } as ChatItem] }));
    return id;
  },
  appendText: (id, delta) =>
    set((s) => ({
      items: s.items.map((item) => (item.id === id && item.kind === "assistant" ? { ...item, text: item.text + delta } : item)),
    })),
  beginTurn: (abort) => set({ abort }),
  endTurn: (exchange, changes) =>
    set((s) => ({
      abort: null,
      history: [...s.history, ...exchange].slice(-HISTORY_MESSAGES),
      recentChanges: changes.changes.length > 0 ? [...s.recentChanges, changes].slice(-HISTORY_MESSAGES / 2) : s.recentChanges,
    })),
}));

export const selectRunning = (s: ChatState) => s.abort !== null;

export function pushNotice(tone: "info" | "error", text: string, retryPrompt?: string): void {
  useChatStore.getState().pushItem({ kind: "notice", tone, text, ...(retryPrompt && { retryPrompt }) });
}
