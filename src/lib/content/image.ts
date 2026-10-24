export type PickedImage = { src: string; alt: string; width: number; height: number };

const MAX_BYTES = 10 * 1024 * 1024;
const REENCODE_BYTES = 1.5 * 1024 * 1024;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;
const KEEP_AS_IS = new Set(["image/svg+xml", "image/gif"]);
const FALLBACK_SIZE = { width: 800, height: 500 };

export async function readImageFile(file: File): Promise<PickedImage> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  if (file.size > MAX_BYTES) throw new Error("Images must be 10 MB or smaller.");

  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  const width = img.naturalWidth || FALLBACK_SIZE.width;
  const height = img.naturalHeight || FALLBACK_SIZE.height;
  const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Uploaded image";
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

  if (KEEP_AS_IS.has(file.type) || (scale === 1 && file.size <= REENCODE_BYTES)) {
    return { src: original, alt, width, height };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Couldn't read that image.");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  return { src: canvas.toDataURL(type, JPEG_QUALITY), alt, width: canvas.width, height: canvas.height };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = src;
  });
}
