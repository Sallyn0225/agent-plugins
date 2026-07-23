import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { assertBuiltBinaries, mcpSpawnParams } from "./helpers/cli-process.js";
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
} from "./helpers/local-provider-adapter.js";
import { TINY_PNG_BASE64 } from "./helpers/local-provider-adapter.js";

const packageJson = JSON.parse(
  readFileSync(resolve("packages/image-gen/package.json"), "utf8"),
) as { version: string; agentPlugin: { mcp: { tools: string[] } } };

const EXPECTED_TOOLS = ["list_image_models", "generate_image", "edit_image"] as const;
const PACKAGE_VERSION = packageJson.version;

const adapters: LocalProviderAdapter[] = [];
const fixtures: OfflineFixture[] = [];
const clients: Array<{ client: Client; transport: StdioClientTransport }> = [];

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

/** Connect an MCP SDK client to a built binary over stdio and collect stderr. */
async function connectMcpLive(options: {
  fixture: OfflineFixture;
  entry?: "mcp" | "cli-mcp" | "cli-serve" | "cli-default";
  env?: NodeJS.ProcessEnv;
}): Promise<{
  client: Client;
  transport: StdioClientTransport;
  getStderr: () => string;
}> {
  const params = mcpSpawnParams({
    entry: options.entry ?? "mcp",
    env: { ...offlineEnv(options.fixture), ...options.env },
    cwd: options.fixture.cwd,
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

  const client = new Client({ name: "image-gen-offline-test", version: "0.0.0" });
  await client.connect(transport);
  clients.push({ client, transport });
  return {
    client,
    transport,
    getStderr: () => stderr,
  };
}

beforeAll(() => {
  assertBuiltBinaries();
  expect(packageJson.agentPlugin.mcp.tools).toEqual([...EXPECTED_TOOLS]);
});

afterEach(async () => {
  while (clients.length > 0) {
    const entry = clients.pop();
    if (!entry) break;
    try {
      await entry.client.close();
    } catch {
      /* ignore */
    }
    try {
      await entry.transport.close();
    } catch {
      /* ignore */
    }
  }
  while (adapters.length > 0) {
    await adapters.pop()?.stop();
  }
  while (fixtures.length > 0) {
    await fixtures.pop()?.cleanup();
  }
});

describe("image-gen MCP Delivery Interface (SDK client over stdio)", () => {
  it("initializes with server identity and package version", async () => {
    const adapter = await startAdapter(openaiGenerateSuccessHandler());
    const fixture = await fixtureFor(adapter);
    const { client, getStderr } = await connectMcpLive({ fixture });

    const version = client.getServerVersion();
    expect(version).toEqual({
      name: "image-gen",
      version: PACKAGE_VERSION,
    });

    const capabilities = client.getServerCapabilities();
    expect(capabilities).toBeDefined();
    expect(capabilities?.tools).toBeDefined();

    // Ready banner is diagnostic and must stay on stderr (not stdout framing).
    expect(getStderr()).toMatch(/image-gen MCP ready/i);
  });

  it("lists the three stable tools with usable schemas", async () => {
    const adapter = await startAdapter(openaiGenerateSuccessHandler());
    const fixture = await fixtureFor(adapter);
    const { client } = await connectMcpLive({ fixture });

    const listed = await client.listTools();
    const names = listed.tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());

    const byName = Object.fromEntries(listed.tools.map((t) => [t.name, t]));

    expect(byName.list_image_models?.inputSchema).toBeDefined();

    const genSchema = byName.generate_image?.inputSchema as {
      type?: string;
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(genSchema?.properties).toHaveProperty("prompt");
    expect(genSchema?.required ?? []).toContain("prompt");

    const editSchema = byName.edit_image?.inputSchema as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(editSchema?.properties).toHaveProperty("prompt");
    expect(editSchema?.properties).toHaveProperty("images");
    expect(editSchema?.required ?? []).toEqual(expect.arrayContaining(["prompt", "images"]));
  });

  it("calls list_image_models successfully", async () => {
    const adapter = await startAdapter(openaiGenerateSuccessHandler());
    const fixture = await fixtureFor(adapter);
    const { client } = await connectMcpLive({ fixture });

    const result = await client.callTool({ name: "list_image_models", arguments: {} });
    expect(result.isError).not.toBe(true);

    const text = (result.content as Array<{ type: string; text?: string }>).find(
      (c) => c.type === "text",
    )?.text;
    expect(text).toBeTruthy();
    const payload = JSON.parse(text!);
    expect(payload.defaultModel).toBe("gpt-image-2");
    expect(payload.models[0].apiKey).toMatch(/\*+/);
    expect(text).not.toContain("test-key-offline-not-real");
  });

  it("calls generate_image successfully and returns image content", async () => {
    const adapter = await startAdapter(openaiGenerateSuccessHandler());
    const fixture = await fixtureFor(adapter);
    const { client } = await connectMcpLive({ fixture });

    const result = await client.callTool({
      name: "generate_image",
      arguments: {
        prompt: "offline generate via mcp",
        save: false,
      },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{
      type: string;
      text?: string;
      data?: string;
      mimeType?: string;
    }>;

    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toMatch(/Generated 1 image/i);
    expect(text).toContain("gpt-image-2");

    const images = content.filter((c) => c.type === "image");
    expect(images).toHaveLength(1);
    expect(images[0]?.data).toBe(TINY_PNG_BASE64);
    expect(images[0]?.mimeType).toBe("image/png");

    expect(adapter.captures.some((c) => c.url === "/v1/images/generations")).toBe(true);
  });

  it("calls edit_image successfully with a local image path", async () => {
    const adapter = await startAdapter(openaiEditSuccessHandler());
    const fixture = await fixtureFor(adapter);
    const { client } = await connectMcpLive({ fixture });

    const result = await client.callTool({
      name: "edit_image",
      arguments: {
        prompt: "offline edit via mcp",
        images: [{ path: fixture.inputImagePath }],
        save: false,
      },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; data?: string; mimeType?: string }>;
    const images = content.filter((c) => c.type === "image");
    expect(images).toHaveLength(1);
    expect(images[0]?.data).toBe(TINY_PNG_BASE64);
    expect(adapter.captures.some((c) => c.url === "/v1/images/edits")).toBe(true);
  });

  it("maps provider failures to isError tool results", async () => {
    const adapter = await startAdapter((_req, res) => {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "adapter unavailable" } }));
    });
    const fixture = await fixtureFor(adapter);
    const { client } = await connectMcpLive({ fixture });

    const result = await client.callTool({
      name: "generate_image",
      arguments: { prompt: "will fail", save: false },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text?: string }>).find(
      (c) => c.type === "text",
    )?.text;
    expect(text).toMatch(/Image generation failed/i);
  });

  it("maps unknown model errors through the tool error channel", async () => {
    const adapter = await startAdapter(openaiGenerateSuccessHandler());
    const fixture = await fixtureFor(adapter);
    const { client } = await connectMcpLive({ fixture });

    const result = await client.callTool({
      name: "generate_image",
      arguments: {
        prompt: "nope",
        model: "missing-model",
        save: false,
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text?: string }>).find(
      (c) => c.type === "text",
    )?.text;
    expect(text).toMatch(/Unknown model/i);
  });

  it("starts via CLI mcp/serve aliases with intact protocol framing", async () => {
    for (const entry of ["cli-mcp", "cli-serve", "cli-default"] as const) {
      const adapter = await startAdapter(openaiGenerateSuccessHandler());
      const fixture = await fixtureFor(adapter);
      const { client, getStderr } = await connectMcpLive({ fixture, entry });

      const version = client.getServerVersion();
      expect(version?.name).toBe("image-gen");
      expect(version?.version).toBe(PACKAGE_VERSION);

      const listed = await client.listTools();
      expect(listed.tools.map((t) => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());

      // Ready message is on stderr; framing on stdout remains protocol-only.
      expect(getStderr()).toMatch(/image-gen MCP ready/i);
    }
  });

  it("keeps deprecation warnings on stderr without breaking stdio framing", async () => {
    const adapter = await startAdapter(openaiGenerateSuccessHandler());
    const fixture = await fixtureFor(adapter);

    // Hide package-local config.local.json so legacy env is actually selected.
    const { client, getStderr } = await withPackageLocalConfigHidden(() =>
      connectMcpLive({
        fixture,
        env: {
          HOME: fixture.homeDir,
          USERPROFILE: fixture.homeDir,
          AGENT_TOOLING_IMAGE_GEN_CONFIG: fixture.configPath,
          IMAGE_GEN_CONFIG: undefined,
          IMAGE_GEN_MCP_CONFIG: undefined,
        },
      }),
    );

    // Protocol still works.
    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(3);

    const result = await client.callTool({
      name: "list_image_models",
      arguments: {},
    });
    expect(result.isError).not.toBe(true);

    expect(getStderr()).toMatch(/v2 compatibility fallback|AGENT_TOOLING_IMAGE_GEN_CONFIG/i);
  });
});
