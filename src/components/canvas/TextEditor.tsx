"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { textCss } from "@/components/slide/elements/TextView";
import { commitText } from "@/lib/content/actions";
import { useDeckStore } from "@/lib/deck/store";
import { useUiStore, type TextCaret } from "@/lib/ui/store";

const EDITOR_Z = 5000;
const FORMAT_KEYS = new Set(["b", "i", "u"]);

export function TextEditor({ elementId, caret }: { elementId: string; caret: TextCaret }) {
  const element = useDeckStore((s) => s.deck.elements[elementId]);
  const [initial] = useState(() => (element?.type === "text" ? element.text : null));
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    placeCaret(node, caret);
  }, [caret]);

  if (element?.type !== "text" || !initial) return null;
  const { box } = element;
  const lines = initial.content.length > 0 ? initial.content : [""];

  return (
    <div
      ref={ref}
      data-editor
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline
      aria-label="Edit text"
      className="absolute cursor-text leading-tight break-words outline-none select-text"
      style={{ ...textCss(element.text.style), left: box.x, top: box.y, width: box.w, minHeight: box.h, zIndex: EDITOR_Z }}
      onBlur={(event) => {
        commitText(elementId, readLines(event.currentTarget), event.currentTarget.offsetHeight);
        useUiStore.getState().setEditing(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if ((event.metaKey || event.ctrlKey) && FORMAT_KEYS.has(event.key.toLowerCase())) {
          event.preventDefault();
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
      }}
      onDrop={(event) => event.preventDefault()}
    >
      {initial.role === "bullets" ? (
        <ul className="flex list-disc flex-col gap-[0.4em] pl-[1.2em]">
          {lines.map((line, i) => (
            <li key={i}>{line || <br />}</li>
          ))}
        </ul>
      ) : (
        lines.map((line, i) => <div key={i}>{line || <br />}</div>)
      )}
    </div>
  );
}

function readLines(node: HTMLElement): string[] {
  const lines = node.innerText.replace(/\u00a0/g, " ").split("\n");
  while (lines.length > 1 && lines.at(-1)!.trim() === "") lines.pop();
  return lines;
}

function placeCaret(node: HTMLElement, caret: TextCaret): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  if (caret !== "all") {
    const point = caretPoint(caret.x, caret.y);
    if (point && node.contains(point.node)) {
      range.setStart(point.node, point.offset);
      range.collapse(true);
    } else {
      range.collapse(false);
    }
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function caretPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Partial<Pick<Document, "caretPositionFromPoint" | "caretRangeFromPoint">>;
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}
