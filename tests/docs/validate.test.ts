import { cp, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateCatalogFreshness,
  validateDocumentation,
  validateInternalLinks,
  validateLanguageLinks,
  validateRequiredSections,
  validateSharedFacts,
} from "../../scripts/docs/validate.js";

const repoRoot = process.cwd();

async function fixture(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "agent-plugins-docs-"));
}

async function write(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

describe("documentation validation public seams", () => {
  it("detects a missing reciprocal language link", async () => {
    const root = await fixture();
    await write(root, "README.md", "# Example\n\n> 中文: [README.zh-CN.md](./README.zh-CN.md)\n");
    await write(root, "README.zh-CN.md", "# 示例\n\n没有返回英文文档的链接。\n");

    const issues = await validateLanguageLinks(root);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "language-link", file: "README.zh-CN.md" }),
      ]),
    );
  });

  it("discovers publishable plugin README pairs instead of hard-coding package names", async () => {
    const root = await fixture();
    await write(root, "packages/example/package.json", JSON.stringify({ agentPlugin: {} }));
    await write(
      root,
      "packages/example/README.md",
      "# Example\n\n> 中文: [README.zh-CN.md](./README.zh-CN.md)\n",
    );
    await write(root, "packages/example/README.zh-CN.md", "# 示例\n");

    const [languageIssues, sectionIssues] = await Promise.all([
      validateLanguageLinks(root),
      validateRequiredSections(root),
    ]);

    expect(languageIssues).toContainEqual(
      expect.objectContaining({ code: "language-link", file: "packages/example/README.zh-CN.md" }),
    );
    expect(sectionIssues).toContainEqual(
      expect.objectContaining({ code: "required-section", file: "packages/example/README.md" }),
    );
  });

  it("detects missing, reordered, and extra unaligned required sections", async () => {
    const root = await fixture();
    await write(
      root,
      "README.md",
      "# Agent Plugins\n\n## Capability Plugins\n\n## Repository Layout\n\n## Documentation\n",
    );
    await write(
      root,
      "README.zh-CN.md",
      "# Agent Plugins\n\n## 能力插件\n\n## 文档导航\n\n## 仅中文额外章节\n",
    );

    const issues = await validateRequiredSections(root);

    expect(issues.some((issue) => issue.code === "section-order")).toBe(true);
    expect(issues.some((issue) => issue.code === "required-section")).toBe(true);
    expect(issues.some((issue) => issue.code === "section-alignment")).toBe(true);
  });

  it("detects broken relative files and heading anchors", async () => {
    const root = await fixture();
    const outside = `${root}-secret.md`;
    await writeFile(outside, "# Secret\n", "utf8");
    await write(
      root,
      "README.md",
      [
        "# Links",
        "",
        "[Missing file](docs/missing.md)",
        "[Missing anchor](docs/guide.md#not-there)",
        "![Missing image](docs/missing.png)",
        `[Escape](../${path.basename(outside)})`,
        "[Malformed](docs/%ZZ.md)",
      ].join("\n"),
    );
    await write(root, "docs/guide.md", "# Guide\n\n## Present\n");

    const issues = await validateInternalLinks(root);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "internal-link", file: "README.md" }),
        expect.objectContaining({
          code: "internal-link",
          message: expect.stringContaining("#not-there"),
        }),
        expect.objectContaining({
          code: "internal-link",
          message: expect.stringContaining("missing.png"),
        }),
        expect.objectContaining({
          code: "internal-link",
          message: expect.stringContaining("escapes repository"),
        }),
        expect.objectContaining({
          code: "internal-link",
          message: expect.stringContaining("Malformed link encoding"),
        }),
      ]),
    );
  });

  it("detects drift in metadata-derived shared facts", async () => {
    const root = await fixture();
    for (const relative of [
      "packages/image-gen/package.json",
      "packages/image-gen/config.example.json",
      "packages/image-gen/docs-contract.json",
      "packages/image-gen/README.md",
      "packages/image-gen/README.zh-CN.md",
      "packages/image-gen/LICENSE",
      "templates/capability-plugin/LICENSE",
      "LICENSE",
      "SECURITY.md",
      "DEVELOPMENT.md",
      "TESTING.md",
      "RELEASING.md",
      "CONTRIBUTING.md",
      "docs/architecture.md",
    ]) {
      const destination = path.join(root, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(repoRoot, relative), destination);
    }
    const packageJson = path.join(root, "packages/image-gen/package.json");
    await writeFile(
      packageJson,
      (await readFile(packageJson, "utf8")).replace(',\n        "package-contents"', ""),
      "utf8",
    );
    const chineseReadme = path.join(root, "packages/image-gen/README.zh-CN.md");
    await writeFile(
      chineseReadme,
      (await readFile(chineseReadme, "utf8")).replace("list_image_models", "list_models_drifted"),
      "utf8",
    );
    const englishReadme = path.join(root, "packages/image-gen/README.md");
    const english = await readFile(englishReadme, "utf8");
    await writeFile(
      englishReadme,
      english
        .replace("1. `IMAGE_GEN_CONFIG`", "1. `IMAGE_GEN_MCP_CONFIG`")
        .replace("2. `IMAGE_GEN_MCP_CONFIG`", "2. `IMAGE_GEN_CONFIG`"),
      "utf8",
    );

    const issues = await validateSharedFacts(root);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "shared-fact",
          file: "packages/image-gen/README.zh-CN.md",
          message: expect.stringContaining("list_image_models"),
        }),
        expect.objectContaining({
          code: "shared-fact",
          file: "packages/image-gen/README.md",
          message: expect.stringContaining("precedence"),
        }),
        expect.objectContaining({
          code: "shared-fact",
          file: "packages/image-gen/README.md",
          message: expect.stringContaining("unconfigured automated scope: package-contents"),
        }),
      ]),
    );
  });

  it("detects stale generated catalogs without rewriting them", async () => {
    const root = await fixture();
    const stale =
      "# Agent Plugins\n\n<!-- agent-plugins:catalog:start -->\nold\n<!-- agent-plugins:catalog:end -->\n";
    await write(root, "README.md", stale);
    await write(root, "README.zh-CN.md", stale);

    const issues = await validateCatalogFreshness(root);

    expect(issues.map((issue) => issue.file)).toEqual(["README.md", "README.zh-CN.md"]);
    expect(await readFile(path.join(root, "README.md"), "utf8")).toBe(stale);
  });

  it("accepts the checked-in documentation as a complete contract", async () => {
    const result = await validateDocumentation(repoRoot);

    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.filesChecked).toContain("packages/image-gen/README.zh-CN.md");
  });
});
