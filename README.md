# Agent Plugins

> 中文: [README.zh-CN.md](./README.zh-CN.md)

Host-independent **Capability Plugins** for coding agents. Each independently versioned package delivers one maintained capability through any useful combination of **Library**, **CLI**, **MCP**, and **Agent Skill** interfaces.

This repository is an implementation monorepo, not a third-party plugin directory. English READMEs are canonical; their Chinese counterparts preserve the same structure, commands, and technical facts.

<!-- agent-plugins:catalog:start -->

## Capability Plugins

Package versions are published on npm and are not mirrored here.

| Capability | Package | Maturity | Delivery Interfaces | Verification |
| --- | --- | --- | --- | --- |
| Image Generation | [`@sallyn0225/image-gen`](packages/image-gen) | stable | Library, CLI, MCP, Agent Skill | automated: unit, offline-cli, offline-mcp, docs, metadata; manual live Provider smoke only |

Protocol compatibility of a Delivery Interface is not the same as continuous Host or Provider verification. See each plugin README for what has actually been tested.

<!-- agent-plugins:catalog:end -->

## Documentation

| Guide | Audience |
| --- | --- |
| [Image Generation plugin](packages/image-gen/README.md) | Users of the Library, CLI, MCP server, or Agent Skill |
| [Contributing](CONTRIBUTING.md) | Contributors and new-plugin proposers |
| [Development](DEVELOPMENT.md) | Local setup, commands, and repository rules |
| [Testing](TESTING.md) | Offline checks, public seams, and manual live smoke |
| [Creating a Capability Plugin](docs/creating-a-capability-plugin.md) | Authors of accepted plugins |
| [Architecture](docs/architecture.md) | Capability-oriented design and vocabulary |
| [Releasing](RELEASING.md) | Maintainers publishing independent versions |
| [Security](SECURITY.md) | Private vulnerability reporting and supported versions |
| [Code of Conduct](CODE_OF_CONDUCT.md) | Community behavior and enforcement |

## Repository Layout

```text
packages/                       Capability Plugin workspaces
templates/capability-plugin/    non-workspace starter template
docs/                           architecture and author guidance
scripts/                        validation and catalog tooling
tests/                          repository-level public-interface tests
```

A Capability Plugin owns its implementation, canonical Skill, user documentation, tests, and release metadata. Repository-level migration tests may remain under `tests/` until follow-up quality work completes colocation. See [Architecture](docs/architecture.md) for the intended boundaries.

## Install a Plugin

The current stable plugin requires Node.js 22 or newer:

```bash
npm install --global @sallyn0225/image-gen
image-gen list

# Or run without a global install
npx -y @sallyn0225/image-gen --help
```

Installation and configuration belong in each package guide; start with [image-gen](packages/image-gen/README.md).

## Contributing

Bug fixes, tests, documentation, and approved feature work are welcome. New Capability Plugins require a proposal and maintainer acceptance before implementation; interfaces are chosen for usefulness, not symmetry.

Read [Contributing](CONTRIBUTING.md), [Development](DEVELOPMENT.md), and [Testing](TESTING.md) before opening a pull request.

## Security

Do not report vulnerabilities or credentials in public issues. Use [GitHub Private Vulnerability Reporting](https://github.com/Sallyn0225/agent-plugins/security/advisories/new) as described in the [Security Policy](SECURITY.md).

## License

[MIT](LICENSE) © Sallyn0225.
