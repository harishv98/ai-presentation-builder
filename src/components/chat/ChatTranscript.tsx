"use client";

import { useEffect, useRef } from "react";
import { runAgent } from "@/lib/agent/runAgent";
import { selectRunning, useChatStore, type ChatItem } from "@/lib/chat/store";

const EXAMPLES = [
  "Make slide 2 more concise",
  "Switch the revenue chart to a line chart",
  "Add a 2027 forecast series to the revenue chart",
  "Add a slide about pricing before Next Steps",
];

export function ChatTranscript() {
  const items = useChatStore((s) => s.items);
  const running = useChatStore(selectRunning);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items, running]);

  if (items.length === 0) return <EmptyChat />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4 text-sm">
      {items.map((item) => (
        <ChatRow key={item.id} item={item} running={running} />
      ))}
      {running && items.at(-1)?.kind !== "assistant" && <p className="animate-pulse text-xs text-zinc-400">Thinking…</p>}
      <div ref={endRef} />
    </div>
  );
}

function EmptyChat() {
  const setDraft = useChatStore((s) => s.setDraft);
  return (
    <div className="flex flex-1 flex-col justify-center gap-3 p-6 text-sm text-zinc-500">
      <p>Ask the AI to change this deck. It edits the slides in place, and ⌘Z undoes a whole reply.</p>
      <ul className="flex flex-col gap-1.5">
        {EXAMPLES.map((example) => (
          <li key={example}>
            <button
              type="button"
              onClick={() => {
                setDraft(example);
                document.getElementById("chat-input")?.focus();
              }}
              className="w-full rounded border border-chrome-border px-3 py-2 text-left text-zinc-700 hover:border-accent hover:text-accent"
            >
              {example}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatRow({ item, running }: { item: ChatItem; running: boolean }) {
  switch (item.kind) {
    case "user":
      return <p className="ml-8 self-end rounded-lg bg-accent px-3 py-2 whitespace-pre-wrap text-white">{item.text}</p>;
    case "assistant":
      return <p className="mr-8 whitespace-pre-wrap text-zinc-800">{item.text.trim()}</p>;
    case "tool":
      return (
        <p className={`text-xs ${item.ok ? "text-emerald-700" : "text-amber-700"}`}>
          {item.ok ? "✓" : "✗"} {item.summary}
        </p>
      );
    case "notice": {
      const retry = item.retryPrompt;
      return (
        <div className={`rounded px-3 py-2 text-xs ${item.tone === "error" ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-600"}`}>
          <p>{item.text}</p>
          {retry && !running && (
            <button type="button" onClick={() => void runAgent(retry)} className="mt-1 font-medium underline">
              Retry
            </button>
          )}
        </div>
      );
    }
  }
}
