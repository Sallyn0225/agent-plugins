> 中文: [README.zh-CN.md](./README.zh-CN.md)

# @sallyn0225/image-gen

Multi-provider **image generation & editing** with three adapters on one core:

| Adapter | Entry | Best for |
|---------|-------|----------|
| **MCP** | `image-gen-mcp` | Claude Code, Codex, Cursor, any MCP host |
| **CLI** | `image-gen` | Scripts, CI, agents without MCP |
| **Skill** | package `skills/image-gen/SKILL.md` | Teach agents when/how to call the CLI |

## Install (one command)

```bash
# global CLI + MCP binaries
npm i -g @sallyn0225/image-gen

# or zero-install via npx
npx -y @sallyn0225/image-gen list
npx -y @sallyn0225/image-gen generate --model gpt-image-2 "a red apple"
npx -y @sallyn0225/image-gen mcp
```

## Configure API keys (each user brings their own)

Do **not** share personal keys. Create a config file:

**Windows PowerShell:**

```powershell
New-Item -ItemType Directory -Force $env:USERPROFILE\.config\agent-plugins | Out-Null
notepad $env:USERPROFILE\.config\agent-plugins\image-gen.json
```

**macOS / Linux:**

```bash
mkdir -p ~/.config/agent-plugins
nano ~/.config/agent-plugins/image-gen.json
```

Example:

```json
{
  "defaultModel": "gpt-image-2",
  "outputDir": "./generated-images",
  "timeoutMs": 180000,
  "models": {
    "gpt-image-2": {
      "provider": "openai-images",
      "baseUrl": "https://your-gateway.example",
      "apiKey": "sk-your-key",
      "model": "gpt-image-2"
    },
    "grok-imagine-image": {
      "provider": "openai-images",
      "baseUrl": "https://your-gateway.example",
      "apiKey": "sk-your-key",
      "model": "grok-imagine-image"
    },
    "gemini-3.1-flash-image": {
      "provider": "gemini",
      "baseUrl": "https://your-gateway.example",
      "apiKey": "sk-your-key",
      "model": "gemini-3.1-flash-image"
    }
  }
}
```

Or env vars:

```bash
export IMAGE_GEN_GPT_IMAGE_2_BASE_URL=https://...
export IMAGE_GEN_GPT_IMAGE_2_API_KEY=sk-...
export IMAGE_GEN_DEFAULT_MODEL=gpt-image-2
export IMAGE_GEN_CONFIG=/absolute/path/to/config.json
```

### Configuration resolution (v2)

Preferred sources (first match wins):

1. `IMAGE_GEN_CONFIG`
2. `IMAGE_GEN_MCP_CONFIG` (brand-neutral MCP alias; still supported)
3. package / cwd development files such as `config.local.json`
4. `~/.config/agent-plugins/image-gen.json`

v2 compatibility fallbacks (used only when no preferred source exists; removed in v3):

5. `AGENT_TOOLING_IMAGE_GEN_CONFIG`
6. `~/.config/agent-tooling/image-gen.json`

When a legacy fallback is **actually used**, image-gen emits **one** non-sensitive deprecation warning on **stderr**. Warnings never include API keys, never write to stdout JSON, and never alter MCP stdio framing.

## MCP host config

### Recommended (npx, no global install)

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "npx",
      "args": ["-y", "@sallyn0225/image-gen", "mcp"],
      "env": {
        "IMAGE_GEN_CONFIG": "C:/Users/YOU/.config/agent-plugins/image-gen.json"
      }
    }
  }
}
```

### After global install

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "image-gen-mcp",
      "env": {
        "IMAGE_GEN_CONFIG": "C:/Users/YOU/.config/agent-plugins/image-gen.json"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add image-gen -- npx -y @sallyn0225/image-gen mcp
```

Then set `IMAGE_GEN_CONFIG` in host env / shell profile.

## CLI

```bash
image-gen list
image-gen generate --model gpt-image-2 "a red apple"
image-gen generate --model grok-imagine-image --aspect-ratio 16:9 "sunset city"
image-gen generate --model gemini-3.1-flash-image --image-size 1K "flat icon"
image-gen edit --model gemini-3.1-flash-image --image ./in.png "watercolor style"
image-gen edit --model gpt-image-2 --image ./in.png --mask ./mask.png "fill masked area with flowers"
image-gen mcp
```

## MCP tools

- `list_image_models`
- `generate_image`
- `edit_image`

## Models

| Alias | Provider | Generate | Edit |
|------|----------|----------|------|
| `gpt-image-2` | `openai-images` | `POST /v1/images/generations` | `POST /v1/images/edits` |
| `grok-imagine-image` | `openai-images` | `POST /v1/images/generations` | Best-effort (gateway dependent) |
| `gemini-3.1-flash-image` | `gemini` | `generateContent` + IMAGE | multimodal edit |

## Local monorepo develop

```bash
npm install
npm run build:image-gen
npm run image-gen -- list
npm run image-gen:mcp
```

## License

MIT

## Agent Skill

Canonical Skill path inside this package: `skills/image-gen/SKILL.md` (open Agent Skills format). It is included in the npm tarball.
