---
name: image-gen
description: Generate or edit images via the local image-gen CLI (gpt-image-2, grok-imagine-image, gemini-3.1-flash-image). Use whenever the user asks to create, draw, generate, redesign, restyle, inpaint, or edit an image/illustration/icon/mockup — even if they don't mention MCP. Prefer this skill over inventing image URLs or fake placeholders.
---

# Image Generation & Editing

Use the **`image-gen` CLI** from the `@sallyn0225/image-gen` Capability Plugin. Prefer CLI over free-form HTTP calls.

## Locate the CLI

Prefer, in order:

1. Global / PATH after install:

   ```bash
   image-gen <command>
   # or
   npx -y @sallyn0225/image-gen <command>
   ```

2. Package-local build inside this monorepo:

   ```bash
   node packages/image-gen/dist/cli.js <command>
   npm run image-gen -- <command>
   ```

If monorepo `dist/` is missing, build first:

```bash
npm run build -w @sallyn0225/image-gen
```

## Prerequisites

A config file with model `baseUrl` + `apiKey` must exist. Preferred search order:

- `$IMAGE_GEN_CONFIG` (preferred)
- `$IMAGE_GEN_MCP_CONFIG` (supported brand-neutral alias)
- package-local `config.local.json` (development only)
- `~/.config/agent-plugins/image-gen.json` (preferred default)

v2 fallbacks (emit one stderr deprecation warning when used; removed in v3):

- `$AGENT_TOOLING_IMAGE_GEN_CONFIG`
- `~/.config/agent-tooling/image-gen.json`

Example models:

- `gpt-image-2` — OpenAI Images API
- `grok-imagine-image` — OpenAI-compatible Images API
- `gemini-3.1-flash-image` — Gemini multimodal image model

List configured models:

```bash
image-gen list
```

## Generate

```bash
image-gen generate --model gpt-image-2 "a minimal app icon of an orange fox"
```

Useful flags:

- `--model <alias>`
- `--size 1024x1024`
- `--quality low|medium|high|auto`
- `--aspect-ratio 1:1|16:9|9:16`
- `--image-size 1K|2K|4K` (Gemini)
- `--no-save`

Output JSON includes `paths` to saved files under `generated-images/` (or configured `outputDir`).

## Edit

Always pass at least one local image path:

```bash
image-gen edit \
  --model gemini-3.1-flash-image \
  --image ./input.png \
  "make it watercolor, keep composition"
```

Multiple references:

```bash
image-gen edit \
  --model gpt-image-2 \
  --image ./product.png \
  --image ./style-ref.png \
  "place the product in the style of the second image"
```

Optional mask (inpainting, best-effort):

```bash
image-gen edit \
  --model gpt-image-2 \
  --image ./photo.png \
  --mask ./mask.png \
  "replace masked area with a ceramic vase"
```

## Model choice guidance

| Goal | Prefer |
| --- | --- |
| General high-quality generation | `gpt-image-2` |
| Fast / alternate aesthetic | `grok-imagine-image` |
| Instruction-following edits / multimodal refs | `gemini-3.1-flash-image` |
| OpenAI-style mask edits | `gpt-image-2` (edits endpoint) |

If an edit fails on `grok-imagine-image`, retry with `gemini-3.1-flash-image` or `gpt-image-2` — some Grok gateways only support generation, not edits.

If unsure, call `list` and use `defaultModel`.

## Agent workflow

1. Confirm intent: generate vs edit.
2. For edit, ensure source image path exists on disk.
3. Run CLI with an explicit `--model` when the user names one.
4. Report the returned file path(s) to the user.
5. Do **not** invent image URLs or claim success without CLI output.

## MCP alternative

If the host has the MCP server configured, tools are:

- `list_image_models`
- `generate_image`
- `edit_image`

CLI + this skill remain the fallback when MCP is unavailable.

## Skill location

Canonical copy: package-relative `skills/image-gen/SKILL.md` inside `@sallyn0225/image-gen`.
Hosts that load Agent Skills from installed npm packages should use that path.

## Safety / hygiene

- Do not print full API keys.
- Do not commit `config.local.json`.
- Prefer writing outputs into the project `generated-images/` directory.
