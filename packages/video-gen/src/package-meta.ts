import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function packageRootDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..");
}

export function getPackageVersion(): string {
  const packageJsonPath = join(packageRootDir(), "package.json");
  const raw = readFileSync(packageJsonPath, "utf8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  if (typeof parsed.version !== "string" || !parsed.version.trim()) {
    throw new Error(`Missing version in ${packageJsonPath}`);
  }
  return parsed.version;
}
