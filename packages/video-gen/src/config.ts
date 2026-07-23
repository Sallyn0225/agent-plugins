import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MODEL_ID } from "./models.js";
import type { AppConfig } from "./types.js";

export const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
export const DEFAULT_TIMEOUT_MS = 600_000;
export const DEFAULT_POLL_INTERVAL_MS = 15_000;
export const DEFAULT_OUTPUT_DIR = "./generated-videos";

export interface LoadConfigOptions {
  /** Override process.env (useful for tests). */
  env?: NodeJS.ProcessEnv;
  /** Override os.homedir() (useful for tests). */
  homeDir?: string;
  /** Override process.cwd() (useful for tests). */
  cwd?: string;
  /** Override package root used for package-local config discovery. */
  packageRoot?: string;
  /**
   * When true, missing apiKey does not throw (used by `models` / help paths).
   * Default false.
   */
  allowMissingCredentials?: boolean;
}

function expandHome(path: string, home: string): string {
  if (path === "~") return home;
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(home, path.slice(2));
  }
  return path;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function parseJsonObject(raw: string, source: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${source} must contain a JSON object`);
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${source}: ${error.message}`);
    }
    throw error;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function defaultPackageRootDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

function resolveRuntime(options: LoadConfigOptions = {}): {
  env: NodeJS.ProcessEnv;
  homeDir: string;
  cwd: string;
  packageRoot: string;
} {
  return {
    env: options.env ?? process.env,
    homeDir: options.homeDir ?? homedir(),
    cwd: options.cwd ?? process.cwd(),
    packageRoot: options.packageRoot ?? defaultPackageRootDir(),
  };
}

/**
 * Discovery order (first existing file wins):
 * 1. $VIDEO_GEN_CONFIG
 * 2. package-local config.local.json
 * 3. ~/.config/agent-plugins/video-gen.json
 */
function candidateConfigPaths(runtime: {
  env: NodeJS.ProcessEnv;
  homeDir: string;
  packageRoot: string;
}): string[] {
  const { env, homeDir, packageRoot } = runtime;
  const candidates: string[] = [];

  if (env.VIDEO_GEN_CONFIG) {
    candidates.push(expandHome(env.VIDEO_GEN_CONFIG, homeDir));
  }

  candidates.push(join(packageRoot, "config.local.json"));
  candidates.push(join(homeDir, ".config", "agent-plugins", "video-gen.json"));

  return candidates;
}

function loadConfigFile(options: LoadConfigOptions = {}): {
  path?: string;
  data: Record<string, unknown>;
} {
  const runtime = resolveRuntime(options);

  for (const candidate of candidateConfigPaths(runtime)) {
    if (!existsSync(candidate)) continue;
    const raw = readFileSync(candidate, "utf8");
    return { path: candidate, data: parseJsonObject(raw, candidate) };
  }
  return { data: {} };
}

/**
 * Resolve apiKey with env override precedence:
 * VIDEO_GEN_API_KEY > ARK_API_KEY > config file apiKey.
 */
function resolveApiKey(env: NodeJS.ProcessEnv, fileKey: string | undefined): string | undefined {
  return asString(env.VIDEO_GEN_API_KEY) ?? asString(env.ARK_API_KEY) ?? fileKey;
}

export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  const runtime = resolveRuntime(options);
  const { path, data } = loadConfigFile(options);

  const baseUrlRaw =
    asString(runtime.env.VIDEO_GEN_BASE_URL) ??
    asString(data.baseUrl) ??
    asString(data.base_url) ??
    DEFAULT_BASE_URL;

  const fileApiKey = asString(data.apiKey) ?? asString(data.api_key);
  const apiKey = resolveApiKey(runtime.env, fileApiKey);

  const defaultModel =
    asString(runtime.env.VIDEO_GEN_DEFAULT_MODEL) ??
    asString(data.defaultModel) ??
    asString(data.default_model) ??
    DEFAULT_MODEL_ID;

  const outputDirRaw =
    asString(runtime.env.VIDEO_GEN_OUTPUT_DIR) ??
    asString(data.outputDir) ??
    asString(data.output_dir) ??
    DEFAULT_OUTPUT_DIR;

  const timeoutFromEnv = runtime.env.VIDEO_GEN_TIMEOUT_MS
    ? Number(runtime.env.VIDEO_GEN_TIMEOUT_MS)
    : undefined;
  const pollFromEnv = runtime.env.VIDEO_GEN_POLL_INTERVAL_MS
    ? Number(runtime.env.VIDEO_GEN_POLL_INTERVAL_MS)
    : undefined;

  const timeoutMs =
    asNumber(timeoutFromEnv) ??
    asNumber(data.timeoutMs) ??
    asNumber(data.timeout_ms) ??
    DEFAULT_TIMEOUT_MS;

  const pollIntervalMs =
    asNumber(pollFromEnv) ??
    asNumber(data.pollIntervalMs) ??
    asNumber(data.poll_interval_ms) ??
    DEFAULT_POLL_INTERVAL_MS;

  const expandedOutput = expandHome(outputDirRaw, runtime.homeDir);
  const outputDir = isAbsolute(expandedOutput)
    ? expandedOutput
    : resolve(runtime.cwd, expandedOutput);

  if (!apiKey && !options.allowMissingCredentials) {
    throw new Error(
      [
        "No API key configured for video-gen.",
        "Set VIDEO_GEN_API_KEY or ARK_API_KEY, or provide apiKey in a config file.",
        "Config discovery: $VIDEO_GEN_CONFIG → package-local config.local.json → ~/.config/agent-plugins/video-gen.json.",
        "See packages/video-gen/config.example.json.",
      ].join(" "),
    );
  }

  return {
    baseUrl: stripTrailingSlash(baseUrlRaw),
    apiKey: apiKey ?? "",
    defaultModel,
    outputDir,
    timeoutMs,
    pollIntervalMs,
    configPath: path,
  };
}

export function maskSecret(value: string): string {
  if (!value) return "***";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 3)}***${value.slice(-4)}`;
}
