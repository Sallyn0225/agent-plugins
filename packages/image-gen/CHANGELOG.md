# @sallyn0225/image-gen

## 2.0.0

### Major Changes

- e3b9d91: Move image-gen into the Agent Plugins capability monorepo while preserving its package name, CLI commands, MCP tools, configuration schema, and Provider behavior.

  Use `~/.config/agent-plugins/image-gen.json` as the new default configuration path. The legacy `agent-tooling` path and environment alias remain available in v2 with deprecation warnings and are scheduled for removal in v3.

  Include the canonical Agent Skill, bilingual documentation, declarations, binaries, configuration example, and license in the published package.
