import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function run(
  command: string,
  args: string[],
  cwd = repoRoot,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("docs-check CLI", () => {
  it("reports deterministic diagnostics on stderr and exits one", async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), "agent-plugins-docs-cli-"));
    await writeFile(path.join(fixture, "README.md"), "# Broken\n\n[missing](nope.md)\n", "utf8");

    const result = await run(process.execPath, [
      path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
      "scripts/docs/validate.ts",
      fixture,
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("README.md:3 [internal-link]");
  });

  it("is exposed through the root docs:check command", async () => {
    const result =
      process.platform === "win32"
        ? await run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm run docs:check"])
        : await run("npm", ["run", "docs:check"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Documentation check passed");
    expect(result.stderr).toBe("");
  });
});
