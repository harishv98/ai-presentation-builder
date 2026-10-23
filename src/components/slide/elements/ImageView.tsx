import type { ElementOf } from "@/lib/deck/schema";

export function ImageView({ element }: { element: ElementOf<"image"> }) {
  const { src, alt, fit } = element.image;
  return <img src={src} alt={alt} draggable={false} className="h-full w-full select-none" style={{ objectFit: fit }} />;
}
