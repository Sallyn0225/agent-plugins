import { existsSync } from "node:fs";
import { mkdtemp, rename, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TINY_PNG_BYTES } from "./local-provider-adapter.js";

const PACKAGE_LOCAL_CONFIG = resolve(
  process.cwd(),
  "packages/image-gen/config.local.json",
);

export interface OfflineFixture {
  /** Absolute path to IMAGE_GEN_CONFIG JSON. */
  configPath: string;
  /** Temp home directory (isolates default config discovery). */
  homeDir: string;
  /** Temp working directory. */
  cwd: string;
  /** Output directory configured for saves. */
  outputDir: string;
  /** Path to a tiny PNG input image for edit flows. */
  inputImagePath: string;
  /** Absolute package root override (empty package so no local config.local.json). */
  packageRoot: string;
  /** Cleanup temp dirs. */
  cleanup: () => Promise<void>;
}

export interface OfflineFixtureOptions {
  /** Local provider adapter base URL (http://127.0.0.1:PORT). */
  baseUrl: string;
  /** Model alias to configure (default: gpt-image-2). */
  modelAlias?: string;
  /** Upstream model id (default: gpt-image-test). */
  upstreamModel?: string;
  /** Provider kind (default: openai-images). */
  provider?: "openai-images" | "gemini";
  /** Extra models to include. */
  extraModels?: Record<string, unknown>;
  /** Default model alias. */
  defaultModel?: string;
  /** Timeout ms in config. */
  timeoutMs?: number;
}

/**
 * Create isolated temp dirs + a config file pointing at a local Provider adapter.
 * Never uses real credentials, external hosts, or persistent generated output.
 */
export async function createOfflineFixture(
  options: OfflineFixtureOptions,
): Promise<OfflineFixture> {
  const modelAlias = options.modelAlias ?? "gpt-image-2";
  const upstreamModel = options.upstreamModel ?? "gpt-image-test";
  const provider = options.provider ?? "openai-images";
  const defaultModel = options.defaultModel ?? modelAlias;

  const homeDir = await mkdtemp(join(tmpdir(), "image-gen-home-"));
  const cwd = await mkdtemp(join(tmpdir(), "image-gen-cwd-"));
  const packageRoot = await mkdtemp(join(tmpdir(), "image-gen-pkg-"));
  const outputDir = join(cwd, "generated-images");
  const configPath = join(cwd, "image-gen.config.json");
  const inputImagePath = join(cwd, "input.png");

  await writeFile(inputImagePath, TINY_PNG_BYTES);

  const config = {
    defaultModel,
    outputDir,
    timeoutMs: options.timeoutMs ?? 15_000,
    models: {
      [modelAlias]: {
        provider,
        baseUrl: options.baseUrl,
        apiKey: "test-key-offline-not-real",
        model: upstreamModel,
      },
      ...(options.extraModels ?? {}),
    },
  };

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const dirs = [homeDir, cwd, packageRoot];

  return {
    configPath,
    homeDir,
    cwd,
    outputDir,
    inputImagePath,
    packageRoot,
    cleanup: async () => {
      await Promise.all(
        dirs.map((dir) => rm(dir, { recursive: true, force: true }).catch(() => undefined)),
      );
    },
  };
}

/**
 * Env vars that force the CLI/MCP process onto the offline fixture config,
 * and isolate home/cwd discovery from the developer's machine.
 */
export function offlineEnv(fixture: OfflineFixture): NodeJS.ProcessEnv {
  return {
    IMAGE_GEN_CONFIG: fixture.configPath,
    // HOME / USERPROFILE isolate default config directory discovery on Unix / Windows.
    HOME: fixture.homeDir,
    USERPROFILE: fixture.homeDir,
  };
}

/**
 * Temporarily hide packages/image-gen/config.local.json so black-box child
 * processes can exercise lower-priority config sources (legacy env/dir).
 * The file is gitignored developer state and otherwise outranks legacy fallbacks.
 */
export async function withPackageLocalConfigHidden<
  T,
>(fn: () => Promise<T>): Promise<T> {
  if (!existsSync(PACKAGE_LOCAL_CONFIG)) {
    return fn();
  }

  const hiddenPath = `${PACKAGE_LOCAL_CONFIG}.offline-test-hidden`;
  await rename(PACKAGE_LOCAL_CONFIG, hiddenPath);
  try {
    return await fn();
  } finally {
    await rename(hiddenPath, PACKAGE_LOCAL_CONFIG);
  }
}
