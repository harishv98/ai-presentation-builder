"use client";

import { Button } from "@/components/ui/Button";
import { MAX_PROMPT_CHARS } from "@/lib/agent/protocol";
import { stopAgent } from "@/lib/agent/flows/runAgent";
import { sendPrompt } from "@/lib/agent/flows/sendPrompt";
import { selectRunning, useChatStore } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";

export function ChatComposer() {
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const running = useChatStore(selectRunning);
  const emptyDeck = useDeckStore((s) => s.deck.slideOrder.length === 0);

  function send() {
    if (running || !draft.trim()) return;
    void sendPrompt(draft);
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
        placeholder={emptyDeck ? "Describe the presentation you want…" : "Ask the AI to change the deck…"}
        className="min-h-10 flex-1 resize-none rounded border border-chrome-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      {running ? (
        <Button variant="outline" size="lg" onClick={stopAgent}>
          Stop
        </Button>
      ) : (
        <Button type="submit" variant="primary" size="lg" disabled={!draft.trim()}>
          Send
        </Button>
      )}
    </form>
  );
}
