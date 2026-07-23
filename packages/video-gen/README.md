# @sallyn0225/video-gen

> 中文: [README.zh-CN.md](./README.zh-CN.md)

An experimental Capability Plugin for Volcengine Ark **Seedance 2.0** video generation. One core is available through Library, CLI, and Agent Skill interfaces. v1 talks to a single Ark async Video Generation API (`POST`/`GET /contents/generations/tasks`) — no MCP server.

## Delivery Interfaces

| Interface | Entry | Use it for |
| --- | --- | --- |
| Library | `@sallyn0225/video-gen` | TypeScript/JavaScript applications using config, service, and Ark client exports |
| CLI | `video-gen` | Scripts, CI, and agents with shell access |
| MCP | — | **Not provided in v1** |
| Agent Skill | `skills/video-gen/SKILL.md` | Teaching an agent when and how to invoke the capability |

The npm package ships the CLI binary, declarations, the canonical Skill, bilingual READMEs, `config.example.json`, and the MIT license.

## Installation

Node.js 22 or newer is required. An activated Volcengine Ark account with Seedance video access (balance or resource pack) is required for live calls.

Install the binary globally:

```bash
npm install --global @sallyn0225/video-gen
video-gen --help
```

Run without a global install:

```bash
npx -y @sallyn0225/video-gen models
npx -y @sallyn0225/video-gen generate "a red fox in snow"
```

Install as a library dependency:

```bash
npm install @sallyn0225/video-gen
```

## Configuration

Each user supplies their own Ark endpoint and API key. Never commit real keys or `config.local.json`. Start from [`config.example.json`](./config.example.json):

```json
{
  "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
  "apiKey": "your-ark-api-key",
  "defaultModel": "doubao-seedance-2-0-260128",
  "outputDir": "./generated-videos",
  "timeoutMs": 600000,
  "pollIntervalMs": 15000
}
```

Defaults match the official API: `baseUrl` `https://ark.cn-beijing.volces.com/api/v3`, wait timeout **600000** ms, poll interval **15000** ms, `outputDir` `./generated-videos`.

### Configuration-file precedence

The first existing configuration file wins, in this exact order:

1. `VIDEO_GEN_CONFIG`
2. package-local `config.local.json` (development)
3. `~/.config/agent-plugins/video-gen.json`

`~` is expanded to the current home directory. Relative `outputDir` resolves from the current working directory.

### Environment overrides

- `VIDEO_GEN_API_KEY` (preferred) or `ARK_API_KEY` override the file `apiKey`
- `VIDEO_GEN_BASE_URL`, `VIDEO_GEN_DEFAULT_MODEL`, `VIDEO_GEN_OUTPUT_DIR`, `VIDEO_GEN_TIMEOUT_MS`, `VIDEO_GEN_POLL_INTERVAL_MS`

Auth header: `Authorization: Bearer <apiKey>`. Full API keys are never printed in stdout, stderr, or `models` output.

## CLI

```bash
video-gen models
video-gen generate "a red fox walking through snow"
video-gen generate --model doubao-seedance-2-0-fast-260128 --no-audio "silent city timelapse"
video-gen generate --first-frame https://cdn.example/frame.png "camera pushes in"
video-gen generate --no-wait "long job"
video-gen status <task_id>
video-gen download <task_id>
```

Commands: `generate`, `status`, `download`, `models`.

`generate` flags: `--model`, `--first-frame`, `--last-frame`, repeatable `--ref-image` / `--ref-video` / `--ref-audio`, `--ratio`, `--duration`, `--resolution`, `--no-audio`, `--watermark`, `--return-last-frame`, `--priority`, `--wait` / `--no-wait`, `--poll-interval`, `--timeout`, `--no-save`.

When flags are omitted, create-body defaults match the official API: `generate_audio=true`, `watermark=false`, `ratio=adaptive`, `duration=5`, `resolution=720p`.

Media inputs are **public HTTP(S) URLs only** (no local path → base64). Client-side limits: up to 9 ref images, 3 ref videos, 3 ref audios; pure audio and text+audio-only are rejected before the network call.

Successful operations write a single parseable JSON object to **stdout**. Progress (polling) goes to **stderr**. Failures exit non-zero with `{ "ok": false, "error": … }` and retain `taskId` on wait timeout so you can resume with `status` / `download`. Result URLs are short-lived (~24h); task IDs are retained longer (~7 days) — default download is intentional.

Recommended Seedance 2.0 Model IDs from `video-gen models`:

| Model ID | Max resolution |
| --- | --- |
| `doubao-seedance-2-0-260128` | 1080p/4k |
| `doubao-seedance-2-0-fast-260128` | 720p |
| `doubao-seedance-2-0-mini-260615` | 720p |

`--model` is pass-through for any official ID (including non-2.0). v1 does not expose 1.x-only fields such as `draft`, `seed`, `frames`, or `camera_fixed`.

## MCP

MCP is **not provided** in v1. There is no `video-gen-mcp` binary. Use the CLI or library instead.

## Library

```ts
import { loadConfig, runGenerate, listModels } from "@sallyn0225/video-gen";

const config = loadConfig();
const models = listModels(config);
const result = await runGenerate({
  prompt: "a red fox in snow",
  config,
});
// result.path → local MP4 when wait+save succeed
```

Public exports include `loadConfig`, `runGenerate`, `getTaskStatus`, `downloadTaskVideo`, `listModels`, `ArkVideoClient`, and related types. Prefer high-level service functions over calling HTTP helpers directly.

## Agent Skill

The canonical open Agent Skills file is [`skills/video-gen/SKILL.md`](./skills/video-gen/SKILL.md) and ships in the npm tarball. It teaches hosts to prefer the CLI, use URL-only media, wait-or-resume, and never invent video URLs or print API keys.

## Compatibility and Verification

- **Upstream protocol:** Volcengine Ark async video tasks (`/contents/generations/tasks`), Bearer auth, strong-validation body fields.
- Manifest verification scopes are `unit`, `offline-cli`, `docs`, `metadata`, and `package-contents`; the live policy is `liveProviders: manual`. These identifiers are catalog metadata, not claims of broader testing.
- **Automated:** unit (config/content), offline CLI black-box against a local Ark-shaped HTTP adapter, metadata, docs, package-contents.
- **Live Provider smoke:** manual only (networked, credentialed, potentially billable). Not a required PR check.
- Protocol compatibility does not prove continuous testing with a real Host or live Volcengine account.

## Migration

This is the initial public release of `@sallyn0225/video-gen`. No migration is required.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `No API key configured` | Set `VIDEO_GEN_API_KEY` / `ARK_API_KEY` or `apiKey` in a discovered config file |
| Wait timeout JSON with `taskId` | Resume via `video-gen status` / `video-gen download` |
| Upstream `failed` | Read `error.message` in stdout JSON; adjust prompt/media/policy |
| Empty or expired `videoUrl` | Download promptly (~24h URL lifetime); re-query `status` |
| Text+audio / pure audio rejected | Add image/video refs or drop `--ref-audio` |
| Account / balance errors from Ark | Activate Seedance resources in the Volcengine console |

Never paste full API keys into issues or logs.

## Development

From the repository root:

```bash
npm install
npm run build -w @sallyn0225/video-gen
npm test
npm run smoke:offline -w @sallyn0225/video-gen
npm run validate:plugins
npm run docs:check
npm run catalog:generate
```

Offline tests use a local HTTP adapter — no real Ark credentials. See [Creating a Capability Plugin](../../docs/creating-a-capability-plugin.md) and [Testing](../../TESTING.md).

## License

[MIT](./LICENSE) © Sallyn0225.
