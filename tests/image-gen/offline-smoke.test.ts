/**
 * Offline smoke: built CLI + MCP binaries against a local Provider adapter.
 *
 * Cross-platform requirements:
 * - No shell / Bash-specific behavior (spawn with process.execPath + absolute paths)
 * - No external network, real credentials, or billable Provider calls
 * - Temp dirs only; no persistent generated output
 *
 * The existing live/networked smoke remains packages/image-gen/scripts/smoke.mjs
 * and is intentionally manual (never a required PR check).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertBuiltBinaries,
  mcpSpawnParams,
  runCli,
} from "./helpers/cli-process.js";
import {
  createOfflineFixture,
  offlineEnv,
  type OfflineFixture,
} from "./helpers/fixtures.js";
import {
  LocalProviderAdapter,
  openaiEditSuccessHandler,
  openaiGenerateSuccessHandler,
  TINY_PNG_BASE64,
} from "./helpers/local-provider-adapter.js";

describe("offline smoke (built CLI + MCP vs local Provider adapter)", () => {
  let adapter: LocalProviderAdapter;
  let fixture: OfflineFixture;

  beforeAll(async () => {
    assertBuiltBinaries();
    adapter = new LocalProviderAdapter(openaiGenerateSuccessHandler());
    await adapter.start();
    fixture = await createOfflineFixture({ baseUrl: adapter.baseUrl });
  });

  afterAll(async () => {
    await adapter?.stop();
    await fixture?.cleanup();
  });

  it("CLI help starts without config or network", async () => {
    const result = await runCli({ args: ["--help"] });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("image-gen");
  });

  it("CLI list → generate → edit against the local adapter", async () => {
    adapter.setHandler(openaiGenerateSuccessHandler());

    const list = await runCli({
      args: ["list"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });
    expect(list.exitCode).toBe(0);
    const listed = JSON.parse(list.stdout);
    expect(listed.defaultModel).toBe("gpt-image-2");

    const gen = await runCli({
      args: ["generate", "--no-save", "offline smoke generate"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });
    expect(gen.exitCode).toBe(0);
    expect(gen.stderr.trim()).toBe("");
    const genPayload = JSON.parse(gen.stdout);
    expect(genPayload.operation).toBe("generate");
    expect(genPayload.mimeTypes).toEqual(["image/png"]);
    expect(genPayload.bytes[0]).toBe(Buffer.from(TINY_PNG_BASE64, "base64").byteLength);

    adapter.setHandler(openaiEditSuccessHandler());
    const edit = await runCli({
      args: [
        "edit",
        "--no-save",
        "--image",
        fixture.inputImagePath,
        "offline smoke edit",
      ],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });
    expect(edit.exitCode).toBe(0);
    expect(edit.stderr.trim()).toBe("");
    const editPayload = JSON.parse(edit.stdout);
    expect(editPayload.operation).toBe("edit");
    expect(editPayload.inputImages).toEqual([fixture.inputImagePath]);
  });

  it("MCP binary initializes, lists tools, generate + edit end to end", async () => {
    adapter.setHandler(openaiGenerateSuccessHandler());

    const params = mcpSpawnParams({
      entry: "mcp",
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

    const client = new Client({ name: "offline-smoke", version: "0.0.0" });
    try {
      await client.connect(transport);

      const version = client.getServerVersion();
      expect(version?.name).toBe("image-gen");
      expect(typeof version?.version).toBe("string");

      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name).sort()).toEqual(
        ["edit_image", "generate_image", "list_image_models"].sort(),
      );

      const listed = await client.callTool({
        name: "list_image_models",
        arguments: {},
      });
      expect(listed.isError).not.toBe(true);

      const gen = await client.callTool({
        name: "generate_image",
        arguments: { prompt: "offline smoke mcp generate", save: false },
      });
      expect(gen.isError).not.toBe(true);
      const genImages = (
        gen.content as Array<{ type: string; data?: string }>
      ).filter((c) => c.type === "image");
      expect(genImages).toHaveLength(1);
      expect(genImages[0]?.data).toBe(TINY_PNG_BASE64);

      adapter.setHandler(openaiEditSuccessHandler());
      const edit = await client.callTool({
        name: "edit_image",
        arguments: {
          prompt: "offline smoke mcp edit",
          images: [{ path: fixture.inputImagePath }],
          save: false,
        },
      });
      expect(edit.isError).not.toBe(true);
      const editImages = (
        edit.content as Array<{ type: string; data?: string }>
      ).filter((c) => c.type === "image");
      expect(editImages).toHaveLength(1);

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
  });

  it("CLI mcp alias is a usable MCP entrypoint", async () => {
    adapter.setHandler(openaiGenerateSuccessHandler());

    const params = mcpSpawnParams({
      entry: "cli-mcp",
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

    const client = new Client({ name: "offline-smoke-cli-mcp", version: "0.0.0" });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.length).toBe(3);
      const gen = await client.callTool({
        name: "generate_image",
        arguments: { prompt: "via cli mcp alias", save: false },
      });
      expect(gen.isError).not.toBe(true);
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
  });
});
