# Agent Plugins

Host-independent Capability Plugins for coding agents, published at [github.com/Sallyn0225/agent-plugins](https://github.com/Sallyn0225/agent-plugins):

| Layer | Purpose | When to use |
|------|---------|-------------|
| **MCP server** | Structured tools for agents with MCP support (Claude Code, Codex, Cursor, etc.) | Host supports MCP and you want first-class tool calling |
| **CLI** | Deterministic shell entrypoint | Skills, scripts, CI, agents without MCP |
| **Skill** | Workflow instructions for agents | Teach the model *when/how* to call the CLI |
| **Plugin / Extension** | Host-native packaging (Pi packages, Claude plugins later) | Deeper integration with a specific host |

## Layout

```text
.
├── packages/                 # runnable tools (MCP + CLI)
│   └── image-gen/            # text-to-image + image edit
├── skills/                   # agent skills (SKILL.md)
│   └── image-gen/
└── README.md
```

## Packages

### `@sallyn0225/image-gen`

Multi-provider image generation & editing.

- **npm:** https://www.npmjs.com/package/@sallyn0225/image-gen
- **MCP tools:** `list_image_models`, `generate_image`, `edit_image`
- **CLI:** `image-gen list|generate|edit|mcp`
- **Skill:** `skills/image-gen`

Supported first-batch models:

- `gpt-image-2` → OpenAI Images API
- `grok-imagine-image` → OpenAI-compatible Images API
- `gemini-3.1-flash-image` → Gemini `generateContent`

## Install for others (npm)

```bash
npm i -g @sallyn0225/image-gen
image-gen list

# or without global install
npx -y @sallyn0225/image-gen generate --model gpt-image-2 "a red apple"
npx -y @sallyn0225/image-gen mcp
```

MCP host snippet:

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "npx",
      "args": ["-y", "@sallyn0225/image-gen", "mcp"],
      "env": {
        "IMAGE_GEN_CONFIG": "C:/Users/YOU/.config/agent-tooling/image-gen.json"
      }
    }
  }
}
```

Each user brings **their own** `baseUrl` + `apiKey`. Never ship `config.local.json`.

Full guide: [packages/image-gen/README.md](packages/image-gen/README.md).

## Publish (maintainer)

```bash
npm login
npm run build:image-gen
npm run publish:image-gen
```

## Quick start (local monorepo)

```bash
npm install
npm run build:image-gen

npm run image-gen -- list
npm run image-gen -- generate --model gpt-image-2 "a red apple"
npm run image-gen -- edit --model gemini-3.1-flash-image --image ./in.png "make it watercolor"
npm run image-gen:mcp
```

## Config

```bash
cp packages/image-gen/config.example.json packages/image-gen/config.local.json
# or user-level: ~/.config/agent-tooling/image-gen.json
export IMAGE_GEN_CONFIG=/absolute/path/to/config.json
```

## Adding a new tool later

1. Create `packages/<name>/` with MCP + CLI (shared core)
2. Add `skills/<name>/SKILL.md` that documents the CLI workflow
3. Wire workspace scripts in root `package.json`
4. Keep secrets out of git (`*.local.json`, env vars)

## Design rule of thumb

- **Prefer MCP** when the host has good MCP support and tool schemas help.
- **Always ship CLI + Skill** so agents without MCP (or with flaky MCP) can still run the same capability via shell.
- Keep business logic in package core; MCP/CLI/Skill are thin adapters.
