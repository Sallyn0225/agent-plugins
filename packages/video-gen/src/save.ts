import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function sanitizeFilename(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "video"
  );
}

export async function saveVideo(
  outputDir: string,
  modelId: string,
  prompt: string,
  bytes: Buffer,
  taskId: string,
): Promise<string> {
  await mkdir(outputDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const promptSlug = sanitizeFilename(prompt);
  const modelSlug = sanitizeFilename(modelId);
  const taskSlug = sanitizeFilename(taskId).slice(0, 16);
  const filename = `${stamp}-vid-${modelSlug}-${promptSlug || taskSlug}.mp4`;
  const fullPath = join(outputDir, filename);
  await writeFile(fullPath, bytes);
  return fullPath;
}
