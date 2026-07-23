import type { DiscoveredPlugin } from "./discover.js";
import type { AgentPlugin, DeliveryInterface } from "./schema.js";

export const CATALOG_START = "<!-- agent-plugins:catalog:start -->";
export const CATALOG_END = "<!-- agent-plugins:catalog:end -->";

const INTERFACE_LABELS: Record<DeliveryInterface, string> = {
  library: "Library",
  cli: "CLI",
  mcp: "MCP",
  skill: "Agent Skill",
};

function enabledInterfaces(plugin: AgentPlugin): string {
  return (Object.keys(INTERFACE_LABELS) as DeliveryInterface[])
    .filter((key) => plugin.interfaces[key])
    .map((key) => INTERFACE_LABELS[key])
    .join(", ");
}

function verificationSummary(plugin: AgentPlugin): string {
  const automated = plugin.verification.automated.join(", ");
  const live =
    plugin.verification.liveProviders === "none"
      ? "no live Provider checks"
      : plugin.verification.liveProviders === "manual"
        ? "manual live Provider smoke only"
        : "CI live Provider checks";
  return `automated: ${automated}; ${live}`;
}

/**
 * Render the generated catalog section for the root English README.
 * Intentionally omits package versions — npm is the version source of truth.
 */
export function renderEnglishCatalog(plugins: DiscoveredPlugin[]): string {
  const lines: string[] = [
    CATALOG_START,
    "",
    "## Capability Plugins",
    "",
    "Package versions are published on npm and are not mirrored here.",
    "",
    "| Capability | Package | Maturity | Delivery Interfaces | Verification |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const { packageJson, agentPlugin } of plugins) {
    const pkgName = packageJson.name ?? `@sallyn0225/${agentPlugin.id}`;
    const pkgLink = `[\`${pkgName}\`](packages/${agentPlugin.id})`;
    lines.push(
      `| ${agentPlugin.displayName} | ${pkgLink} | ${agentPlugin.maturity} | ${enabledInterfaces(agentPlugin)} | ${verificationSummary(agentPlugin)} |`,
    );
  }

  if (plugins.length === 0) {
    lines.push("| — | — | — | — | no plugins discovered |");
  }

  lines.push(
    "",
    "Protocol compatibility of a Delivery Interface is not the same as continuous Host or Provider verification. See each plugin README for what has actually been tested.",
    "",
    CATALOG_END,
  );
  return lines.join("\n");
}

/**
 * Render the generated catalog section for the root Chinese README.
 */
export function renderChineseCatalog(plugins: DiscoveredPlugin[]): string {
  const lines: string[] = [
    CATALOG_START,
    "",
    "## 能力插件",
    "",
    "包版本以 npm 为准，本页不镜像当前版本号。",
    "",
    "| 能力 | 包 | 成熟度 | 交付接口 | 验证范围 |",
    "| --- | --- | --- | --- | --- |",
  ];

  const maturityZh: Record<string, string> = {
    experimental: "实验性",
    stable: "稳定",
    deprecated: "已弃用",
  };

  const interfaceZh: Record<DeliveryInterface, string> = {
    library: "库",
    cli: "CLI",
    mcp: "MCP",
    skill: "Agent Skill",
  };

  for (const { packageJson, agentPlugin } of plugins) {
    const pkgName = packageJson.name ?? `@sallyn0225/${agentPlugin.id}`;
    const pkgLink = `[\`${pkgName}\`](packages/${agentPlugin.id})`;
    const interfaces = (Object.keys(interfaceZh) as DeliveryInterface[])
      .filter((key) => agentPlugin.interfaces[key])
      .map((key) => interfaceZh[key])
      .join("、");
    const automated = agentPlugin.verification.automated.join("、");
    const live =
      agentPlugin.verification.liveProviders === "none"
        ? "无在线 Provider 检查"
        : agentPlugin.verification.liveProviders === "manual"
          ? "仅手动在线 Provider 冒烟"
          : "CI 在线 Provider 检查";
    lines.push(
      `| ${agentPlugin.displayName} | ${pkgLink} | ${maturityZh[agentPlugin.maturity] ?? agentPlugin.maturity} | ${interfaces} | 自动化：${automated}；${live} |`,
    );
  }

  if (plugins.length === 0) {
    lines.push("| — | — | — | — | 未发现插件 |");
  }

  lines.push(
    "",
    "交付接口的协议兼容性并不等于已对真实 Host 或 Provider 做持续验证。各插件 README 会说明实际测过什么。",
    "",
    CATALOG_END,
  );
  return lines.join("\n");
}

/**
 * Replace the catalog region in a README, preserving surrounding prose.
 * If markers are missing, append the catalog at the end.
 */
export function upsertCatalogSection(readme: string, catalogSection: string): string {
  const start = readme.indexOf(CATALOG_START);
  const end = readme.indexOf(CATALOG_END);

  if (start !== -1 && end !== -1 && end > start) {
    const before = readme.slice(0, start);
    const after = readme.slice(end + CATALOG_END.length);
    // Avoid accumulating extra blank lines at the splice points
    const left = before.replace(/\s*$/, "\n\n");
    const right = after.replace(/^\s*/, "\n\n");
    return `${left}${catalogSection}${right}`.replace(/\n{3,}/g, "\n\n");
  }

  const trimmed = readme.replace(/\s*$/, "");
  return `${trimmed}\n\n${catalogSection}\n`;
}

export function isCatalogFresh(readme: string, expectedCatalog: string): boolean {
  const start = readme.indexOf(CATALOG_START);
  const end = readme.indexOf(CATALOG_END);
  if (start === -1 || end === -1 || end < start) return false;
  const current = readme.slice(start, end + CATALOG_END.length);
  return current === expectedCatalog;
}
