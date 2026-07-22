import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateRepository } from "../../scripts/agent-plugin/validate.js";
import { AGENT_PLUGIN_SCHEMA_VERSION } from "../../scripts/agent-plugin/schema.js";

async function writePackage(
  repoRoot: string,
  dirName: string,
  packageJson: Record<string, unknown>,
  files: Record<string, string> = {},
) {
  const packageDir = path.join(repoRoot, "packages", dirName);
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    path.join(packageDir, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  );
  for (const [relative, contents] of Object.entries(files)) {
    const abs = path.join(packageDir, relative);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, contents, "utf8");
  }
  return packageDir;
}

const skillMd = `---
name: image-gen
description: Generate or edit images via the local image-gen CLI.
---

# Image Generation
`;

function baseAgentPlugin(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: AGENT_PLUGIN_SCHEMA_VERSION,
    id: "image-gen",
    displayName: "Image Generation",
    maturity: "stable",
    interfaces: {
      library: true,
      cli: true,
      mcp: true,
      skill: true,
    },
    mcp: {
      transport: "stdio",
      tools: ["list_image_models", "generate_image", "edit_image"],
    },
    skill: {
      format: "agent-skills",
      path: "skills/image-gen",
    },
    verification: {
      automated: ["unit", "offline-cli", "offline-mcp", "metadata"],
      liveProviders: "manual",
    },
    ...overrides,
  };
}

describe("validateRepository", () => {
  it("accepts a compliant Capability Plugin package", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "agent-plugins-ok-"));
    await writePackage(
      repoRoot,
      "image-gen",
      {
        name: "@sallyn0225/image-gen",
        version: "1.1.1",
        license: "MIT",
        engines: { node: ">=22" },
        main: "./dist/index.js",
        bin: {
          "image-gen": "dist/cli.js",
          "image-gen-mcp": "dist/mcp.js",
        },
        files: ["dist", "skills", "README.md", "README.zh-CN.md", "LICENSE"],
        repository: {
          type: "git",
          url: "git+https://github.com/Sallyn0225/agent-plugins.git",
          directory: "packages/image-gen",
        },
        agentPlugin: baseAgentPlugin(),
      },
      {
        "README.md": "# image-gen\n",
        "README.zh-CN.md": "# image-gen\n",
        "skills/image-gen/SKILL.md": skillMd,
        "src/cli.ts": "export {};\n",
        "src/mcp.ts": "export {};\n",
      },
    );

    const result = await validateRepository(repoRoot);
    expect(result.ok).toBe(true);
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]?.agentPlugin.maturity).toBe("stable");
  });

  it("reports naming, engines, skill inclusion, and bilingual README issues", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "agent-plugins-bad-"));
    await writePackage(
      repoRoot,
      "image-gen",
      {
        name: "@other/image-gen",
        version: "1.1.1",
        license: "ISC",
        engines: { node: ">=18" },
        bin: { "image-gen": "dist/cli.js" },
        files: ["dist"],
        repository: {
          type: "git",
          url: "git+https://github.com/example/other.git",
        },
        agentPlugin: baseAgentPlugin(),
      },
      {
        "src/cli.ts": "export {};\n",
        // skill missing, READMEs missing
      },
    );

    const result = await validateRepository(repoRoot);
    expect(result.ok).toBe(false);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain("package-name");
    expect(codes).toContain("license");
    expect(codes).toContain("repository");
    expect(codes).toContain("engines");
    expect(codes).toContain("skill-missing");
    expect(codes).toContain("readme");
  });
});
