import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GeneratedImage } from "./types.js";

function extensionFromMime(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/png":
    default:
      return "png";
  }
}

function sanitizeFilename(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "image"
  );
}

export async function saveImages(
  outputDir: string,
  modelAlias: string,
  prompt: string,
  images: GeneratedImage[],
  operation: "generate" | "edit" = "generate",
): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const promptSlug = sanitizeFilename(prompt);
  const modelSlug = sanitizeFilename(modelAlias);
  const opSlug = operation === "edit" ? "edit" : "gen";
  const paths: string[] = [];

  for (let i = 0; i < images.length; i += 1) {
    const image = images[i];
    const ext = extensionFromMime(image.mimeType);
    const suffix = images.length > 1 ? `-${i + 1}` : "";
    const filename = `${stamp}-${opSlug}-${modelSlug}-${promptSlug}${suffix}.${ext}`;
    const fullPath = join(outputDir, filename);
    await writeFile(fullPath, Buffer.from(image.base64, "base64"));
    paths.push(fullPath);
  }

  return paths;
}
