import type { CSSProperties } from "react";
import type { ElementOf, TextStyle } from "@/lib/deck/schema";
import type { RenderVariant } from "./ElementView";

export function textCss(style: TextStyle): CSSProperties {
  return {
    fontSize: style.fontSize,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? "italic" : "normal",
    textAlign: style.align,
    color: style.color,
  };
}

export function TextView({ element, variant }: { element: ElementOf<"text">; variant: RenderVariant }) {
  const { role, content, style } = element.text;
  const blank = content.every((line) => line.trim() === "");

  return (
    <div className="h-full w-full overflow-hidden leading-tight break-words" style={textCss(style)}>
      {blank && variant === "canvas" ? (
        <p className="italic opacity-40">Empty text</p>
      ) : role === "bullets" ? (
        <ul className="flex list-disc flex-col gap-[0.4em] pl-[1.2em]">
          {content.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : (
        content.map((paragraph, i) => <p key={i}>{paragraph}</p>)
      )}
    </div>
  );
}
