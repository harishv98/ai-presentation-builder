"use client";

import { ImagePickerButton } from "@/components/insert/ImagePickerButton";
import { replaceImage } from "@/lib/content/actions";
import type { ElementOf } from "@/lib/deck/schema";
import { Section, smallButtonClass } from "./fields";

export function ImageInspector({ element }: { element: ElementOf<"image"> }) {
  return (
    <Section title="Image">
      <div className="flex flex-wrap items-center gap-2">
        <ImagePickerButton
          label="Replace image…"
          title="Choose another image; the size and position stay"
          className={smallButtonClass}
          onPicked={(picked) => replaceImage(element.id, picked)}
        />
      </div>
    </Section>
  );
}
