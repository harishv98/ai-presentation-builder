import { ArtboardViewport } from "@/components/canvas/ArtboardViewport";

export function EditorShell() {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-chrome-border bg-white px-4">
        <span className="text-sm font-semibold">AI Presentation Builder</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[200px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-chrome-border bg-white p-3">
          <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Slides</h2>
          <div className="flex aspect-video items-center justify-center rounded border border-dashed border-zinc-300 text-xs text-zinc-400">
            No slides yet
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <ArtboardViewport>
            <div className="flex h-full items-center justify-center text-4xl text-zinc-300">Empty slide</div>
          </ArtboardViewport>
        </main>

        <aside className="flex w-[360px] shrink-0 flex-col border-l border-chrome-border bg-white">
          <h2 className="border-b border-chrome-border px-4 py-3 text-xs font-medium tracking-wide text-zinc-500 uppercase">
            Chat
          </h2>
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-zinc-400">
            Describe the deck you want to create.
          </div>
        </aside>
      </div>
    </div>
  );
}
