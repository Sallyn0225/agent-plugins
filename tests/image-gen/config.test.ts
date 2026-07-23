import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, type LoadConfigOptions } from "../../packages/image-gen/src/config.js";
import {
  getMcpServerMetadata,
  getPackageVersion,
} from "../../packages/image-gen/src/package-meta.js";

const packageJsonPath = resolve("packages/image-gen/package.json");

const minimalModels = {
  "gpt-image-2": {
    provider: "openai-images",
    baseUrl: "https://example.test",
    apiKey: "sk-test-key",
    model: "gpt-image-2",
  },
};

async function writeConfig(dir: string, fileName: string, label: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, fileName);
  await writeFile(
    path,
    JSON.stringify(
      {
        defaultModel: "gpt-image-2",
        models: {
          "gpt-image-2": {
            ...minimalModels["gpt-image-2"],
            apiKey: `sk-${label}`,
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  return path;
}

function whichSource(config: ReturnType<typeof loadConfig>): string {
  return config.models["gpt-image-2"]!.apiKey;
}

describe("image-gen configuration contracts", () => {
  const warnings: string[] = [];
  const warn = (message: string) => {
    warnings.push(message);
  };

  afterEach(() => {
    warnings.length = 0;
    vi.unstubAllEnvs();
  });

  async function isolatedOptions(
    overrides: Partial<LoadConfigOptions> = {},
  ): Promise<LoadConfigOptions> {
    const homeDir = await mkdtemp(join(tmpdir(), "image-gen-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "image-gen-cwd-"));
    const packageRoot = await mkdtemp(join(tmpdir(), "image-gen-pkg-"));
    return {
      homeDir,
      cwd,
      packageRoot,
      env: {},
      warn,
      ...overrides,
    };
  }

  it("prefers IMAGE_GEN_CONFIG over every other configuration source", async () => {
    const options = await isolatedOptions();
    const preferred = await writeConfig(options.cwd!, "preferred.json", "preferred");
    const mcpAlias = await writeConfig(options.cwd!, "mcp-alias.json", "mcp-alias");
    const legacyEnv = await writeConfig(options.cwd!, "legacy-env.json", "legacy-env");
    await writeConfig(
      join(options.homeDir!, ".config", "agent-plugins"),
      "image-gen.json",
      "plugins",
    );
    await writeConfig(
      join(options.homeDir!, ".config", "agent-tooling"),
      "image-gen.json",
      "tooling",
    );

    const config = loadConfig({
      ...options,
      env: {
        IMAGE_GEN_CONFIG: preferred,
        IMAGE_GEN_MCP_CONFIG: mcpAlias,
        AGENT_TOOLING_IMAGE_GEN_CONFIG: legacyEnv,
      },
    });

    expect(whichSource(config)).toBe("sk-preferred");
    expect(warnings).toEqual([]);
  });

  it("supports IMAGE_GEN_MCP_CONFIG as a brand-neutral alias when IMAGE_GEN_CONFIG is unset", async () => {
    const options = await isolatedOptions();
    const mcpAlias = await writeConfig(options.cwd!, "mcp-alias.json", "mcp-alias");
    await writeConfig(
      join(options.homeDir!, ".config", "agent-plugins"),
      "image-gen.json",
      "plugins",
    );

    const config = loadConfig({
      ...options,
      env: {
        IMAGE_GEN_MCP_CONFIG: mcpAlias,
      },
    });

    expect(whichSource(config)).toBe("sk-mcp-alias");
    expect(warnings).toEqual([]);
  });

  it("prefers the Agent Plugins config directory over the legacy Agent Tooling directory", async () => {
    const options = await isolatedOptions();
    await writeConfig(
      join(options.homeDir!, ".config", "agent-plugins"),
      "image-gen.json",
      "plugins",
    );
    await writeConfig(
      join(options.homeDir!, ".config", "agent-tooling"),
      "image-gen.json",
      "tooling",
    );

    const config = loadConfig(options);

    expect(whichSource(config)).toBe("sk-plugins");
    expect(warnings).toEqual([]);
  });

  it("falls back to AGENT_TOOLING_IMAGE_GEN_CONFIG and emits one non-sensitive deprecation warning", async () => {
    const options = await isolatedOptions();
    const legacyEnv = await writeConfig(options.cwd!, "legacy-env.json", "legacy-env");

    const config = loadConfig({
      ...options,
      env: {
        AGENT_TOOLING_IMAGE_GEN_CONFIG: legacyEnv,
      },
    });

    expect(whichSource(config)).toBe("sk-legacy-env");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/AGENT_TOOLING_IMAGE_GEN_CONFIG/);
    expect(warnings[0]).toMatch(/v3/);
    expect(warnings[0]).not.toMatch(/sk-/);
    expect(warnings[0]).not.toMatch(/legacy-env\.json/);
  });

  it("falls back to the legacy Agent Tooling directory and emits one non-sensitive deprecation warning", async () => {
    const options = await isolatedOptions();
    await writeConfig(
      join(options.homeDir!, ".config", "agent-tooling"),
      "image-gen.json",
      "tooling",
    );

    const config = loadConfig(options);

    expect(whichSource(config)).toBe("sk-tooling");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/agent-tooling/);
    expect(warnings[0]).toMatch(/agent-plugins/);
    expect(warnings[0]).toMatch(/v3/);
    expect(warnings[0]).not.toMatch(/sk-/);
  });

  it("prefers the Agent Plugins directory over a usable legacy Agent Tooling env var", async () => {
    const options = await isolatedOptions();
    const legacyEnv = await writeConfig(options.cwd!, "legacy-env.json", "legacy-env");
    await writeConfig(
      join(options.homeDir!, ".config", "agent-plugins"),
      "image-gen.json",
      "plugins",
    );
    await writeConfig(
      join(options.homeDir!, ".config", "agent-tooling"),
      "image-gen.json",
      "tooling",
    );

    const config = loadConfig({
      ...options,
      env: {
        AGENT_TOOLING_IMAGE_GEN_CONFIG: legacyEnv,
      },
    });

    expect(whichSource(config)).toBe("sk-plugins");
    expect(warnings).toEqual([]);
  });

  it("keeps warnings on the warn channel so callers can preserve machine-readable stdout", async () => {
    const options = await isolatedOptions();
    await writeConfig(
      join(options.homeDir!, ".config", "agent-tooling"),
      "image-gen.json",
      "tooling",
    );
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      loadConfig(options);
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(warnings).toHaveLength(1);
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});

describe("image-gen package version contracts", () => {
  it("derives package and MCP version metadata from package.json rather than a handwritten constant", () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(getPackageVersion()).toBe(pkg.version);
    expect(getMcpServerMetadata()).toEqual({
      name: "image-gen",
      version: pkg.version,
    });
  });
});
