import { describe, expect, it } from "vitest";
import type { DiscoveredPlugin } from "../../scripts/agent-plugin/discover.js";
import { parseAgentPlugin } from "../../scripts/agent-plugin/schema.js";
import { validatePackedFileList } from "../../scripts/package-contents/validate.js";

function plugin(): DiscoveredPlugin {
  return {
    packageDir: "/repo/packages/example",
    packageJson: {
      name: "@sallyn0225/example",
      version: "1.0.0",
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      bin: { example: "dist/cli.js" },
      files: ["dist", "skills", "README.md", "README.zh-CN.md", "LICENSE"],
    },
    agentPlugin: parseAgentPlugin({
      schemaVersion: 1,
      id: "example",
      displayName: "Example",
      maturity: "experimental",
      interfaces: { library: true, cli: true, mcp: false, skill: true },
      skill: { format: "agent-skills", path: "skills/example" },
      verification: { automated: ["unit", "package-contents"], liveProviders: "none" },
    }),
  };
}

const validFiles = [
  "package.json",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/cli.js",
  "skills/example/SKILL.md",
  "README.md",
  "README.zh-CN.md",
  "LICENSE",
];

describe("package-content validation", () => {
  it("accepts a complete allowlisted package", () => {
    expect(validatePackedFileList(plugin(), validFiles)).toEqual([]);
  });

  it("reports missing public artifacts", () => {
    const issues = validatePackedFileList(
      plugin(),
      validFiles.filter((file) => file !== "dist/cli.js"),
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "missing-artifact",
        message: expect.stringContaining("dist/cli.js"),
      }),
    );
  });

  it.each(["tests/cli.test.js", "fixtures/tiny.png", "config.local.json", ".env", "src/index.ts"])(
    "rejects forbidden artifact %s",
    (file) => {
      const candidate = plugin();
      candidate.packageJson.files = [...(candidate.packageJson.files ?? []), file];
      const issues = validatePackedFileList(candidate, [...validFiles, file]);

      expect(issues).toContainEqual(expect.objectContaining({ code: "forbidden-artifact" }));
    },
  );

  it("rejects artifacts outside the files allowlist", () => {
    const issues = validatePackedFileList(plugin(), [...validFiles, "notes.txt"]);

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "undeclared-artifact",
        message: expect.stringContaining("notes.txt"),
      }),
    );
  });
});
