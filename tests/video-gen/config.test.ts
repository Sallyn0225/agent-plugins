import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BASE_URL,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  loadConfig,
  type LoadConfigOptions,
} from "../../packages/video-gen/src/config.js";
import { DEFAULT_MODEL_ID } from "../../packages/video-gen/src/models.js";

async function writeConfig(
  dir: string,
  fileName: string,
  data: Record<string, unknown>,
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, fileName);
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
  return path;
}

describe("video-gen configuration contracts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function isolatedOptions(
    overrides: Partial<LoadConfigOptions> = {},
  ): Promise<LoadConfigOptions> {
    const homeDir = await mkdtemp(join(tmpdir(), "video-gen-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "video-gen-cwd-"));
    const packageRoot = await mkdtemp(join(tmpdir(), "video-gen-pkg-"));
    return {
      homeDir,
      cwd,
      packageRoot,
      env: {},
      ...overrides,
    };
  }

  it("prefers VIDEO_GEN_CONFIG over package-local and user default", async () => {
    const options = await isolatedOptions();
    const preferred = await writeConfig(options.cwd!, "preferred.json", {
      baseUrl: "https://preferred.example/api/v3",
      apiKey: "sk-preferred",
      defaultModel: "model-preferred",
    });
    await writeConfig(options.packageRoot!, "config.local.json", {
      baseUrl: "https://package.example/api/v3",
      apiKey: "sk-package",
    });
    await writeConfig(join(options.homeDir!, ".config", "agent-plugins"), "video-gen.json", {
      baseUrl: "https://home.example/api/v3",
      apiKey: "sk-home",
    });

    const config = loadConfig({
      ...options,
      env: { VIDEO_GEN_CONFIG: preferred },
    });

    expect(config.apiKey).toBe("sk-preferred");
    expect(config.baseUrl).toBe("https://preferred.example/api/v3");
    expect(config.defaultModel).toBe("model-preferred");
    expect(config.configPath).toBe(preferred);
  });

  it("uses package-local config.local.json when env is unset", async () => {
    const options = await isolatedOptions();
    await writeConfig(options.packageRoot!, "config.local.json", {
      baseUrl: "https://package.example/api/v3",
      apiKey: "sk-package",
    });
    await writeConfig(join(options.homeDir!, ".config", "agent-plugins"), "video-gen.json", {
      baseUrl: "https://home.example/api/v3",
      apiKey: "sk-home",
    });

    const config = loadConfig(options);
    expect(config.apiKey).toBe("sk-package");
    expect(config.baseUrl).toBe("https://package.example/api/v3");
  });

  it("falls back to ~/.config/agent-plugins/video-gen.json", async () => {
    const options = await isolatedOptions();
    await writeConfig(join(options.homeDir!, ".config", "agent-plugins"), "video-gen.json", {
      baseUrl: "https://home.example/api/v3",
      apiKey: "sk-home",
    });

    const config = loadConfig(options);
    expect(config.apiKey).toBe("sk-home");
  });

  it("prefers VIDEO_GEN_API_KEY over ARK_API_KEY over file apiKey", async () => {
    const options = await isolatedOptions();
    const path = await writeConfig(options.cwd!, "cfg.json", {
      baseUrl: "https://example.test/api/v3",
      apiKey: "sk-file",
    });

    const withVideoKey = loadConfig({
      ...options,
      env: {
        VIDEO_GEN_CONFIG: path,
        VIDEO_GEN_API_KEY: "sk-video-env",
        ARK_API_KEY: "sk-ark-env",
      },
    });
    expect(withVideoKey.apiKey).toBe("sk-video-env");

    const withArkKey = loadConfig({
      ...options,
      env: {
        VIDEO_GEN_CONFIG: path,
        ARK_API_KEY: "sk-ark-env",
      },
    });
    expect(withArkKey.apiKey).toBe("sk-ark-env");

    const withFileKey = loadConfig({
      ...options,
      env: { VIDEO_GEN_CONFIG: path },
    });
    expect(withFileKey.apiKey).toBe("sk-file");
  });

  it("applies official defaults for timeout, poll interval, outputDir, baseUrl, model", async () => {
    const options = await isolatedOptions();
    const path = await writeConfig(options.cwd!, "cfg.json", {
      apiKey: "sk-defaults",
    });

    const config = loadConfig({
      ...options,
      env: { VIDEO_GEN_CONFIG: path },
    });

    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(config.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(config.pollIntervalMs).toBe(DEFAULT_POLL_INTERVAL_MS);
    expect(config.defaultModel).toBe(DEFAULT_MODEL_ID);
    expect(config.outputDir).toBe(join(options.cwd!, DEFAULT_OUTPUT_DIR.replace("./", "")));
  });

  it("throws when no apiKey is available", async () => {
    const options = await isolatedOptions();
    expect(() => loadConfig(options)).toThrow(/No API key configured/);
  });

  it("allowMissingCredentials returns empty apiKey without throwing", async () => {
    const options = await isolatedOptions();
    const config = loadConfig({ ...options, allowMissingCredentials: true });
    expect(config.apiKey).toBe("");
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
  });
});
