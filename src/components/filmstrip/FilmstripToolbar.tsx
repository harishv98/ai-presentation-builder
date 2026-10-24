"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { addBlankSlide } from "@/lib/slides/actions";

export function FilmstripToolbar() {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Slides</h2>
      <Button size="xs" tooltip="Add a blank slide after the current one" onClick={() => addBlankSlide("after-current")}>
        <Plus aria-hidden />
        New
      </Button>
    </div>
  );
}
