# @sallyn0225/__CAPABILITY_ID__

> 中文: [README.zh-CN.md](./README.zh-CN.md)

__CAPABILITY_DESCRIPTION__

## Delivery Interfaces

The template enables Library, CLI, and Agent Skill interfaces. Keep only useful interfaces in `package.json`; do not add adapters for symmetry.

| Interface | Entry |
| --- | --- |
| Library | `@sallyn0225/__CAPABILITY_ID__` |
| CLI | `__CAPABILITY_ID__` |
| Agent Skill | `skills/__CAPABILITY_ID__/SKILL.md` |

## Installation

Requires Node.js 22 or newer.

```bash
npm install @sallyn0225/__CAPABILITY_ID__
npx @sallyn0225/__CAPABILITY_ID__ --help
```

## Configuration

Document every configuration source, default, precedence rule, environment variable, and secret-handling requirement here. Never commit credentials or local configuration.

## CLI

Document commands, flags, exit codes, and the stdout/stderr contract. If CLI is disabled in metadata, state that this interface is not provided.

## MCP

MCP is disabled in the starter metadata. Enable it only for useful structured tools, then document transport, startup configuration, stable tool names, schemas, and error behavior. Otherwise state that MCP is not provided.

## Library

Document the public package exports and show a minimal caller-focused example. Prefer high-level operations over private helpers.

## Agent Skill

The canonical open Agent Skills file is [`skills/__CAPABILITY_ID__/SKILL.md`](./skills/__CAPABILITY_ID__/SKILL.md) and must ship in the npm tarball. If Skill is disabled, remove the metadata and artifact and explain that choice.

## Compatibility and Verification

List protocol requirements and the exact automated and manual verification scope. Protocol compatibility does not prove continuous testing with a real Host or Provider. Required checks must be offline and credential-free; label any live smoke as manual, networked, and potentially billable.

## Migration

For an initial release, state that no migration is required. For later releases, document preserved contracts, deprecated fallbacks, warnings, precedence, and the removal version.

## Troubleshooting

Document common installation, configuration, interface, Provider, and output failures without exposing credentials.

## Development

After replacing all placeholders and moving this directory to `packages/__CAPABILITY_ID__/`, run from the repository root:

```bash
npm install
npm run validate:plugins
npm run docs:check
npm run catalog:generate
npm run typecheck
npm test
npm run build
```

See [Creating a Capability Plugin](../../docs/creating-a-capability-plugin.md).

## License

[MIT](./LICENSE) © Sallyn0225.
