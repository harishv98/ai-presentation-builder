"use client";

import dynamic from "next/dynamic";

const loading = (
  <div className="flex h-screen items-center justify-center text-sm text-zinc-400">
    Loading editor…
  </div>
);
const EditorShell = dynamic(
  () => import("@/components/shell/EditorShell").then((mod) => mod.EditorShell),
  {
    ssr: false,
    loading: () => loading,
  },
);

export default function Home() {
  return <EditorShell />;
}
