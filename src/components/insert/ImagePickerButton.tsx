"use client";

import { useRef, useState } from "react";
import { readImageFile, type PickedImage } from "@/lib/content/image";

export function ImagePickerButton({
  label,
  title,
  className,
  onPicked,
}: {
  label: string;
  title: string;
  className: string;
  onPicked: (image: PickedImage) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button type="button" className={className} title={title} onClick={() => inputRef.current?.click()}>
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          setError(null);
          if (!file) return;
          try {
            onPicked(await readImageFile(file));
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Couldn't read that image.");
          }
        }}
      />
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </>
  );
}
