import type { ElementOf } from "@/lib/deck/schema";

export function TextView({ element }: { element: ElementOf<"text"> }) {
  const { role, content, style } = element.text;
  const css = {
    fontSize: style.fontSize,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? "italic" : "normal",
    textAlign: style.align,
    color: style.color,
  } as const;

  return (
    <div className="h-full w-full overflow-hidden leading-tight break-words" style={css}>
      {role === "bullets" ? (
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
