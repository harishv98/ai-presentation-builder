import type { CSSProperties } from "react";
import type { ElementOf, TextPayload, TextStyle } from "@/lib/deck/schema";
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

export function TextLines({ role, lines, editable }: { role: TextPayload["role"]; lines: string[]; editable?: boolean }) {
  const show = (line: string) => (editable && !line ? <br /> : line);
  if (role === "bullets" || role === "numbered") {
    const List = role === "bullets" ? "ul" : "ol";
    return (
      <List className={`flex flex-col gap-[0.4em] ${role === "bullets" ? "list-disc pl-[1.2em]" : "list-decimal pl-[1.6em]"}`}>
        {lines.map((line, i) => (
          <li key={i}>{show(line)}</li>
        ))}
      </List>
    );
  }
  const Line = editable ? "div" : "p";
  return lines.map((line, i) => <Line key={i}>{show(line)}</Line>);
}

export function TextView({ element, variant }: { element: ElementOf<"text">; variant: RenderVariant }) {
  const { role, content, style } = element.text;
  const blank = content.every((line) => line.trim() === "");

  return (
    <div className="h-full w-full overflow-hidden leading-tight break-words" style={textCss(style)}>
      {blank && variant === "canvas" ? <p className="italic opacity-40">Empty text</p> : <TextLines role={role} lines={content} />}
    </div>
  );
}
