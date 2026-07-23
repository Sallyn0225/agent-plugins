import { spawnSync } from "node:child_process";

const headRef = process.env.GITHUB_HEAD_REF ?? "";

if (headRef.startsWith("changeset-release/")) {
  console.log(`Skipping changeset status on Version Packages branch "${headRef}".`);
  process.exit(0);
}

const result = spawnSync("npx", ["--no-install", "changeset", "status"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
