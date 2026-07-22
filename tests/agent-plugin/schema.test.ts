import { describe, expect, it } from "vitest";
import {
  AGENT_PLUGIN_SCHEMA_VERSION,
  parseAgentPlugin,
  safeParseAgentPlugin,
} from "../../scripts/agent-plugin/schema.js";

const validImageGenPlugin = {
  schemaVersion: AGENT_PLUGIN_SCHEMA_VERSION,
  id: "image-gen",
  displayName: "Image Generation",
  maturity: "stable",
  interfaces: {
    library: true,
    cli: true,
    mcp: true,
    skill: true,
  },
  mcp: {
    transport: "stdio",
    tools: ["list_image_models", "generate_image", "edit_image"],
  },
  skill: {
    format: "agent-skills",
    path: "skills/image-gen",
  },
  verification: {
    automated: ["unit", "offline-cli", "offline-mcp", "package-contents"],
    liveProviders: "manual",
  },
};

describe("agentPlugin schema", () => {
  it("accepts a complete stable Capability Plugin manifest", () => {
    const parsed = parseAgentPlugin(validImageGenPlugin);
    expect(parsed.id).toBe("image-gen");
    expect(parsed.maturity).toBe("stable");
    expect(parsed.interfaces.mcp).toBe(true);
    expect(parsed.mcp?.tools).toEqual([
      "list_image_models",
      "generate_image",
      "edit_image",
    ]);
  });

  it("rejects manifests that duplicate standard npm fields", () => {
    const result = safeParseAgentPlugin({
      ...validImageGenPlugin,
      version: "1.0.0",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/must not duplicate npm field "version"/);
    }
  });

  it("requires mcp metadata when the MCP Delivery Interface is enabled", () => {
    const result = safeParseAgentPlugin({
      ...validImageGenPlugin,
      mcp: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("allows a CLI-only experimental plugin without mcp or skill blocks", () => {
    const parsed = parseAgentPlugin({
      schemaVersion: 1,
      id: "hello",
      displayName: "Hello",
      maturity: "experimental",
      interfaces: {
        library: false,
        cli: true,
        mcp: false,
        skill: false,
      },
      verification: {
        automated: ["unit", "offline-cli"],
        liveProviders: "none",
      },
    });
    expect(parsed.interfaces.cli).toBe(true);
    expect(parsed.mcp).toBeUndefined();
  });

  it("rejects unknown schema versions", () => {
    const result = safeParseAgentPlugin({
      ...validImageGenPlugin,
      schemaVersion: 99,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty Delivery Interface sets", () => {
    const result = safeParseAgentPlugin({
      ...validImageGenPlugin,
      interfaces: {
        library: false,
        cli: false,
        mcp: false,
        skill: false,
      },
      mcp: undefined,
      skill: undefined,
    });
    expect(result.success).toBe(false);
  });
});
