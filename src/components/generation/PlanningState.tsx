"use client";

import { useGenerationStore } from "@/lib/generation/store";

export function PlanningState() {
  const title = useGenerationStore((s) => s.nextTitle);
  return (
    <div role="status" className="flex h-full flex-col items-center justify-center gap-3 p-8">
      <p className="animate-pulse text-sm font-medium text-zinc-600">Planning your deck…</p>
      {title && <p className="text-sm text-zinc-500">{title}</p>}
    </div>
  );
}
