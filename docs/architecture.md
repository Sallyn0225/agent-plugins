# Architecture

Agent Plugins is a small, host-independent npm monorepo organized around user capabilities rather than individual integration mechanisms.

## Vocabulary

- **Capability Plugin:** an independently versioned package that implements one useful capability and owns its public artifacts.
- **Delivery Interface:** a way to consume a Capability Plugin: Library, CLI, MCP, or Agent Skill.
- **Host:** the coding-agent application or environment that invokes a Delivery Interface.
- **Provider:** an external service or backend used by a capability, such as an image API.

Use these terms consistently. A Delivery Interface is not a separate plugin, and protocol compatibility does not prove that a particular Host or Provider has been tested.

## Decision

The repository uses npm workspaces and capability-oriented packages. Each publishable plugin is independently versioned and may expose whichever Delivery Interfaces are useful. The expected scale is roughly three to ten plugins, so Turbo, Nx, a task graph, and speculative shared business packages are intentionally excluded.

TypeScript is preferred, although a justified future plugin may use another language if it still satisfies repository metadata, documentation, testing, and packaging contracts.

## Package Structure

The target package boundary colocates implementation, public-interface tests, canonical Agent Skill, bilingual user documentation, examples, and release metadata:

```text
packages/<capability>/
├── src/
├── tests/
├── skills/<capability>/SKILL.md
├── package.json
├── README.md
├── README.zh-CN.md
└── LICENSE
```

The exact directories depend on enabled interfaces. During the current migration, some image-gen tests remain under the repository-level `tests/` directory; follow-up quality work can move them without changing their public seams. Do not create empty adapters. Shared business packages should appear only after at least two real plugins need a stable shared abstraction.

## Delivery Interfaces

Capability logic belongs in a cohesive package core. CLI, MCP, and Agent Skill surfaces should be thin adapters over that core:

- **Library** exposes a programmatic API when direct integration is useful.
- **CLI** supports scripts, CI, and agents with shell access.
- **MCP** exposes structured tools when Hosts benefit from protocol discovery and schemas.
- **Agent Skill** teaches an agent how and when to use the capability; one canonical open Agent Skills copy lives inside the publishable package.

No Delivery Interface is mandatory merely for symmetry. Existing public commands, schemas, outputs, and configuration are compatibility contracts.

## Metadata and Catalog

Standard npm fields are authoritative for name, version, description, license, repository, engines, exports, and binaries. The versioned `agentPlugin` manifest adds capability identity, display name, maturity (`experimental`, `stable`, or `deprecated`), enabled interfaces, MCP and Skill details, automated verification scope, and live-Provider policy without duplicating npm fields.

Validation cross-checks metadata against declared package files and required source artifacts. Package-specific documentation facts that are not derivable from npm metadata may live in a package-owned `docs-contract.json`. The bilingual root catalog is generated from the same metadata between fixed marker comments; package versions remain authoritative on npm and are not copied into the catalog.

## Testing

Tests observe behavior at the highest practical public seam: root lifecycle, exported library operations, built CLI processes, MCP over stdio, and Provider behavior through a local HTTP adapter. Pull-request checks are offline, deterministic, credential-free, and cross-platform.

Manual live smoke is separate, networked, and potentially billable. Offline protocol tests establish interface behavior, not continuous compatibility with every real Host or Provider. See [Testing](../TESTING.md).

## Trade-offs

This design keeps related changes local, supports independent releases, and lets Hosts choose appropriate interfaces. It accepts some repeated adapter and package setup in exchange for clear ownership and low tooling complexity. npm workspaces provide less task scheduling than heavier monorepo platforms, but that trade-off is appropriate at the intended scale. The architecture can be revisited when measured needs—not structural symmetry—justify a deeper shared seam or task graph.
