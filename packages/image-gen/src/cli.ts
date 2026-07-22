#!/usr/bin/env node
import { resolve } from "node:path";
import { listModels, runEdit, runGenerate } from "./service.js";

function printHelp(): void {
  console.log(`image-gen — multi-provider image generation & editing

Usage:
  image-gen                         # start MCP server (stdio)
  image-gen mcp                     # start MCP server (stdio)
  image-gen list
  image-gen generate [options] <prompt>
  image-gen edit [options] --image <path> [--image <path>...] <prompt>

Generate options:
  --model <alias>         Model alias (default from config)
  --n <number>            Number of images
  --size <WxH>            OpenAI-style size
  --quality <q>           low|medium|high|auto
  --aspect-ratio <r>      1:1|16:9|...
  --image-size <s>        Gemini 1K|2K|4K
  --no-save               Do not write files

Edit options:
  --image <path>          Input image (repeatable)
  --mask <path>           Optional mask image
  (plus generate options)

Config (first match wins):
  IMAGE_GEN_CONFIG (preferred)
  IMAGE_GEN_MCP_CONFIG (supported alias)
  config.local.json / packages/image-gen/config.local.json (development)
  ~/.config/agent-plugins/image-gen.json (preferred default)
  AGENT_TOOLING_IMAGE_GEN_CONFIG / ~/.config/agent-tooling/image-gen.json (v2 fallbacks; removed in v3)
  See config.example.json
`);
}

interface ParsedArgs {
  command: string;
  prompt?: string;
  model?: string;
  n?: number;
  size?: string;
  quality?: string;
  aspectRatio?: string;
  imageSize?: string;
  images: string[];
  mask?: string;
  save: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    return { command: "mcp", images: [], save: true };
  }

  const first = argv[0];
  const known = new Set(["mcp", "serve", "list", "generate", "edit", "help", "--help", "-h"]);
  const command = known.has(first) ? first : "mcp";
  const args = known.has(first) ? argv.slice(1) : argv;

  let model: string | undefined;
  let n: number | undefined;
  let size: string | undefined;
  let quality: string | undefined;
  let aspectRatio: string | undefined;
  let imageSize: string | undefined;
  let mask: string | undefined;
  let save = true;
  const images: string[] = [];
  const promptParts: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--model") model = args[++i];
    else if (a === "--n") n = Number(args[++i]);
    else if (a === "--size") size = args[++i];
    else if (a === "--quality") quality = args[++i];
    else if (a === "--aspect-ratio") aspectRatio = args[++i];
    else if (a === "--image-size") imageSize = args[++i];
    else if (a === "--image" || a === "-i") images.push(resolve(args[++i]));
    else if (a === "--mask") mask = resolve(args[++i]);
    else if (a === "--no-save") save = false;
    else if (a === "--help" || a === "-h") {
      return { command: "help", images: [], save: true };
    } else promptParts.push(a);
  }

  const normalized =
    command === "serve" || command === "mcp"
      ? "mcp"
      : command === "--help" || command === "-h"
        ? "help"
        : command;

  return {
    command: normalized,
    prompt: promptParts.join(" ").trim() || undefined,
    model,
    n,
    size,
    quality,
    aspectRatio,
    imageSize,
    images,
    mask,
    save,
  };
}

async function runCli(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.command === "help") {
    printHelp();
    return;
  }

  if (parsed.command === "mcp") {
    const { startServer } = await import("./mcp.js");
    await startServer();
    return;
  }

  if (parsed.command === "list") {
    console.log(JSON.stringify(listModels(), null, 2));
    return;
  }

  if (parsed.command === "generate") {
    if (!parsed.prompt) {
      printHelp();
      process.exit(1);
    }
    const { summary } = await runGenerate({
      prompt: parsed.prompt,
      model: parsed.model,
      n: parsed.n,
      size: parsed.size,
      quality: parsed.quality,
      aspectRatio: parsed.aspectRatio,
      imageSize: parsed.imageSize,
      save: parsed.save,
    });
    console.log(
      JSON.stringify(
        {
          operation: summary.operation,
          model: summary.model,
          provider: summary.provider,
          paths: summary.savedPaths,
          mimeTypes: summary.images.map((i) => i.mimeType),
          bytes: summary.images.map((i) => i.bytes),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (parsed.command === "edit") {
    if (!parsed.prompt || parsed.images.length === 0) {
      printHelp();
      process.exit(1);
    }
    const { summary } = await runEdit({
      prompt: parsed.prompt,
      model: parsed.model,
      images: parsed.images.map((path) => ({ path })),
      mask: parsed.mask ? { path: parsed.mask } : undefined,
      n: parsed.n,
      size: parsed.size,
      quality: parsed.quality,
      aspectRatio: parsed.aspectRatio,
      imageSize: parsed.imageSize,
      save: parsed.save,
    });
    console.log(
      JSON.stringify(
        {
          operation: summary.operation,
          model: summary.model,
          provider: summary.provider,
          inputImages: summary.inputImages,
          paths: summary.savedPaths,
          mimeTypes: summary.images.map((i) => i.mimeType),
          bytes: summary.images.map((i) => i.bytes),
        },
        null,
        2,
      ),
    );
    return;
  }

  printHelp();
}

runCli().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
