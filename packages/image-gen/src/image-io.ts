import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { ImageInput } from "./types.js";

export function guessMimeFromBase64(b64: string): string {
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("UklGR")) return "image/webp";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  return "image/png";
}

export function guessMimeFromPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

export function stripDataUrl(value: string): { base64: string; mimeType?: string } {
  const match = value.match(/^data:([^;]+);base64,(.+)$/s);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return { base64: value };
}

export async function resolveImageInput(input: ImageInput): Promise<{
  base64: string;
  mimeType: string;
  bytes: Buffer;
  filename: string;
}> {
  if (input.path) {
    const bytes = await readFile(input.path);
    const mimeType = input.mimeType ?? guessMimeFromPath(input.path);
    const filename = input.path.split(/[\\/]/).pop() || "image.png";
    return {
      base64: bytes.toString("base64"),
      mimeType,
      bytes,
      filename,
    };
  }

  if (input.base64) {
    const stripped = stripDataUrl(input.base64);
    const base64 = stripped.base64;
    const mimeType = input.mimeType ?? stripped.mimeType ?? guessMimeFromBase64(base64);
    const ext =
      mimeType === "image/jpeg"
        ? "jpg"
        : mimeType === "image/webp"
          ? "webp"
          : mimeType === "image/gif"
            ? "gif"
            : "png";
    return {
      base64,
      mimeType,
      bytes: Buffer.from(base64, "base64"),
      filename: `image.${ext}`,
    };
  }

  throw new Error("Image input requires either path or base64");
}

export async function fetchAsBase64(
  url: string,
  signal?: AbortSignal,
): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to download image url (${res.status}): ${url}`);
  }
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), mimeType };
}
