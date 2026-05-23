import type { ImageInfo } from "../types/page.js";

export function isMissingRequiredAlt(image: ImageInfo): boolean {
  return !image.alt && shouldRequireImageAlt(image.src);
}

export function shouldRequireImageAlt(src: string): boolean {
  const lowerSrc = src.toLowerCase();
  const filename = getImageFilename(lowerSrc);

  if (lowerSrc.startsWith("data:")) return false;
  if (lowerSrc.includes("logo") || filename.includes("logo")) return false;
  if (lowerSrc.includes("icon") || filename.includes("icon")) return false;
  if (lowerSrc.includes("payment") || filename.includes("payment")) return false;
  if (lowerSrc.includes("placeholder") || filename.includes("placeholder")) return false;
  if (lowerSrc.includes("sprite") || filename.includes("sprite")) return false;
  if (lowerSrc.includes("/preview_images/") || filename.includes("thumbnail")) return false;
  if (filename.endsWith(".svg")) return false;

  return true;
}

export function getImageFilename(src: string): string {
  try {
    return decodeURIComponent(new URL(src).pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    return src.split("/").filter(Boolean).pop() || src;
  }
}
