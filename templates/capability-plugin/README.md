# @sallyn0225/__CAPABILITY_ID__

> 中文: [README.zh-CN.md](./README.zh-CN.md)

__CAPABILITY_DESCRIPTION__

## Delivery Interfaces

| Interface | Entry | Notes |
| --- | --- | --- |
| Library | `@sallyn0225/__CAPABILITY_ID__` | Programmatic API |
| CLI | `__CAPABILITY_ID__` | Shell / agent fallback |
| Agent Skill | `skills/__CAPABILITY_ID__/SKILL.md` | Open Agent Skills format |

MCP is optional. Enable it only when a real Host needs structured tools.

## Install

```bash
npm i -g @sallyn0225/__CAPABILITY_ID__
__CAPABILITY_ID__ --help
```

## Development

This package is a Capability Plugin in the Agent Plugins monorepo.

1. Replace every `__CAPABILITY_*__` placeholder.
2. Move the directory to `packages/__CAPABILITY_ID__/`.
3. Implement library + chosen Delivery Interfaces.
4. Run `npm run validate:plugins` from the repository root.
5. Run `npm run catalog:generate` to refresh root catalog sections.
