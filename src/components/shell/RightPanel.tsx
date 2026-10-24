"use client";

import { useEffect, type ReactNode } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Inspector } from "@/components/inspector/Inspector";
import { selectRunning, useChatStore } from "@/lib/chat/store";
import { useUiStore, type RightPanelTab } from "@/lib/ui/store";

export function RightPanel() {
  const tab = useUiStore((s) => s.rightPanel);
  const setRightPanel = useUiStore((s) => s.setRightPanel);
  const running = useChatStore(selectRunning);

  useEffect(() => {
    if (running) setRightPanel("chat");
  }, [running, setRightPanel]);

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-chrome-border bg-white">
      <div role="tablist" aria-label="Side panel" className="flex border-b border-chrome-border px-2">
        <TabButton tab="chat" current={tab} onSelect={setRightPanel}>
          Chat
          {running && tab !== "chat" && (
            <span className="ml-1.5 inline-block size-1.5 animate-pulse rounded-full bg-accent" aria-label="AI is replying" />
          )}
        </TabButton>
        <TabButton tab="format" current={tab} onSelect={setRightPanel}>
          Format
        </TabButton>
      </div>
      <div
        role="tabpanel"
        id="panel-chat"
        aria-labelledby="tab-chat"
        hidden={tab !== "chat"}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ChatPanel />
      </div>
      <div
        role="tabpanel"
        id="panel-format"
        aria-labelledby="tab-format"
        hidden={tab !== "format"}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <Inspector />
      </div>
    </aside>
  );
}

function TabButton({
  tab,
  current,
  onSelect,
  children,
}: {
  tab: RightPanelTab;
  current: RightPanelTab;
  onSelect: (tab: RightPanelTab) => void;
  children: ReactNode;
}) {
  const selected = tab === current;
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${tab}`}
      aria-controls={`panel-${tab}`}
      aria-selected={selected}
      onClick={() => onSelect(tab)}
      className={`-mb-px flex items-center border-b-2 px-3 py-3 text-xs font-medium tracking-wide uppercase ${
        selected ? "border-accent text-accent" : "border-transparent text-zinc-500 hover:text-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
