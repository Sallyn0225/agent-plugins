import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseAgentPlugin, type AgentPlugin } from "./schema.js";
import { pathExists } from "./fs-utils.js";

export type PackageJson = {
  name?: string;
  version?: string;
  description?: string;
  private?: boolean;
  license?: string;
  engines?: { node?: string };
  bin?: string | Record<string, string>;
  files?: string[];
  repository?:
    | string
    | {
        type?: string;
        url?: string;
        directory?: string;
      };
  agentPlugin?: unknown;
  [key: string]: unknown;
};

export type DiscoveredPlugin = {
  /** Absolute path to the package directory */
  packageDir: string;
  /** package.json contents */
  packageJson: PackageJson;
  /** Parsed and validated agentPlugin manifest */
  agentPlugin: AgentPlugin;
};

export async function readPackageJson(
  packageDir: string,
): Promise<PackageJson> {
  const raw = await readFile(path.join(packageDir, "package.json"), "utf8");
  return JSON.parse(raw) as PackageJson;
}

/**
 * Discover publishable Capability Plugins under packages/*.
 * A package is a plugin when it is not private and declares `agentPlugin`.
 */
export async function discoverPlugins(
  repoRoot: string,
): Promise<DiscoveredPlugin[]> {
  const packagesDir = path.join(repoRoot, "packages");
  if (!(await pathExists(packagesDir))) {
    return [];
  }

  const entries = await readdir(packagesDir, { withFileTypes: true });
  const plugins: DiscoveredPlugin[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packageDir = path.join(packagesDir, entry.name);
    const packageJsonPath = path.join(packageDir, "package.json");
    if (!(await pathExists(packageJsonPath))) continue;

    const packageJson = await readPackageJson(packageDir);
    if (packageJson.private === true) continue;
    if (packageJson.agentPlugin === undefined) continue;

    const agentPlugin = parseAgentPlugin(packageJson.agentPlugin);
    plugins.push({ packageDir, packageJson, agentPlugin });
  }

  plugins.sort((a, b) => a.agentPlugin.id.localeCompare(b.agentPlugin.id));
  return plugins;
}
