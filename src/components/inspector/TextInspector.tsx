"use client";

import { editElement } from "@/lib/content/actions";
import type { ElementOf } from "@/lib/deck/schema";
import { Field, Hint, Section, Segmented } from "./fields";

type ListStyle = "none" | "bullets" | "numbered";

const LIST_OPTIONS: { value: ListStyle; label: string }[] = [
  { value: "none", label: "Paragraph" },
  { value: "bullets", label: "Bullets" },
  { value: "numbered", label: "Numbered" },
];

export function TextInspector({ element }: { element: ElementOf<"text"> }) {
  const { role } = element.text;
  const list: ListStyle = role === "bullets" || role === "numbered" ? role : "none";

  return (
    <>
      <Section title="Text">
        <Field label="List">
          <Segmented
            ariaLabel="List style"
            value={list}
            options={LIST_OPTIONS}
            onChange={(next) => editElement(element.id, { text: { role: next === "none" ? "body" : next } }, "Change list style")}
          />
        </Field>
      </Section>
      <Hint>Double-click the text on the slide, or press Enter, to edit it. Each line is one list item.</Hint>
    </>
  );
}
