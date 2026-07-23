---
name: video-gen
description: Generate short videos via the local video-gen CLI (Volcengine Ark Seedance 2.0 text-to-video, image-to-video, multimodal refs). Use whenever the user asks to create, generate, or produce a video/clip/shot — even if they do not mention Seedance or Ark. Prefer this skill over inventing video URLs or writing raw polling HTTP.
---

# Video Generation (Seedance 2.0)

Use the **`video-gen` CLI** from the `@sallyn0225/video-gen` Capability Plugin. Prefer the CLI over free-form HTTP.

## Locate the CLI

Prefer, in order:

1. Global / PATH after install:

   ```bash
   video-gen <command>
   # or
   npx -y @sallyn0225/video-gen <command>
   ```

2. Package-local build inside this monorepo:

   ```bash
   node packages/video-gen/dist/cli.js <command>
   npm run video-gen -- <command>
   ```

If monorepo `dist/` is missing, build first:

```bash
npm run build -w @sallyn0225/video-gen
```

## Prerequisites

Config with `baseUrl` + `apiKey` (or env key). Discovery order:

1. `$VIDEO_GEN_CONFIG`
2. package-local `config.local.json`
3. `~/.config/agent-plugins/video-gen.json`

Env key overrides: `VIDEO_GEN_API_KEY` (preferred) or `ARK_API_KEY`.

Default base URL: `https://ark.cn-beijing.volces.com/api/v3`.

List recommended models:

```bash
video-gen models
```

## Generate (default: wait + download)

```bash
video-gen generate "a red fox walking through snow at dawn"
```

Stdout is **JSON** with at least `ok`, `taskId`, `status`, `model`, `videoUrl`, and `path` (local MP4 when saved). Progress lines go to **stderr**. Never invent a completed video URL — only report paths/URLs from CLI output.

### Useful flags

- `--model <id>` — pass-through official Model ID (default from config / Seedance 2.0)
- `--first-frame <https-url>` / `--last-frame <https-url>` — image-to-video
- `--ref-image` / `--ref-video` / `--ref-audio` — repeatable public URLs (max 9 / 3 / 3)
- `--ratio` / `--duration` / `--resolution` — output specs (`duration=-1` for smart length)
- `--no-audio` / `--watermark` / `--return-last-frame` / `--priority <0-9>`
- `--no-wait` — submit only; returns `taskId`
- `--poll-interval` / `--timeout` — wait tuning (defaults 15000 ms / 600000 ms)
- `--no-save` — return `videoUrl` only (URLs expire ~24h)

### Model choice

- Quality → `doubao-seedance-2-0-260128` (up to 1080p/4k)
- Speed/cost → `doubao-seedance-2-0-fast-260128` (up to 720p)
- Cheapest → `doubao-seedance-2-0-mini-260615` (up to 720p)

Non-2.0 IDs still pass through with `--model`.

## Resume long jobs

Default wait can take minutes. On timeout, stdout still includes `taskId` and last `status`:

```bash
video-gen status <task_id>
video-gen download <task_id>
```

## Media rules

- **Public HTTPS URLs only** for frames and refs (no local path → base64 in v1).
- Invalid combos (pure audio, text+audio only) fail client-side with a clear error.
- Never print full API keys.

## Agent workflow

1. Confirm the user wants a generated video clip.
2. Ensure config/credentials exist (or ask for `VIDEO_GEN_API_KEY` / config path).
3. Run `video-gen generate …` with explicit flags; prefer default wait+save.
4. Report real `path` / `taskId` / JSON fields from stdout.
5. On timeout or failure, use `status` / `download` — do not fabricate success.
