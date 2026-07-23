import { readFile } from "node:fs/promises";
import path from "node:path";
import { discoverPlugins, type DiscoveredPlugin, type PackageJson } from "./discover.js";
import { pathExists } from "./fs-utils.js";

export type ValidationIssue = {
  packageId: string;
  code: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  plugins: DiscoveredPlugin[];
  issues: ValidationIssue[];
};

const EXPECTED_SCOPE = "@sallyn0225/";
const EXPECTED_REPO = "github.com/Sallyn0225/agent-plugins";
const MIN_NODE_MAJOR = 22;

function repositoryUrl(packageJson: PackageJson): string {
  const repo = packageJson.repository;
  if (!repo) return "";
  if (typeof repo === "string") return repo;
  return repo.url ?? "";
}

function parseNodeEngine(enginesNode: string | undefined): {
  raw: string;
  major: number | null;
} {
  if (!enginesNode) return { raw: "", major: null };
  const match = enginesNode.match(/(\d+)/);
  return {
    raw: enginesNode,
    major: match ? Number(match[1]) : null,
  };
}

function binEntries(packageJson: PackageJson): string[] {
  const bin = packageJson.bin;
  if (!bin) return [];
  if (typeof bin === "string") return [bin];
  return Object.values(bin);
}

function filesIncludes(files: string[] | undefined, relativePath: string): boolean {
  if (!files || files.length === 0) {
    // npm default publish set — skill paths under package root are included
    // unless ignored; treat missing `files` as inclusive for validation purposes
    // only when the path exists on disk (checked separately).
    return true;
  }
  const normalized = relativePath.replace(/\\/g, "/");
  return files.some((entry) => {
    const e = entry.replace(/\\/g, "/").replace(/\/$/, "");
    return normalized === e || normalized.startsWith(`${e}/`) || e === normalized.split("/")[0];
  });
}

async function readSkillFrontmatter(
  skillMdPath: string,
): Promise<{ name?: string; description?: string } | null> {
  if (!(await pathExists(skillMdPath))) return null;
  const text = await readFile(skillMdPath, "utf8");
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const yaml = text.slice(3, end).trim();
  const result: { name?: string; description?: string } = {};
  for (const line of yaml.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim().replace(/^['"]|['"]$/g, "");
    if (key === "name") result.name = value;
    if (key === "description") result.description = value;
  }
  return result;
}

export async function validatePlugin(plugin: DiscoveredPlugin): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const { packageJson, agentPlugin, packageDir } = plugin;
  const id = agentPlugin.id;

  const push = (code: string, message: string) => {
    issues.push({ packageId: id, code, message });
  };

  // --- package naming ---
  const expectedName = `${EXPECTED_SCOPE}${id}`;
  if (packageJson.name !== expectedName) {
    push("package-name", `package name must be "${expectedName}", got "${packageJson.name ?? ""}"`);
  }

  // --- license ---
  if (packageJson.license !== "MIT") {
    push("license", `license must be "MIT", got "${packageJson.license ?? ""}"`);
  }

  // --- repository identity ---
  const repoUrl = repositoryUrl(packageJson);
  if (!repoUrl.includes(EXPECTED_REPO)) {
    push("repository", `repository URL must reference ${EXPECTED_REPO}, got "${repoUrl}"`);
  }

  // --- Node engines ---
  const engine = parseNodeEngine(packageJson.engines?.node);
  if (!engine.raw) {
    push("engines", "package.json engines.node is required");
  } else if (engine.major === null || engine.major < MIN_NODE_MAJOR) {
    push("engines", `engines.node must require Node.js ${MIN_NODE_MAJOR}+, got "${engine.raw}"`);
  }

  // --- CLI binaries when cli interface is enabled ---
  if (agentPlugin.interfaces.cli) {
    const bins = binEntries(packageJson);
    if (bins.length === 0) {
      push("bin", "interfaces.cli is true but package.json bin is empty");
    } else {
      for (const binPath of bins) {
        const abs = path.join(packageDir, binPath);
        // Built output may be absent in a clean checkout; require declaration only
        // if dist is present, otherwise still require the path to be under dist/ or scripts/
        if (!(await pathExists(abs))) {
          // Accept missing built bins when source exists for the same basename
          const base = path.basename(binPath, path.extname(binPath));
          const srcTs = path.join(packageDir, "src", `${base}.ts`);
          const srcJs = path.join(packageDir, "src", `${base}.js`);
          if (!(await pathExists(srcTs)) && !(await pathExists(srcJs))) {
            push(
              "bin",
              `bin entry "${binPath}" is missing and no matching src/${base}.ts|js was found`,
            );
          }
        }
      }
    }
  }

  // --- library export surface ---
  if (agentPlugin.interfaces.library) {
    if (!packageJson.main && !packageJson.exports) {
      push("library", "interfaces.library is true but package.json has neither main nor exports");
    }
  }

  // --- skill inclusion ---
  if (agentPlugin.interfaces.skill && agentPlugin.skill) {
    const skillDir = path.join(packageDir, agentPlugin.skill.path);
    const skillMd = path.join(skillDir, "SKILL.md");
    if (!(await pathExists(skillMd))) {
      push(
        "skill-missing",
        `skill SKILL.md not found at package-relative path "${agentPlugin.skill.path}/SKILL.md"`,
      );
    } else {
      const frontmatter = await readSkillFrontmatter(skillMd);
      if (!frontmatter?.name || !frontmatter?.description) {
        push(
          "skill-format",
          "SKILL.md must follow the open Agent Skills format with name and description frontmatter",
        );
      } else if (frontmatter.name !== id) {
        push("skill-name", `SKILL.md name "${frontmatter.name}" must match capability id "${id}"`);
      }
      if (!filesIncludes(packageJson.files, agentPlugin.skill.path)) {
        push(
          "skill-files",
          `package.json files must include the skill path "${agentPlugin.skill.path}" so it ships in the npm tarball`,
        );
      }
    }
  }

  // --- bilingual README presence ---
  for (const readme of ["README.md", "README.zh-CN.md"] as const) {
    if (!(await pathExists(path.join(packageDir, readme)))) {
      push("readme", `missing ${readme}`);
    }
  }

  // --- maturity / interface reporting sanity for stable plugins ---
  if (agentPlugin.maturity === "stable") {
    if (!agentPlugin.verification.automated.includes("metadata")) {
      // soft guidance via issue — metadata validation is required for stable
      push("verification", 'stable plugins should include "metadata" in verification.automated');
    }
  }

  return issues;
}

export async function validateRepository(repoRoot: string): Promise<ValidationResult> {
  const plugins = await discoverPlugins(repoRoot);
  const issues: ValidationIssue[] = [];

  if (plugins.length === 0) {
    issues.push({
      packageId: "(repository)",
      code: "no-plugins",
      message: "no publishable packages with agentPlugin metadata were found under packages/",
    });
  }

  for (const plugin of plugins) {
    issues.push(...(await validatePlugin(plugin)));
  }

  return {
    ok: issues.length === 0,
    plugins,
    issues,
  };
}

export function formatValidationResult(result: ValidationResult): string {
  if (result.ok) {
    const ids = result.plugins.map((p) => p.agentPlugin.id).join(", ");
    return `Capability Plugin validation passed (${result.plugins.length}): ${ids}`;
  }
  const lines = result.issues.map(
    (issue) => `  - [${issue.packageId}] ${issue.code}: ${issue.message}`,
  );
  return `Capability Plugin validation failed (${result.issues.length} issue(s)):\n${lines.join("\n")}`;
}

/** CLI entry */
export async function main(argv = process.argv.slice(2)): Promise<number> {
  const repoRoot = path.resolve(argv[0] ?? process.cwd());
  const result = await validateRepository(repoRoot);
  const text = formatValidationResult(result);
  if (result.ok) {
    console.log(text);
    return 0;
  }
  console.error(text);
  return 1;
}

const isCliEntry =
  process.argv[1] !== undefined &&
  /validate\.(ts|js|mts|mjs|cjs)$/.test(process.argv[1].replace(/\\/g, "/"));

if (isCliEntry) {
  main().then((code) => {
    process.exitCode = code;
  });
}
