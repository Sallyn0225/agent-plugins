import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig, ImageProviderKind, ModelConfig } from "./types.js";

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_OUTPUT_DIR = "./generated-images";

const LEGACY_ENV_WARNING =
  "image-gen: AGENT_TOOLING_IMAGE_GEN_CONFIG is a v2 compatibility fallback and will be removed in v3. Prefer IMAGE_GEN_CONFIG.";

const LEGACY_DIR_WARNING =
  "image-gen: ~/.config/agent-tooling/image-gen.json is a v2 compatibility fallback and will be removed in v3. Prefer ~/.config/agent-plugins/image-gen.json or IMAGE_GEN_CONFIG.";

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
   * Warning sink. Defaults to console.error so stdout/MCP stdio framing stay clean.
   * Callers must not write these warnings to stdout.
   */
  warn?: (message: string) => void;
}

type ConfigSourceKind =
  | "preferred-env"
  | "legacy-env"
  | "preferred-dir"
  | "legacy-dir"
  | "other";

interface ConfigCandidate {
  path: string;
  kind: ConfigSourceKind;
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

function inferProvider(modelId: string): ImageProviderKind {
  const lower = modelId.toLowerCase();
  if (lower.includes("gemini")) return "gemini";
  return "openai-images";
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function normalizeModelConfig(
  modelKey: string,
  raw: Record<string, unknown>,
): ModelConfig {
  const baseUrl = asString(raw.baseUrl) ?? asString(raw.base_url) ?? asString(raw.baseURL);
  const apiKey =
    asString(raw.apiKey) ??
    asString(raw.api_key) ??
    asString(raw.key) ??
    asString(raw.token);

  if (!baseUrl) {
    throw new Error(`Model "${modelKey}" is missing baseUrl`);
  }
  if (!apiKey) {
    throw new Error(`Model "${modelKey}" is missing apiKey`);
  }

  const providerRaw = asString(raw.provider)?.toLowerCase();
  let provider: ImageProviderKind;
  if (providerRaw === "openai-images" || providerRaw === "openai" || providerRaw === "images") {
    provider = "openai-images";
  } else if (providerRaw === "gemini" || providerRaw === "google") {
    provider = "gemini";
  } else {
    provider = inferProvider(asString(raw.model) ?? modelKey);
  }

  const headers = asRecord(raw.headers);
  const normalizedHeaders: Record<string, string> | undefined = headers
    ? Object.fromEntries(
        Object.entries(headers)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => [k, String(v)]),
      )
    : undefined;

  return {
    provider,
    baseUrl: stripTrailingSlash(baseUrl),
    apiKey,
    model: asString(raw.model) ?? modelKey,
    headers:
      normalizedHeaders && Object.keys(normalizedHeaders).length > 0
        ? normalizedHeaders
        : undefined,
  };
}

function loadModelsFromObject(
  modelsRaw: unknown,
  source: string,
): Record<string, ModelConfig> {
  const modelsObj = asRecord(modelsRaw);
  if (!modelsObj) {
    throw new Error(`${source}: "models" must be an object`);
  }

  const models: Record<string, ModelConfig> = {};
  for (const [key, value] of Object.entries(modelsObj)) {
    const entry = asRecord(value);
    if (!entry) {
      throw new Error(`${source}: model "${key}" must be an object`);
    }
    models[key] = normalizeModelConfig(key, entry);
  }
  return models;
}

function defaultPackageRootDir(): string {
  // dist/ or src/
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

function resolveRuntime(options: LoadConfigOptions = {}): {
  env: NodeJS.ProcessEnv;
  homeDir: string;
  cwd: string;
  packageRoot: string;
  warn: (message: string) => void;
} {
  return {
    env: options.env ?? process.env,
    homeDir: options.homeDir ?? homedir(),
    cwd: options.cwd ?? process.cwd(),
    packageRoot: options.packageRoot ?? defaultPackageRootDir(),
    warn: options.warn ?? ((message: string) => console.error(message)),
  };
}

function candidateConfigPaths(runtime: {
  env: NodeJS.ProcessEnv;
  homeDir: string;
  cwd: string;
  packageRoot: string;
}): ConfigCandidate[] {
  const { env, homeDir, cwd, packageRoot } = runtime;
  const candidates: ConfigCandidate[] = [];

  // Preferred env vars always outrank directory and legacy sources.
  const preferredEnvPath = env.IMAGE_GEN_CONFIG ?? env.IMAGE_GEN_MCP_CONFIG;
  if (preferredEnvPath) {
    candidates.push({
      path: expandHome(preferredEnvPath, homeDir),
      kind: "preferred-env",
    });
  }

  // cwd / monorepo development locations
  for (const relative of [
    "config.local.json",
    "config.json",
    "packages/image-gen/config.local.json",
    "packages/image-gen/config.json",
  ]) {
    candidates.push({ path: resolve(cwd, relative), kind: "other" });
  }

  // package-local (when running from installed package or package workspace)
  candidates.push({ path: join(packageRoot, "config.local.json"), kind: "other" });
  candidates.push({ path: join(packageRoot, "config.json"), kind: "other" });

  // Preferred user default for Agent Plugins
  candidates.push({
    path: join(homeDir, ".config", "agent-plugins", "image-gen.json"),
    kind: "preferred-dir",
  });

  // Legacy Agent Tooling fallbacks (v2 only; warn when actually used)
  if (env.AGENT_TOOLING_IMAGE_GEN_CONFIG) {
    candidates.push({
      path: expandHome(env.AGENT_TOOLING_IMAGE_GEN_CONFIG, homeDir),
      kind: "legacy-env",
    });
  }
  candidates.push({
    path: join(homeDir, ".config", "agent-tooling", "image-gen.json"),
    kind: "legacy-dir",
  });

  // older generic locations (no deprecation warning; not brand-specific)
  candidates.push({ path: join(homeDir, ".config", "image-gen", "config.json"), kind: "other" });
  candidates.push({
    path: join(homeDir, ".config", "image-gen-mcp", "config.json"),
    kind: "other",
  });
  candidates.push({ path: join(homeDir, ".image-gen.json"), kind: "other" });
  candidates.push({ path: join(homeDir, ".image-gen-mcp.json"), kind: "other" });

  return candidates;
}

function maybeWarnForSource(
  kind: ConfigSourceKind,
  warn: (message: string) => void,
): void {
  if (kind === "legacy-env") {
    warn(LEGACY_ENV_WARNING);
    return;
  }
  if (kind === "legacy-dir") {
    warn(LEGACY_DIR_WARNING);
  }
}

function loadConfigFile(options: LoadConfigOptions = {}): {
  path?: string;
  data: Record<string, unknown>;
} {
  const runtime = resolveRuntime(options);

  for (const candidate of candidateConfigPaths(runtime)) {
    if (!existsSync(candidate.path)) continue;
    const raw = readFileSync(candidate.path, "utf8");
    maybeWarnForSource(candidate.kind, runtime.warn);
    return { path: candidate.path, data: parseJsonObject(raw, candidate.path) };
  }
  return { data: {} };
}

function applyEnvModelOverrides(
  models: Record<string, ModelConfig>,
  env: NodeJS.ProcessEnv,
): void {
  const sharedBase = env.IMAGE_GEN_BASE_URL;
  const sharedKey = env.IMAGE_GEN_API_KEY;

  const firstBatch: Array<{
    alias: string;
    provider: ImageProviderKind;
    model: string;
    baseEnv: string;
    keyEnv: string;
  }> = [
    {
      alias: "gpt-image-2",
      provider: "openai-images",
      model: "gpt-image-2",
      baseEnv: "IMAGE_GEN_GPT_IMAGE_2_BASE_URL",
      keyEnv: "IMAGE_GEN_GPT_IMAGE_2_API_KEY",
    },
    {
      alias: "grok-imagine-image",
      provider: "openai-images",
      model: "grok-imagine-image",
      baseEnv: "IMAGE_GEN_GROK_IMAGINE_IMAGE_BASE_URL",
      keyEnv: "IMAGE_GEN_GROK_IMAGINE_IMAGE_API_KEY",
    },
    {
      alias: "gemini-3.1-flash-image",
      provider: "gemini",
      model: "gemini-3.1-flash-image",
      baseEnv: "IMAGE_GEN_GEMINI_3_1_FLASH_IMAGE_BASE_URL",
      keyEnv: "IMAGE_GEN_GEMINI_3_1_FLASH_IMAGE_API_KEY",
    },
  ];

  for (const item of firstBatch) {
    const baseUrl = env[item.baseEnv] ?? sharedBase;
    const apiKey = env[item.keyEnv] ?? sharedKey;
    if (!baseUrl && !apiKey && !models[item.alias]) continue;

    const existing = models[item.alias];
    if (!baseUrl && !existing?.baseUrl) continue;
    if (!apiKey && !existing?.apiKey) continue;

    models[item.alias] = {
      provider: existing?.provider ?? item.provider,
      baseUrl: stripTrailingSlash(baseUrl ?? existing!.baseUrl),
      apiKey: apiKey ?? existing!.apiKey,
      model: existing?.model ?? item.model,
      headers: existing?.headers,
    };
  }

  const generic = new Map<string, Partial<ModelConfig> & { alias: string }>();

  for (const [envKey, envValue] of Object.entries(env)) {
    if (!envValue) continue;
    const match = envKey.match(
      /^IMAGE_GEN_MODEL_([A-Z0-9_]+)_(BASE_URL|API_KEY|PROVIDER|MODEL|BASEURL|KEY)$/,
    );
    if (!match) continue;

    const alias = match[1]
      .toLowerCase()
      .replace(/__/g, "/")
      .replace(/_/g, "-");
    const field = match[2].toUpperCase();
    const entry = generic.get(alias) ?? { alias };
    if (field === "BASE_URL" || field === "BASEURL") {
      entry.baseUrl = stripTrailingSlash(envValue);
    }
    if (field === "API_KEY" || field === "KEY") entry.apiKey = envValue;
    if (field === "PROVIDER") {
      const p = envValue.toLowerCase();
      entry.provider = p === "gemini" || p === "google" ? "gemini" : "openai-images";
    }
    if (field === "MODEL") entry.model = envValue;
    generic.set(alias, entry);
  }

  for (const entry of generic.values()) {
    const existing = models[entry.alias];
    const baseUrl = entry.baseUrl ?? existing?.baseUrl;
    const apiKey = entry.apiKey ?? existing?.apiKey;
    if (!baseUrl || !apiKey) continue;

    models[entry.alias] = {
      provider:
        entry.provider ?? existing?.provider ?? inferProvider(entry.model ?? entry.alias),
      baseUrl,
      apiKey,
      model: entry.model ?? existing?.model ?? entry.alias,
      headers: existing?.headers,
    };
  }
}

export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  const runtime = resolveRuntime(options);
  const { path, data } = loadConfigFile(options);
  const source = path ?? "environment";

  let models: Record<string, ModelConfig> = {};
  if (data.models !== undefined) {
    models = loadModelsFromObject(data.models, source);
  }

  applyEnvModelOverrides(models, runtime.env);

  const outputDirRaw =
    runtime.env.IMAGE_GEN_OUTPUT_DIR ??
    asString(data.outputDir) ??
    asString(data.output_dir) ??
    DEFAULT_OUTPUT_DIR;

  const timeoutFromEnv = runtime.env.IMAGE_GEN_TIMEOUT_MS
    ? Number(runtime.env.IMAGE_GEN_TIMEOUT_MS)
    : undefined;

  const timeoutMs =
    asNumber(timeoutFromEnv) ??
    asNumber(data.timeoutMs) ??
    asNumber(data.timeout_ms) ??
    DEFAULT_TIMEOUT_MS;

  const defaultModel =
    runtime.env.IMAGE_GEN_DEFAULT_MODEL ??
    asString(data.defaultModel) ??
    asString(data.default_model) ??
    (models["gpt-image-2"] ? "gpt-image-2" : Object.keys(models)[0]);

  const outputDir = isAbsolute(expandHome(outputDirRaw, runtime.homeDir))
    ? expandHome(outputDirRaw, runtime.homeDir)
    : resolve(runtime.cwd, expandHome(outputDirRaw, runtime.homeDir));

  if (Object.keys(models).length === 0) {
    throw new Error(
      [
        "No image models configured.",
        "Provide a config file (IMAGE_GEN_CONFIG / ~/.config/agent-plugins/image-gen.json)",
        "or env vars such as IMAGE_GEN_GPT_IMAGE_2_BASE_URL + IMAGE_GEN_GPT_IMAGE_2_API_KEY.",
        "See packages/image-gen/config.example.json.",
      ].join(" "),
    );
  }

  return {
    defaultModel,
    outputDir,
    timeoutMs,
    models,
  };
}

export function resolveModelConfig(
  config: AppConfig,
  model?: string,
): {
  alias: string;
  modelConfig: ModelConfig;
} {
  const alias = model?.trim() || config.defaultModel;
  if (!alias) {
    throw new Error("No model specified and no defaultModel configured");
  }

  const modelConfig = config.models[alias];
  if (!modelConfig) {
    const available = Object.keys(config.models).join(", ");
    throw new Error(`Unknown model "${alias}". Available: ${available}`);
  }

  return { alias, modelConfig };
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 3)}***${value.slice(-4)}`;
}
