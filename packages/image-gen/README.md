# @sallyn0225/image-gen

> 中文: [README.zh-CN.md](./README.zh-CN.md)

A stable Capability Plugin for multi-provider image generation and editing. One core is available through four Delivery Interfaces and supports OpenAI Images-compatible and Gemini-compatible Provider protocols.

## Delivery Interfaces

| Interface | Entry | Use it for |
| --- | --- | --- |
| Library | `@sallyn0225/image-gen` | TypeScript/JavaScript applications using exported configuration, service, Provider, and save APIs |
| CLI | `image-gen` | Scripts, CI, and agents with shell access |
| MCP | `image-gen-mcp`, or `image-gen mcp` | MCP Hosts using stdio tools |
| Agent Skill | `skills/image-gen/SKILL.md` | Teaching an agent when and how to invoke the capability |

The npm package ships both binaries, declarations, the canonical Skill, bilingual READMEs, the configuration example, and the MIT license.

## Installation

Node.js 22 or newer is required.

Install the binaries globally:

```bash
npm install --global @sallyn0225/image-gen
image-gen --help
image-gen-mcp
```

Run the CLI or MCP server without a global install:

```bash
npx -y @sallyn0225/image-gen list
npx -y @sallyn0225/image-gen generate --model gpt-image-2 "a red apple"
npx -y @sallyn0225/image-gen mcp
```

Install it as a library dependency:

```bash
npm install @sallyn0225/image-gen
```

## Configuration

Each user supplies their own Provider endpoint and API key. Never commit real keys or `config.local.json`. Start from [`config.example.json`](./config.example.json):

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
      "model": "gpt-image-2",
      "headers": {
        "X-Optional-Header": "value"
      }
    }
  }
}
```

`provider` is `openai-images` or `gemini`. Each model needs `baseUrl` and `apiKey`; `model` defaults to the alias key, and `headers` is optional. Top-level defaults are `outputDir: "./generated-images"` and `timeoutMs: 180000`.

### Configuration-file precedence

The first existing configuration file wins, in this exact order:

1. `IMAGE_GEN_CONFIG`
2. `IMAGE_GEN_MCP_CONFIG` when `IMAGE_GEN_CONFIG` is unset (supported, brand-neutral alias)
3. `./config.local.json`
4. `./config.json`
5. `./packages/image-gen/config.local.json`
6. `./packages/image-gen/config.json`
7. package-local `config.local.json`
8. package-local `config.json`
9. `~/.config/agent-plugins/image-gen.json` (preferred user default)
10. `AGENT_TOOLING_IMAGE_GEN_CONFIG` (v2 compatibility fallback)
11. `~/.config/agent-tooling/image-gen.json` (v2 compatibility fallback)
12. `~/.config/image-gen/config.json` (generic fallback)
13. `~/.config/image-gen-mcp/config.json` (generic fallback)
14. `~/.image-gen.json` (generic fallback)
15. `~/.image-gen-mcp.json` (generic fallback)

The current working directory and installed package directory can coincide, so duplicate paths are harmless. `~` is expanded to the current home directory.

After loading a file, environment values override or add model settings:

- shared: `IMAGE_GEN_BASE_URL`, `IMAGE_GEN_API_KEY`;
- built-in aliases: `IMAGE_GEN_GPT_IMAGE_2_*`, `IMAGE_GEN_GROK_IMAGINE_IMAGE_*`, and `IMAGE_GEN_GEMINI_3_1_FLASH_IMAGE_*`, with `BASE_URL` and `API_KEY` suffixes;
- arbitrary aliases: `IMAGE_GEN_MODEL_<ALIAS>_BASE_URL`, `_API_KEY`, `_PROVIDER`, and `_MODEL` (also `_BASEURL` and `_KEY`). In `<ALIAS>`, `_` becomes `-` and `__` becomes `/`.

`IMAGE_GEN_DEFAULT_MODEL`, `IMAGE_GEN_OUTPUT_DIR`, and `IMAGE_GEN_TIMEOUT_MS` override their top-level file values. Relative output directories resolve from the current working directory.

## CLI

The `image-gen` binary supports `list`, `generate`, `edit`, `mcp`, and the `serve` alias. Running it without a command starts the MCP stdio server for backward compatibility.

```bash
image-gen list
image-gen generate --model gpt-image-2 "a red apple"
image-gen generate --model grok-imagine-image --aspect-ratio 16:9 "sunset city"
image-gen generate --model gemini-3.1-flash-image --image-size 1K "flat icon"
image-gen edit --model gemini-3.1-flash-image --image ./in.png "watercolor style"
image-gen edit --model gpt-image-2 --image ./in.png --mask ./mask.png "fill the masked area"
image-gen generate --no-save "return without writing files"
image-gen mcp
```

Generation options are `--model`, `--n`, `--size`, `--quality`, `--aspect-ratio`, `--image-size`, and `--no-save`. Editing accepts the same options plus repeatable `--image`/`-i` and optional `--mask`.

Successful `list`, `generate`, and `edit` operations write parseable JSON to **stdout**. Generated-operation JSON reports the operation, model, Provider, saved paths, MIME types, and byte counts; editing also reports input paths. Diagnostics, deprecation warnings, and errors go to **stderr**, with a nonzero exit code on failure, so they do not contaminate JSON pipelines. Help text is human-readable rather than JSON.

## MCP

Start the stdio server with either binary:

```bash
image-gen-mcp
# equivalent
image-gen mcp
```

For an MCP Host, an `npx` configuration avoids a global install:

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

A global installation can use `"command": "image-gen-mcp"` instead. Configure environment variables in the Host process; never put logs on MCP stdout.

The stdio server exposes exactly three stable tools:

| Tool | Purpose |
| --- | --- |
| `list_image_models` | Return configured aliases, Provider information, defaults, and masked keys |
| `generate_image` | Generate one or more images from `prompt` and optional model, size, quality, aspect, response, and save settings |
| `edit_image` | Edit one or more path/base64 images with `prompt`, optional mask, and the shared generation settings |

Generation and editing return text and image content plus structured summaries. Tool failures are MCP error results. Server identity and version derive from package metadata.

## Library

The root export provides:

- high-level `listModels`, `runGenerate`, and `runEdit` operations;
- `loadConfig`, `resolveModelConfig`, `maskSecret`, and `LoadConfigOptions`;
- lower-level `generateImage`, `editImage`, and `saveImages`;
- `getPackageVersion` and `getMcpServerMetadata`; and
- all public types from `types.ts`, including configuration, request, result, and image types.

Prefer the high-level service operations for normal integration:

```ts
import { loadConfig, runEdit, runGenerate } from "@sallyn0225/image-gen";

const config = loadConfig();

const generated = await runGenerate({
  config,
  model: "gpt-image-2",
  prompt: "a red apple on white paper",
  save: false,
});

await runEdit({
  config,
  model: "gpt-image-2",
  prompt: "turn the apple green",
  images: [{ base64: generated.imagesBase64[0].data }],
  save: true,
});
```

The package also declares `@sallyn0225/image-gen/cli` and `@sallyn0225/image-gen/mcp` executable subpath exports. They are process entry points, not replacements for the root programmatic API.

## Agent Skill

The one canonical open Agent Skills copy is [`skills/image-gen/SKILL.md`](./skills/image-gen/SKILL.md). It is published in the npm tarball; there is no root mirror or Host-specific duplicate.

After installation, point a compatible agent or Skill loader at `node_modules/@sallyn0225/image-gen/skills/image-gen/SKILL.md`, or copy that canonical directory into the location your Host documents. The Skill teaches workflow and CLI usage; Provider credentials still come from the configuration rules above.

## Compatibility and Verification

The interfaces are protocol-oriented:

- CLI works in environments that can launch Node.js 22 processes and consume stdout/stderr.
- MCP uses the MCP SDK over stdio.
- Agent Skill follows the open Agent Skills `SKILL.md` format.
- Provider adapters speak OpenAI Images-compatible generation/editing HTTP or Gemini-compatible `generateContent` with image content.

Repository automation verifies library behavior, configuration contracts, built CLI behavior, MCP initialization/tools/framing, metadata, and documentation offline. Provider behavior is exercised against a local HTTP adapter without external network access, real credentials, or charges.

Manifest verification scopes are `unit`, `offline-cli`, `offline-mcp`, `docs`, and `metadata`; the live policy is `liveProviders: manual`. These identifiers are catalog metadata, not claims of broader testing.

That verification establishes public-interface and protocol behavior; it does **not** claim continuous testing in Claude Code, Codex, Cursor, or every other Host, nor against every real gateway or Provider. Real-Provider smoke is manual, networked, and potentially billable.

## Migration

Version 2 keeps the package name, `image-gen` and `image-gen-mcp` binaries, CLI commands and flags, JSON output contract, three MCP tool names and input contracts, configuration shape, Provider behavior, and the brand-neutral `IMAGE_GEN_MCP_CONFIG` alias.

New installations should use `IMAGE_GEN_CONFIG` or `~/.config/agent-plugins/image-gen.json`.

For a v2 migration window only, these Agent Tooling-branded sources remain available:

- `AGENT_TOOLING_IMAGE_GEN_CONFIG`;
- `~/.config/agent-tooling/image-gen.json`.

When one is actually selected, image-gen emits one non-sensitive deprecation warning on stderr. The warning never includes credentials, never enters CLI JSON stdout, and does not alter MCP framing. These two legacy fallbacks are removed in v3; migrate before upgrading. The generic fallback paths listed under Configuration are separate, non-branded compatibility locations and do not emit that warning.

## Troubleshooting

- **“No image models configured.”** Create a preferred config file or provide both a base URL and API key through model environment variables. Confirm the process sees the same home directory and environment as your shell.
- **Wrong configuration was loaded.** Check the ordered list above. An existing working-directory or package-local file outranks the user default and every legacy/generic path. Set `IMAGE_GEN_CONFIG` to remove ambiguity.
- **“Unknown model.”** Run `image-gen list`, then use an alias from the `models` object or set `defaultModel`/`IMAGE_GEN_DEFAULT_MODEL`.
- **JSON parsing fails in a script.** Parse stdout only. Do not merge stderr into stdout; warnings and errors intentionally use stderr.
- **MCP Host cannot initialize.** Use an absolute config path, verify Node.js 22+, run the configured command in the same environment, and ensure the Host preserves stdio rather than wrapping output.
- **Requests time out.** Increase `timeoutMs` or `IMAGE_GEN_TIMEOUT_MS`, and verify the Provider endpoint and model name. Timeouts are milliseconds.
- **Images are not saved.** Check `outputDir`, current-working-directory resolution, permissions, and whether `--no-save` or `save: false` was used.
- **Editing fails.** Supply at least one readable image path or base64 image. Masks and some edit behavior are Provider/gateway dependent.
- **A credential appears in output.** Stop sharing the output, rotate the credential, and report the exposure privately under the repository [security policy](../../SECURITY.md).

## Development

From the repository root:

```bash
npm install
npm run build
npm test
npm run smoke:offline
npm run validate:plugins
npm run catalog:check
```

Package-focused commands are also available:

```bash
npm run build -w @sallyn0225/image-gen
npm run typecheck -w @sallyn0225/image-gen
npm run cli -w @sallyn0225/image-gen -- list
npm run dev:mcp -w @sallyn0225/image-gen
```

Normal tests and offline smoke use a local Provider Adapter. `npm run smoke:live` is a separate **manual, networked, potentially billable** real-Provider operation; it requires your credentials and is never a pull-request requirement. See the repository [Testing guide](../../TESTING.md).

## License

[MIT](./LICENSE) © Sallyn0225.
