import { ClientOnly } from "@/components/shell/ClientOnly";
import { EditorShell } from "@/components/shell/EditorShell";

export default function Home() {
  return (
    <ClientOnly fallback={<div className="flex h-screen items-center justify-center text-sm text-zinc-400">Loading editor…</div>}>
      <EditorShell />
    </ClientOnly>
  );
}
