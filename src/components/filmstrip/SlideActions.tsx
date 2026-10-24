"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { deleteSlide } from "@/lib/slides/actions";

export function SlideActions({ slideId, active }: { slideId: string; active: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      <Button size="xs" iconOnly danger aria-label="Delete slide" tooltip="Delete" onClick={() => deleteSlide(slideId)}>
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
}
