import { existsSync } from "node:fs";
import { mkdtemp, rename, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PACKAGE_LOCAL_CONFIG = resolve(process.cwd(), "packages/video-gen/config.local.json");

export interface OfflineFixture {
  configPath: string;
  homeDir: string;
  cwd: string;
  outputDir: string;
  packageRoot: string;
  apiKey: string;
  cleanup: () => Promise<void>;
}

export interface OfflineFixtureOptions {
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  omitApiKey?: boolean;
}

/**
 * Isolated temp dirs + config pointing at a local Ark adapter.
 */
export async function createOfflineFixture(
  options: OfflineFixtureOptions,
): Promise<OfflineFixture> {
  const apiKey = options.apiKey ?? "test-key-offline-not-real";
  const homeDir = await mkdtemp(join(tmpdir(), "video-gen-home-"));
  const cwd = await mkdtemp(join(tmpdir(), "video-gen-cwd-"));
  const packageRoot = await mkdtemp(join(tmpdir(), "video-gen-pkg-"));
  const outputDir = join(cwd, "generated-videos");
  const configPath = join(cwd, "video-gen.config.json");

  const config: Record<string, unknown> = {
    baseUrl: options.baseUrl,
    defaultModel: options.defaultModel ?? "doubao-seedance-2-0-260128",
    outputDir,
    timeoutMs: options.timeoutMs ?? 15_000,
    pollIntervalMs: options.pollIntervalMs ?? 50,
  };
  if (!options.omitApiKey) {
    config.apiKey = apiKey;
  }

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const dirs = [homeDir, cwd, packageRoot];

  return {
    configPath,
    homeDir,
    cwd,
    outputDir,
    packageRoot,
    apiKey,
    cleanup: async () => {
      await Promise.all(
        dirs.map((dir) => rm(dir, { recursive: true, force: true }).catch(() => undefined)),
      );
    },
  };
}

export function offlineEnv(fixture: OfflineFixture): NodeJS.ProcessEnv {
  return {
    VIDEO_GEN_CONFIG: fixture.configPath,
    HOME: fixture.homeDir,
    USERPROFILE: fixture.homeDir,
  };
}

/**
 * Temporarily hide packages/video-gen/config.local.json so black-box children
 * can exercise lower-priority discovery paths.
 */
export async function withPackageLocalConfigHidden<T>(fn: () => Promise<T>): Promise<T> {
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
