"use client";

import { MAX_PROMPT_CHARS } from "@/lib/agent/protocol";
import { runAgent, stopAgent } from "@/lib/agent/runAgent";
import { selectRunning, useChatStore } from "@/lib/chat/store";

export function ChatComposer() {
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const running = useChatStore(selectRunning);

  function send() {
    if (running || !draft.trim()) return;
    void runAgent(draft);
    setDraft("");
  }

  return (
    <form
      className="flex items-end gap-2 border-t border-chrome-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <textarea
        id="chat-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            send();
          }
        }}
        rows={2}
        maxLength={MAX_PROMPT_CHARS}
        placeholder="Ask the AI to change the deck…"
        className="min-h-10 flex-1 resize-none rounded border border-chrome-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      {running ? (
        <button
          type="button"
          onClick={stopAgent}
          className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
        >
          Stop
        </button>
      ) : (
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      )}
    </form>
  );
}
