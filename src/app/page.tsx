import { Suspense } from "react";
import { ClientOnly } from "@/components/shell/ClientOnly";
import { EditorShell } from "@/components/shell/EditorShell";

const loading = <div className="flex h-screen items-center justify-center text-sm text-zinc-400">Loading editor…</div>;

export default function Home() {
  return (
    <ClientOnly fallback={loading}>
      <Suspense fallback={loading}>
        <EditorShell />
      </Suspense>
    </ClientOnly>
  );
}
