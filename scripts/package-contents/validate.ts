import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import {
  discoverPlugins,
  type DiscoveredPlugin,
  type PackageJson,
} from "../agent-plugin/discover.js";

const execFileAsync = promisify(execFile);

type PackFile = { path: string };
type PackResult = { files?: PackFile[] };

export type PackageContentIssue = {
  packageName: string;
  code: string;
  message: string;
};

function normalize(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function collectExportPaths(value: unknown, result: Set<string>): void {
  if (typeof value === "string") {
    if (value.startsWith("./")) result.add(normalize(value));
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const child of Object.values(value)) collectExportPaths(child, result);
}

function declaredArtifactPaths(packageJson: PackageJson): Set<string> {
  const required = new Set(["package.json", "README.md", "README.zh-CN.md", "LICENSE"]);
  for (const key of ["main", "module", "types"] as const) {
    const value = packageJson[key];
    if (typeof value === "string") required.add(normalize(value));
  }
  const bin = packageJson.bin;
  if (typeof bin === "string") required.add(normalize(bin));
  if (bin && typeof bin === "object") {
    for (const value of Object.values(bin)) required.add(normalize(value));
  }
  collectExportPaths(packageJson.exports, required);
  return required;
}

function isCoveredByEntry(filePath: string, entry: string): boolean {
  const normalizedEntry = normalize(entry).replace(/\/$/, "");
  return filePath === normalizedEntry || filePath.startsWith(`${normalizedEntry}/`);
}

const ALWAYS_ALLOWED = new Set([
  "package.json",
  "README",
  "README.md",
  "README.zh-CN.md",
  "LICENSE",
  "LICENSE.md",
  "CHANGELOG.md",
]);

const FORBIDDEN_PATHS: Array<[string, RegExp]> = [
  ["test", /(^|\/)(__tests__|test|tests)(\/|$)/i],
  ["fixture", /(^|\/)(fixture|fixtures)(\/|$)/i],
  ["source", /(^|\/)src(\/|$)/i],
  ["local-config", /(^|\/)(config\.local\.[^/]+|[^/]+\.local\.[^/]+)$/i],
  ["credentials", /(^|\/)(\.env(?:\..*)?|credentials?(?:\.[^/]+)?|secrets?(?:\.[^/]+)?|\.npmrc)$/i],
  ["development-file", /(^|\/)(tsconfig(?:\.[^/]+)?\.json|vitest\.config\.[^/]+)(\/|$)/i],
  ["generated-output", /(^|\/)generated-(images|videos)(\/|$)/i],
];

export function validatePackedFileList(
  plugin: DiscoveredPlugin,
  packedFilePaths: string[],
): PackageContentIssue[] {
  const packageName = plugin.packageJson.name ?? plugin.agentPlugin.id;
  const files = packedFilePaths.map(normalize);
  const fileSet = new Set(files);
  const issues: PackageContentIssue[] = [];
  const push = (code: string, message: string) => issues.push({ packageName, code, message });

  const allowlist = plugin.packageJson.files;
  if (!allowlist || allowlist.length === 0) {
    push("files-allowlist", "package.json must declare a non-empty files allowlist");
  }

  for (const required of declaredArtifactPaths(plugin.packageJson)) {
    if (!fileSet.has(required)) push("missing-artifact", `packed tarball is missing ${required}`);
  }

  if (plugin.agentPlugin.interfaces.skill && plugin.agentPlugin.skill) {
    const skillFile = normalize(`${plugin.agentPlugin.skill.path}/SKILL.md`);
    if (!fileSet.has(skillFile)) push("missing-artifact", `packed tarball is missing ${skillFile}`);
  }

  for (const entry of allowlist ?? []) {
    const normalizedEntry = normalize(entry).replace(/\/$/, "");
    if (!files.some((file) => isCoveredByEntry(file, normalizedEntry))) {
      push("empty-files-entry", `package.json files entry ${entry} did not include any artifact`);
    }
  }

  for (const file of files) {
    for (const [kind, pattern] of FORBIDDEN_PATHS) {
      if (pattern.test(file)) push("forbidden-artifact", `${file} is a forbidden ${kind} artifact`);
    }

    const covered = (allowlist ?? []).some((entry) => isCoveredByEntry(file, entry));
    if (!covered && !ALWAYS_ALLOWED.has(file)) {
      push("undeclared-artifact", `${file} is outside the package.json files allowlist`);
    }
  }

  return issues;
}

function npmInvocation(): { executable: string; args: string[] } {
  const npmCli = process.env.npm_execpath;
  if (npmCli) return { executable: process.execPath, args: [npmCli] };
  return { executable: process.platform === "win32" ? "npm.cmd" : "npm", args: [] };
}

async function inspectPackedFiles(packageDir: string): Promise<string[]> {
  const npm = npmInvocation();
  const { stdout } = await execFileAsync(
    npm.executable,
    [...npm.args, "pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: packageDir, maxBuffer: 10 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout) as PackResult[];
  const result = parsed[0];
  if (!result?.files) throw new Error("npm pack did not return a file list");
  return result.files.map((file) => file.path);
}

export async function validatePackageContents(repoRoot: string): Promise<PackageContentIssue[]> {
  const plugins = await discoverPlugins(repoRoot);
  const issues: PackageContentIssue[] = [];
  for (const plugin of plugins) {
    try {
      const files = await inspectPackedFiles(plugin.packageDir);
      issues.push(...validatePackedFileList(plugin, files));
    } catch (error) {
      issues.push({
        packageName: plugin.packageJson.name ?? plugin.agentPlugin.id,
        code: "pack-failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (plugins.length === 0) {
    issues.push({
      packageName: "(repository)",
      code: "no-packages",
      message: "no publishable Capability Plugins found",
    });
  }
  return issues;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const repoRoot = path.resolve(argv[0] ?? process.cwd());
  const issues = await validatePackageContents(repoRoot);
  if (issues.length === 0) {
    console.log("Package-content validation passed");
    return 0;
  }
  console.error(`Package-content validation failed (${issues.length} issue(s)):`);
  for (const issue of issues) {
    console.error(`  - [${issue.packageName}] ${issue.code}: ${issue.message}`);
  }
  return 1;
}

const isCliEntry =
  process.argv[1] !== undefined &&
  /package-contents[\\/]validate\.(ts|js|mts|mjs|cjs)$/.test(process.argv[1]);

if (isCliEntry) {
  main().then((code) => {
    process.exitCode = code;
  });
}
