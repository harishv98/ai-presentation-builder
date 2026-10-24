"use client";

import { ImagePickerButton } from "@/components/insert/ImagePickerButton";
import { replaceImage } from "@/lib/content/actions";
import type { ElementOf } from "@/lib/deck/schema";
import { Section } from "./fields";

export function ImageInspector({ element }: { element: ElementOf<"image"> }) {
  return (
    <Section title="Image">
      <div className="flex flex-wrap items-center gap-2">
        <ImagePickerButton
          label="Replace image…"
          tooltip="Choose another image; the size and position stay"
          variant="outline"
          onPicked={(picked) => replaceImage(element.id, picked)}
        />
      </div>
    </Section>
  );
}
