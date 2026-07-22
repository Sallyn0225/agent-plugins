import { describe, expect, it } from "vitest";
import {
  CATALOG_END,
  CATALOG_START,
  isCatalogFresh,
  renderEnglishCatalog,
  upsertCatalogSection,
} from "../../scripts/agent-plugin/catalog.js";
import type { DiscoveredPlugin } from "../../scripts/agent-plugin/discover.js";
import { AGENT_PLUGIN_SCHEMA_VERSION } from "../../scripts/agent-plugin/schema.js";

function pluginFixture(): DiscoveredPlugin {
  return {
    packageDir: "/repo/packages/image-gen",
    packageJson: {
      name: "@sallyn0225/image-gen",
      version: "1.1.1",
    },
    agentPlugin: {
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
        automated: ["unit", "offline-cli", "offline-mcp", "metadata"],
        liveProviders: "manual",
      },
    },
  };
}

describe("catalog generation", () => {
  it("renders a catalog table without embedding package versions", () => {
    const section = renderEnglishCatalog([pluginFixture()]);
    expect(section).toContain(CATALOG_START);
    expect(section).toContain(CATALOG_END);
    expect(section).toContain("Image Generation");
    expect(section).toContain("`@sallyn0225/image-gen`");
    expect(section).toContain("Library, CLI, MCP, Agent Skill");
    expect(section).toContain("stable");
    expect(section).not.toMatch(/1\.1\.1/);
    expect(section).toContain("not the same as continuous Host or Provider verification");
  });

  it("replaces only the catalog markers and keeps surrounding prose", () => {
    const original = [
      "# Agent Plugins",
      "",
      "Intro prose stays.",
      "",
      CATALOG_START,
      "old catalog",
      CATALOG_END,
      "",
      "Closing prose stays.",
      "",
    ].join("\n");

    const nextCatalog = renderEnglishCatalog([pluginFixture()]);
    const updated = upsertCatalogSection(original, nextCatalog);

    expect(updated).toContain("Intro prose stays.");
    expect(updated).toContain("Closing prose stays.");
    expect(updated).toContain("Image Generation");
    expect(updated).not.toContain("old catalog");
    expect(isCatalogFresh(updated, nextCatalog)).toBe(true);
  });
});
