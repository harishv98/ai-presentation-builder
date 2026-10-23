"use client";

import { ChatComposer } from "./ChatComposer";
import { ChatTranscript } from "./ChatTranscript";

export function ChatPanel() {
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-chrome-border bg-white">
      <h2 className="border-b border-chrome-border px-4 py-3 text-xs font-medium tracking-wide text-zinc-500 uppercase">
        Chat
      </h2>
      <ChatTranscript />
      <ChatComposer />
    </aside>
  );
}
