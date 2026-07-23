#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { generateCatalogs } from "../agent-plugin/generate-catalog.js";
import { AUTOMATED_VERIFICATION_SCOPES } from "../agent-plugin/schema.js";
import {
  DOCUMENT_SECTION_CONTRACTS,
  PACKAGE_README_SECTIONS,
  README_CONTRACTS,
  type SectionPairContract,
} from "./contracts.js";

export type DocumentationIssueCode =
  | "internal-link"
  | "language-link"
  | "required-section"
  | "section-order"
  | "section-alignment"
  | "shared-fact"
  | "catalog-stale";

export type DocumentationIssue = {
  code: DocumentationIssueCode;
  file: string;
  message: string;
  line?: number;
};

export type DocumentationValidationResult = {
  ok: boolean;
  filesChecked: string[];
  issues: DocumentationIssue[];
};

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".agents",
  ".claude",
  "node_modules",
  "dist",
  "coverage",
  "generated-images",
]);

const posix = (value: string): string => value.replace(/\\/g, "/");

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

type DocumentationPlugin = {
  directory: string;
  packageJson: {
    name?: string;
    private?: boolean;
    engines?: { node?: string };
    bin?: string | Record<string, string>;
    agentPlugin?: {
      maturity?: string;
      interfaces?: Record<string, boolean>;
      mcp?: { tools?: string[] };
      skill?: { path?: string };
      verification?: { automated?: string[]; liveProviders?: string };
    };
  };
};

async function documentationPlugins(repoRoot: string): Promise<DocumentationPlugin[]> {
  const plugins: DocumentationPlugin[] = [];
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await readdir(path.join(repoRoot, "packages"), { withFileTypes: true });
  } catch {
    return plugins;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const packageJson = JSON.parse(
        await readFile(path.join(repoRoot, "packages", entry.name, "package.json"), "utf8"),
      ) as DocumentationPlugin["packageJson"];
      if (packageJson.private === true || packageJson.agentPlugin === undefined) continue;
      plugins.push({ directory: entry.name, packageJson });
    } catch {
      // Plugin metadata validation reports malformed package manifests.
    }
  }
  return plugins.sort((a, b) => a.directory.localeCompare(b.directory));
}

async function readmeContracts(repoRoot: string): Promise<SectionPairContract[]> {
  const contracts = [...README_CONTRACTS];
  for (const plugin of await documentationPlugins(repoRoot)) {
    const base = `packages/${plugin.directory}`;
    contracts.push({
      english: `${base}/README.md`,
      chinese: `${base}/README.zh-CN.md`,
      englishSections: [...PACKAGE_README_SECTIONS.english],
      chineseSections: [...PACKAGE_README_SECTIONS.chinese],
    });
  }
  return contracts;
}

async function markdownFiles(repoRoot: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(posix(path.relative(repoRoot, absolute)));
      }
    }
  }
  await walk(repoRoot);
  return files.sort();
}

function h2s(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^##\s+(.+?)\s*#*\s*$/)?.[1])
    .filter((heading): heading is string => heading !== undefined);
}

function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function anchors(markdown: string): Set<string> {
  const result = new Set<string>();
  const counts = new Map<string, number>();
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)?.[1];
    if (!heading) continue;
    const base = githubSlug(heading);
    const count = counts.get(base) ?? 0;
    result.add(count === 0 ? base : `${base}-${count}`);
    counts.set(base, count + 1);
  }
  return result;
}

function stripFencedCode(markdown: string): string {
  return markdown.replace(/^( {0,3})(`{3,}|~{3,}).*?^\1\2\s*$/gms, (block) =>
    block.replace(/[^\n]/g, " "),
  );
}

type MarkdownLink = { target: string; line: number };

function links(markdown: string): MarkdownLink[] {
  const visible = stripFencedCode(markdown);
  const definitions = new Map<string, string>();
  for (const match of visible.matchAll(/^\s*\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/gm)) {
    definitions.set(match[1].trim().toLowerCase(), (match[2] ?? match[3]).trim());
  }

  const found: MarkdownLink[] = [];
  const record = (target: string, index: number): void => {
    const clean = target.trim().replace(/^<|>$/g, "").split(/\s+["']/)[0];
    found.push({ target: clean, line: visible.slice(0, index).split("\n").length });
  };
  for (const match of visible.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    record(match[1], match.index ?? 0);
  }
  for (const match of visible.matchAll(/\[([^\]]+)\]\[([^\]]*)\]/g)) {
    const label = (match[2] || match[1]).trim().toLowerCase();
    const target = definitions.get(label);
    if (target) record(target, match.index ?? 0);
  }
  return found;
}

async function exactCasePath(absolute: string): Promise<boolean> {
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    let names: string[];
    try {
      names = await readdir(current);
    } catch {
      return false;
    }
    if (!names.includes(segment)) return false;
    current = path.join(current, segment);
  }
  return true;
}

function issue(
  code: DocumentationIssueCode,
  file: string,
  message: string,
  line?: number,
): DocumentationIssue {
  return { code, file: posix(file), message, ...(line === undefined ? {} : { line }) };
}

export async function validateLanguageLinks(repoRoot: string): Promise<DocumentationIssue[]> {
  const issues: DocumentationIssue[] = [];
  for (const contract of await readmeContracts(repoRoot)) {
    const pair = [
      { file: contract.english, counterpart: contract.chinese },
      { file: contract.chinese, counterpart: contract.english },
    ];
    for (const item of pair) {
      const absolute = path.join(repoRoot, item.file);
      if (!(await exists(absolute))) {
        issues.push(issue("language-link", item.file, "Required language counterpart is missing."));
        continue;
      }
      const markdown = await readFile(absolute, "utf8");
      const expected = `./${path.basename(item.counterpart)}`;
      const firstContent = markdown.split(/\r?\n/).slice(1, 8).join("\n");
      const linked = links(firstContent).some(({ target }) => target.split("#")[0] === expected);
      if (!linked) {
        issues.push(
          issue("language-link", item.file, `Top language switch must link to ${expected}.`),
        );
      }
    }
  }
  return issues;
}

function checkSections(
  file: string,
  actual: string[],
  expected: string[],
  exact = false,
): DocumentationIssue[] {
  const issues: DocumentationIssue[] = [];
  for (const heading of expected) {
    if (!actual.includes(heading)) {
      issues.push(issue("required-section", file, `Missing required H2 section: ${heading}.`));
    }
  }
  if (exact) {
    for (const heading of actual) {
      if (!expected.includes(heading)) {
        issues.push(issue("required-section", file, `Unexpected H2 section: ${heading}.`));
      }
    }
  }
  const present = actual.filter((heading) => expected.includes(heading));
  const expectedPresent = expected.filter((heading) => actual.includes(heading));
  if (present.join("\0") !== expectedPresent.join("\0")) {
    issues.push(issue("section-order", file, "Required H2 sections are out of order."));
  }
  return issues;
}

export async function validateRequiredSections(repoRoot: string): Promise<DocumentationIssue[]> {
  const issues: DocumentationIssue[] = [];
  for (const contract of await readmeContracts(repoRoot)) {
    const sectionShapes: number[][] = [];
    for (const [file, expected] of [
      [contract.english, contract.englishSections],
      [contract.chinese, contract.chineseSections],
    ] as const) {
      const absolute = path.join(repoRoot, file);
      if (!(await exists(absolute))) {
        issues.push(issue("required-section", file, "Required documentation file is missing."));
        sectionShapes.push([]);
        continue;
      }
      const actual = h2s(await readFile(absolute, "utf8"));
      issues.push(...checkSections(file, actual, expected, true));
      sectionShapes.push(actual.map((heading) => expected.indexOf(heading)));
    }
    if (sectionShapes[0].join("\0") !== sectionShapes[1].join("\0")) {
      issues.push(
        issue(
          "section-alignment",
          contract.chinese,
          `Bilingual README structure does not align with ${contract.english}.`,
        ),
      );
    }
  }

  for (const [file, expected] of Object.entries(DOCUMENT_SECTION_CONTRACTS)) {
    const absolute = path.join(repoRoot, file);
    if (!(await exists(absolute))) {
      issues.push(issue("required-section", file, "Required governance document is missing."));
      continue;
    }
    issues.push(...checkSections(file, h2s(await readFile(absolute, "utf8")), expected));
  }
  return issues;
}

export async function validateInternalLinks(repoRoot: string): Promise<DocumentationIssue[]> {
  const issues: DocumentationIssue[] = [];
  for (const file of await markdownFiles(repoRoot)) {
    const absolute = path.join(repoRoot, file);
    const markdown = await readFile(absolute, "utf8");
    for (const { target, line } of links(markdown)) {
      if (
        !target ||
        /^(?:https?:|mailto:|data:|npm:)/i.test(target) ||
        target.includes("__CAPABILITY_ID__")
      ) continue;
      const [encodedPath, fragment] = target.split("#", 2);
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(encodedPath || "");
      } catch {
        issues.push(issue("internal-link", file, `Malformed link encoding: ${target}.`, line));
        continue;
      }
      const targetFile = decodedPath
        ? path.resolve(path.dirname(absolute), decodedPath)
        : absolute;
      const relativeTarget = path.relative(path.resolve(repoRoot), targetFile);
      if (relativeTarget === ".." || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
        issues.push(issue("internal-link", file, `Link escapes repository: ${target}.`, line));
        continue;
      }
      if (!(await exists(targetFile)) || !(await exactCasePath(targetFile))) {
        issues.push(issue("internal-link", file, `Broken internal link: ${target}.`, line));
        continue;
      }
      if (fragment && targetFile.toLowerCase().endsWith(".md")) {
        const targetMarkdown = await readFile(targetFile, "utf8");
        let decodedFragment: string;
        try {
          decodedFragment = decodeURIComponent(fragment).toLowerCase();
        } catch {
          issues.push(issue("internal-link", file, `Malformed link encoding: ${target}.`, line));
          continue;
        }
        if (!anchors(targetMarkdown).has(decodedFragment)) {
          issues.push(issue("internal-link", file, `Broken heading anchor: ${target}.`, line));
        }
      }
    }
  }
  return issues;
}

function h2Section(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return "";
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

function containsInOrder(content: string, tokens: string[]): boolean {
  let offset = 0;
  for (const token of tokens) {
    const index = content.indexOf(token, offset);
    if (index === -1) return false;
    offset = index + token.length;
  }
  return true;
}

async function requiredTokens(
  repoRoot: string,
  file: string,
  tokens: string[],
): Promise<DocumentationIssue[]> {
  const absolute = path.join(repoRoot, file);
  if (!(await exists(absolute))) {
    return [issue("shared-fact", file, "File required for shared-fact validation is missing.")];
  }
  const content = await readFile(absolute, "utf8");
  return tokens
    .filter((token) => !content.includes(token))
    .map((token) => issue("shared-fact", file, `Missing shared technical fact: ${token}.`));
}

export async function validateSharedFacts(repoRoot: string): Promise<DocumentationIssue[]> {
  const issues: DocumentationIssue[] = [];
  const plugins = await documentationPlugins(repoRoot);
  const interfaceLabels: Record<string, [string, string]> = {
    library: ["Library", "库"],
    cli: ["CLI", "CLI"],
    mcp: ["MCP", "MCP"],
    skill: ["Agent Skill", "Agent Skill"],
  };
  const maturityLabels: Record<string, [string, string]> = {
    experimental: ["experimental", "实验"],
    stable: ["stable", "稳定"],
    deprecated: ["deprecated", "弃用"],
  };

  for (const { directory, packageJson: discoveredPackage } of plugins) {
    const manifest = discoveredPackage.agentPlugin;
    const binaries =
      typeof discoveredPackage.bin === "string" ? [] : Object.keys(discoveredPackage.bin ?? {});
    const nodeMajor = discoveredPackage.engines?.node?.match(/\d+/)?.[0];
    const enabled = Object.entries(manifest?.interfaces ?? {})
      .filter(([, value]) => value)
      .map(([name]) => interfaceLabels[name] ?? [name, name]);
    const skillFile = manifest?.skill?.path ? `${manifest.skill.path}/SKILL.md` : undefined;
    for (const [file, locale] of [
      [`packages/${directory}/README.md`, 0],
      [`packages/${directory}/README.zh-CN.md`, 1],
    ] as const) {
      const tokens = [
        discoveredPackage.name,
        nodeMajor ? `Node.js ${nodeMajor}` : undefined,
        ...binaries,
        ...enabled.map((labels) => labels[locale]),
        ...(manifest?.mcp?.tools ?? []),
        skillFile,
        manifest?.maturity ? (maturityLabels[manifest.maturity]?.[locale] ?? manifest.maturity) : undefined,
      ].filter((token): token is string => token !== undefined);
      issues.push(...(await requiredTokens(repoRoot, file, tokens)));
    }
  }

  type PluginDocsContract = {
    sections?: Array<{
      englishHeading: string;
      chineseHeading: string;
      englishRequired?: string[];
      chineseRequired?: string[];
      orderedTokens?: string[];
    }>;
  };

  for (const { directory, packageJson: discoveredPackage } of plugins) {
    const contractPath = path.join(repoRoot, "packages", directory, "docs-contract.json");
    let contract: PluginDocsContract = {};
    if (await exists(contractPath)) {
      contract = JSON.parse(await readFile(contractPath, "utf8")) as PluginDocsContract;
    }
    const readmes = [
      { file: `packages/${directory}/README.md`, locale: 0 as const },
      { file: `packages/${directory}/README.zh-CN.md`, locale: 1 as const },
    ];
    for (const { file, locale } of readmes) {
      const content = await readFile(path.join(repoRoot, file), "utf8").catch(() => "");
      for (const sectionContract of contract.sections ?? []) {
        const heading = locale === 0 ? sectionContract.englishHeading : sectionContract.chineseHeading;
        const section = h2Section(content, heading);
        const required =
          locale === 0 ? sectionContract.englishRequired ?? [] : sectionContract.chineseRequired ?? [];
        for (const token of required) {
          if (!section.includes(token)) {
            issues.push(issue("shared-fact", file, `Section ${heading} is missing shared fact: ${token}.`));
          }
        }
        if (sectionContract.orderedTokens && !containsInOrder(section, sectionContract.orderedTokens)) {
          issues.push(issue("shared-fact", file, `${heading} precedence does not match the package contract.`));
        }
      }

      const compatibility = h2Section(
        content,
        locale === 0 ? "Compatibility and Verification" : "兼容性与验证范围",
      );
      const automated = discoveredPackage.agentPlugin?.verification?.automated ?? [];
      const automatedSet = new Set(automated);
      for (const scope of automated) {
        if (!compatibility.includes(scope)) {
          issues.push(issue("shared-fact", file, `Verification section is missing automated scope: ${scope}.`));
        }
      }
      for (const scope of AUTOMATED_VERIFICATION_SCOPES) {
        if (!automatedSet.has(scope) && compatibility.includes(scope)) {
          issues.push(issue("shared-fact", file, `Verification section claims unconfigured automated scope: ${scope}.`));
        }
      }
      const livePolicy = discoveredPackage.agentPlugin?.verification?.liveProviders;
      if (livePolicy && !compatibility.includes(`liveProviders: ${livePolicy}`)) {
        issues.push(issue("shared-fact", file, `Verification section must declare liveProviders: ${livePolicy}.`));
      }
      if (!/protocol|协议/i.test(compatibility) || !/continuous|持续/.test(compatibility)) {
        issues.push(issue("shared-fact", file, "Must distinguish protocol compatibility from continuous Host/Provider verification."));
      }
      if (livePolicy === "manual" && (!/manual|手动/.test(compatibility) || !/billable|计费|费用/.test(compatibility))) {
        issues.push(issue("shared-fact", file, "Manual live Provider verification must be identified as potentially billable."));
      }
    }
  }

  const policyTokens: Record<string, string[]> = {
    "SECURITY.md": [
      "https://github.com/Sallyn0225/agent-plugins/security/advisories/new",
      "latest major",
      "public issue",
    ],
    "DEVELOPMENT.md": ["Node.js 22", "workspace"],
    "docs/architecture.md": ["npm workspaces", "Turbo", "Nx"],
    "TESTING.md": ["public", "offline", "manual", "networked", "incur charges"],
    "RELEASING.md": [
      "Changesets",
      "Version Packages",
      "OIDC",
      "long-lived npm",
      "1.1.1",
      "2.0.0",
      "patch",
      "deprecat",
      "dist-tag",
      "unpublish",
      "rewrit",
    ],
    "CONTRIBUTING.md": ["bug", "documentation", "tests", "approved"],
  };
  for (const [file, expected] of Object.entries(policyTokens)) {
    const absolute = path.join(repoRoot, file);
    const content = await readFile(absolute, "utf8").catch(() => "");
    for (const token of expected) {
      if (!content.toLowerCase().includes(token.toLowerCase())) {
        issues.push(issue("shared-fact", file, `Missing approved policy fact: ${token}.`));
      }
    }
  }

  const licenseFiles = [
    "LICENSE",
    "templates/capability-plugin/LICENSE",
    ...plugins.map(({ directory }) => `packages/${directory}/LICENSE`),
  ];
  for (const file of licenseFiles) {
    issues.push(...(await requiredTokens(repoRoot, file, ["MIT License", "Sallyn0225"])));
  }
  return issues;
}

export async function validateCatalogFreshness(repoRoot: string): Promise<DocumentationIssue[]> {
  try {
    const result = await generateCatalogs({ repoRoot, check: true });
    return result.stale.sort().map((file) =>
      issue("catalog-stale", file, "Generated catalog is stale; run npm run catalog:generate."),
    );
  } catch (error) {
    return [
      issue(
        "catalog-stale",
        "README.md",
        `Catalog validation failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    ];
  }
}

function sortIssues(issues: DocumentationIssue[]): DocumentationIssue[] {
  return issues.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.code.localeCompare(b.code) ||
      a.message.localeCompare(b.message),
  );
}

export async function validateDocumentation(repoRoot: string): Promise<DocumentationValidationResult> {
  const root = path.resolve(repoRoot);
  const [internal, language, sections, facts, catalog] = await Promise.all([
    validateInternalLinks(root),
    validateLanguageLinks(root),
    validateRequiredSections(root),
    validateSharedFacts(root),
    validateCatalogFreshness(root),
  ]);
  const issues = sortIssues([...internal, ...language, ...sections, ...facts, ...catalog]);
  return { ok: issues.length === 0, filesChecked: await markdownFiles(root), issues };
}

export function formatDocumentationResult(result: DocumentationValidationResult): string {
  if (result.ok) return `Documentation check passed (${result.filesChecked.length} Markdown files).`;
  return result.issues
    .map(({ file, line, code, message }) => `${file}${line ? `:${line}` : ""} [${code}] ${message}`)
    .join("\n");
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const repoRoot = path.resolve(argv[0] ?? process.cwd());
  const result = await validateDocumentation(repoRoot);
  const output = formatDocumentationResult(result);
  if (result.ok) console.log(output);
  else console.error(output);
  return result.ok ? 0 : 1;
}

const isCliEntry =
  process.argv[1] !== undefined &&
  /validate\.(ts|js|mts|mjs|cjs)$/.test(process.argv[1].replace(/\\/g, "/"));

if (isCliEntry) {
  main().then((code) => {
    process.exitCode = code;
  });
}
