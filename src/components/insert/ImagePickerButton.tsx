"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { readImageFile, type PickedImage } from "@/lib/content/image";

export function ImagePickerButton({
  label,
  icon,
  tooltip,
  variant,
  onPicked,
}: {
  label: string;
  icon?: ReactNode;
  tooltip: string;
  variant?: ButtonVariant;
  onPicked: (image: PickedImage) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button variant={variant} tooltip={tooltip} onClick={() => inputRef.current?.click()}>
        {icon}
        {label}
      </Button>
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
