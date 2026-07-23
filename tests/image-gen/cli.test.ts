import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  assertBuiltBinaries,
  mcpSpawnParams,
  runCli,
} from "./helpers/cli-process.js";
import {
  createOfflineFixture,
  offlineEnv,
  withPackageLocalConfigHidden,
  type OfflineFixture,
} from "./helpers/fixtures.js";
import {
  LocalProviderAdapter,
  openaiEditSuccessHandler,
  openaiGenerateSuccessHandler,
  TINY_PNG_BASE64,
} from "./helpers/local-provider-adapter.js";

const adapters: LocalProviderAdapter[] = [];
const fixtures: OfflineFixture[] = [];

async function startAdapter(
  handler: ConstructorParameters<typeof LocalProviderAdapter>[0],
): Promise<LocalProviderAdapter> {
  const adapter = new LocalProviderAdapter(handler);
  await adapter.start();
  adapters.push(adapter);
  return adapter;
}

async function fixtureFor(adapter: LocalProviderAdapter): Promise<OfflineFixture> {
  const fixture = await createOfflineFixture({ baseUrl: adapter.baseUrl });
  fixtures.push(fixture);
  return fixture;
}

beforeAll(() => {
  assertBuiltBinaries();
});

afterEach(async () => {
  while (adapters.length > 0) {
    await adapters.pop()?.stop();
  }
  while (fixtures.length > 0) {
    await fixtures.pop()?.cleanup();
  }
});

describe("image-gen CLI process interface (black-box)", () => {
  it("prints help for --help and exits 0", async () => {
    const result = await runCli({ args: ["--help"] });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("image-gen");
    expect(result.stdout).toContain("generate");
    expect(result.stdout).toContain("edit");
    expect(result.stdout).toContain("list");
    // Help is user-facing text on stdout; stderr should stay clean.
    expect(result.stderr.trim()).toBe("");
  });

  it("prints help for help / -h", async () => {
    for (const args of [["help"], ["-h"]] as const) {
      const result = await runCli({ args: [...args] });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage:");
    }
  });

  it("lists models as parseable JSON on stdout", async () => {
    const adapter = await startAdapter(openaiGenerateSuccessHandler());
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: ["list"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload.defaultModel).toBe("gpt-image-2");
    expect(payload.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          alias: "gpt-image-2",
          provider: "openai-images",
          // apiKey must be masked in list output
          apiKey: expect.stringMatching(/\*+/),
        }),
      ]),
    );
    // Secrets must never appear in stdout.
    expect(result.stdout).not.toContain("test-key-offline-not-real");
  });

  it("generates an image and emits parseable JSON on stdout only", async () => {
    const adapter = await startAdapter(openaiGenerateSuccessHandler());
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: ["generate", "--no-save", "a tiny offline pixel"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      operation: "generate",
      model: "gpt-image-2",
      provider: "openai-images",
    });
    expect(payload.paths).toEqual([]);
    expect(payload.mimeTypes).toEqual(["image/png"]);
    expect(payload.bytes).toEqual([Buffer.from(TINY_PNG_BASE64, "base64").byteLength]);
    expect(adapter.captures.some((c) => c.url === "/v1/images/generations")).toBe(true);
  });

  it("edits an image via --image and emits JSON on stdout", async () => {
    const adapter = await startAdapter(openaiEditSuccessHandler({ revisedPrompt: "edited" }));
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: [
        "edit",
        "--no-save",
        "--image",
        fixture.inputImagePath,
        "make it watercolor",
      ],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      operation: "edit",
      model: "gpt-image-2",
      provider: "openai-images",
      inputImages: [fixture.inputImagePath],
    });
    expect(payload.mimeTypes).toEqual(["image/png"]);
    expect(adapter.captures.some((c) => c.url === "/v1/images/edits")).toBe(true);
  });

  it("rejects generate without a prompt (exit 1, help on stdout)", async () => {
    const adapter = await startAdapter(openaiGenerateSuccessHandler());
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: ["generate"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Usage:");
    // No provider call should have been made.
    expect(adapter.captures).toHaveLength(0);
  });

  it("rejects edit without --image (exit 1, help on stdout)", async () => {
    const adapter = await startAdapter(openaiGenerateSuccessHandler());
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: ["edit", "missing image flag"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Usage:");
    expect(adapter.captures).toHaveLength(0);
  });

  it("reports unknown models on stderr and exits 1 without contaminating stdout JSON", async () => {
    const adapter = await startAdapter(openaiGenerateSuccessHandler());
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: ["generate", "--model", "does-not-exist", "hello"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Unknown model/i);
    expect(result.stderr).toContain("does-not-exist");
    // stdout must not be a partial/corrupt JSON success payload
    if (result.stdout.trim()) {
      expect(() => JSON.parse(result.stdout)).toThrow();
    }
  });

  it("surfaces provider HTTP errors on stderr with non-zero exit", async () => {
    const adapter = await startAdapter((_req, res) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "boom from adapter" } }));
    });
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: ["generate", "--no-save", "will fail"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
    // Errors go to stderr; stdout must not carry a success JSON payload.
    expect(result.stdout.trim()).toBe("");
    expect(result.stdout).not.toMatch(/"operation"\s*:\s*"generate"/);
  });

  it("starts MCP via CLI mcp and serve aliases (process entrypoints)", async () => {
    for (const entry of ["cli-mcp", "cli-serve"] as const) {
      const adapter = await startAdapter(openaiGenerateSuccessHandler());
      const fixture = await fixtureFor(adapter);
      const params = mcpSpawnParams({
        entry,
        env: offlineEnv(fixture),
        cwd: fixture.cwd,
      });

      const transport = new StdioClientTransport({
        command: params.command,
        args: params.args,
        env: params.env,
        cwd: params.cwd,
        stderr: "pipe",
      });

      let stderr = "";
      const stderrStream = transport.stderr as NodeJS.ReadableStream | null;
      if (stderrStream && "setEncoding" in stderrStream) {
        stderrStream.setEncoding("utf8");
        stderrStream.on("data", (chunk: string | Buffer) => {
          stderr += String(chunk);
        });
      }

      const client = new Client({ name: "cli-alias-test", version: "0.0.0" });
      try {
        await client.connect(transport);
        const tools = await client.listTools();
        expect(tools.tools.map((t) => t.name).sort()).toEqual(
          ["edit_image", "generate_image", "list_image_models"].sort(),
        );
        expect(stderr).toMatch(/image-gen MCP ready/i);
      } finally {
        try {
          await client.close();
        } catch {
          /* ignore */
        }
        try {
          await transport.close();
        } catch {
          /* ignore */
        }
      }
    }
  });

  it("keeps deprecation warnings on stderr when a legacy env alias is used", async () => {
    const adapter = await startAdapter(openaiGenerateSuccessHandler());
    const fixture = await fixtureFor(adapter);

    // Hide package-local config.local.json so legacy env is actually selected.
    const result = await withPackageLocalConfigHidden(() =>
      runCli({
        args: ["list"],
        env: {
          HOME: fixture.homeDir,
          USERPROFILE: fixture.homeDir,
          AGENT_TOOLING_IMAGE_GEN_CONFIG: fixture.configPath,
          // Explicitly clear preferred vars
          IMAGE_GEN_CONFIG: undefined,
          IMAGE_GEN_MCP_CONFIG: undefined,
        },
        cwd: fixture.cwd,
      }),
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.defaultModel).toBe("gpt-image-2");
    expect(result.stderr).toMatch(/v2 compatibility fallback|AGENT_TOOLING_IMAGE_GEN_CONFIG/i);
    // Warning must not appear in stdout (JSON purity).
    expect(result.stdout).not.toMatch(/compatibility fallback/i);
  });
});
