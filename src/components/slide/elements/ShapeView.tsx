import type { ElementOf } from "@/lib/deck/schema";

export function ShapeView({ element }: { element: ElementOf<"shape"> }) {
  const { kind, fill, stroke } = element.shape;

  if (kind === "line") {
    return (
      <div className="flex h-full w-full items-center">
        <div className="h-1 w-full" style={{ background: fill }} />
      </div>
    );
  }

  return (
    <div
      className={kind === "ellipse" ? "h-full w-full rounded-full" : "h-full w-full"}
      style={{ background: fill, border: stroke ? `4px solid ${stroke}` : undefined }}
    />
  );
}
