# Agent Plugins

> 中文: [README.zh-CN.md](./README.zh-CN.md)

Host-independent **Capability Plugins** for coding agents, published at [github.com/Sallyn0225/agent-plugins](https://github.com/Sallyn0225/agent-plugins).

Each Capability Plugin is an independently versioned module that may expose any appropriate combination of **Library**, **CLI**, **MCP**, and **Agent Skill** Delivery Interfaces. No interface is mandatory merely for symmetry.

<!-- agent-plugins:catalog:start -->

## Capability Plugins

Package versions are published on npm and are not mirrored here.

| Capability | Package | Maturity | Delivery Interfaces | Verification |
| --- | --- | --- | --- | --- |
| Image Generation | [`@sallyn0225/image-gen`](packages/image-gen) | stable | Library, CLI, MCP, Agent Skill | automated: unit, offline-cli, offline-mcp, package-contents, docs, metadata; manual live Provider smoke only |

Protocol compatibility of a Delivery Interface is not the same as continuous Host or Provider verification. See each plugin README for what has actually been tested.

<!-- agent-plugins:catalog:end -->

## Repository layout

```text
.
├── packages/                      # Capability Plugins (npm workspaces)
│   └── image-gen/
├── templates/capability-plugin/   # non-workspace starter template
├── scripts/agent-plugin/          # manifest schema, validation, catalog generation
├── docs/creating-a-capability-plugin.md
└── README.md
```

## Install a plugin

```bash
npm i -g @sallyn0225/image-gen
image-gen list

# or without global install
npx -y @sallyn0225/image-gen generate --model gpt-image-2 "a red apple"
npx -y @sallyn0225/image-gen mcp
```

Full plugin guide: [packages/image-gen/README.md](packages/image-gen/README.md).

## Develop in this monorepo

```bash
npm install
npm run build
npm test
npm run validate:plugins
npm run catalog:check
```

## Create another Capability Plugin

See [docs/creating-a-capability-plugin.md](docs/creating-a-capability-plugin.md) and copy `templates/capability-plugin/`.

## Design rules

- Prefer MCP when the Host has good MCP support and tool schemas help.
- Ship CLI and/or Skill when agents need a shell or workflow fallback.
- Keep business logic in the package core; Delivery Interfaces are adapters.
- Keep one canonical Agent Skill inside the publishable package.

## License

MIT
