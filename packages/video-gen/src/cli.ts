#!/usr/bin/env node
import { loadConfig, maskSecret } from "./config.js";
import { downloadTaskVideo, getTaskStatus, listModels, runGenerate } from "./service.js";
import type { AppConfig } from "./types.js";

function printHelp(): void {
  console.log(`video-gen — Volcengine Ark Seedance 2.0 video generation

Usage:
  video-gen generate <prompt> [flags]
  video-gen status <task_id>
  video-gen download <task_id> [flags]
  video-gen models
  video-gen help | --help | -h

Generate flags:
  --model <id>              Official Model ID (pass-through; default from config)
  --first-frame <url>       Public image URL as first frame
  --last-frame <url>        Public image URL as last frame (requires first-frame)
  --ref-image <url>         Reference image URL (repeatable, max 9)
  --ref-video <url>         Reference video URL (repeatable, max 3)
  --ref-audio <url>         Reference audio URL (repeatable, max 3)
  --ratio <r>               Output ratio (default: adaptive)
  --duration <n>            Seconds, or -1 for smart length (default: 5)
  --resolution <r>          e.g. 720p (default: 720p)
  --no-audio                Disable generate_audio
  --watermark               Enable platform watermark
  --return-last-frame       Request last-frame URL for stitching
  --priority <0-9>          Queue priority when supported
  --wait / --no-wait        Wait for completion (default: wait)
  --poll-interval <ms>      Poll interval while waiting (default: 15000)
  --timeout <ms>            Wait timeout (default: 600000)
  --no-save                 Skip download; return videoUrl only

Download flags:
  --no-save                 Return videoUrl without writing a file

Config (first match wins):
  $VIDEO_GEN_CONFIG
  package-local config.local.json
  ~/.config/agent-plugins/video-gen.json

Env key overrides: VIDEO_GEN_API_KEY (preferred) or ARK_API_KEY
See config.example.json
`);
}

interface ParsedArgs {
  command: string;
  prompt?: string;
  taskId?: string;
  model?: string;
  firstFrame?: string;
  lastFrame?: string;
  refImages: string[];
  refVideos: string[];
  refAudios: string[];
  ratio?: string;
  duration?: number;
  resolution?: string;
  generateAudio: boolean;
  watermark: boolean;
  returnLastFrame: boolean;
  priority?: number;
  wait: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
  save: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    return emptyParsed("help");
  }

  const known = new Set(["generate", "status", "download", "models", "help", "--help", "-h"]);
  const first = argv[0];
  const command = known.has(first)
    ? first === "--help" || first === "-h"
      ? "help"
      : first
    : "help";
  const args = known.has(first) ? argv.slice(1) : argv;

  let model: string | undefined;
  let firstFrame: string | undefined;
  let lastFrame: string | undefined;
  const refImages: string[] = [];
  const refVideos: string[] = [];
  const refAudios: string[] = [];
  let ratio: string | undefined;
  let duration: number | undefined;
  let resolution: string | undefined;
  let generateAudio = true;
  let watermark = false;
  let returnLastFrame = false;
  let priority: number | undefined;
  let wait = true;
  let pollIntervalMs: number | undefined;
  let timeoutMs: number | undefined;
  let save = true;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--model") model = args[++i];
    else if (a === "--first-frame") firstFrame = args[++i];
    else if (a === "--last-frame") lastFrame = args[++i];
    else if (a === "--ref-image") refImages.push(args[++i]);
    else if (a === "--ref-video") refVideos.push(args[++i]);
    else if (a === "--ref-audio") refAudios.push(args[++i]);
    else if (a === "--ratio") ratio = args[++i];
    else if (a === "--duration") duration = Number(args[++i]);
    else if (a === "--resolution") resolution = args[++i];
    else if (a === "--no-audio") generateAudio = false;
    else if (a === "--watermark") watermark = true;
    else if (a === "--return-last-frame") returnLastFrame = true;
    else if (a === "--priority") priority = Number(args[++i]);
    else if (a === "--wait") wait = true;
    else if (a === "--no-wait") wait = false;
    else if (a === "--poll-interval") pollIntervalMs = Number(args[++i]);
    else if (a === "--timeout") timeoutMs = Number(args[++i]);
    else if (a === "--no-save") save = false;
    else if (a === "--help" || a === "-h") {
      return emptyParsed("help");
    } else if (a.startsWith("-")) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      positional.push(a);
    }
  }

  if (priority !== undefined && (!Number.isInteger(priority) || priority < 0 || priority > 9)) {
    throw new Error("--priority must be an integer 0-9");
  }
  if (duration !== undefined && !Number.isFinite(duration)) {
    throw new Error("--duration must be a number (seconds, or -1)");
  }
  if (pollIntervalMs !== undefined && (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0)) {
    throw new Error("--poll-interval must be a positive number of milliseconds");
  }
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new Error("--timeout must be a positive number of milliseconds");
  }

  return {
    command,
    prompt: command === "generate" ? positional.join(" ").trim() || undefined : undefined,
    taskId: command === "status" || command === "download" ? positional[0]?.trim() : undefined,
    model,
    firstFrame,
    lastFrame,
    refImages,
    refVideos,
    refAudios,
    ratio,
    duration,
    resolution,
    generateAudio,
    watermark,
    returnLastFrame,
    priority,
    wait,
    pollIntervalMs,
    timeoutMs,
    save,
  };
}

function emptyParsed(command: string): ParsedArgs {
  return {
    command,
    refImages: [],
    refVideos: [],
    refAudios: [],
    generateAudio: true,
    watermark: false,
    returnLastFrame: false,
    wait: true,
    save: true,
  };
}

function emitJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

function fail(payload: Record<string, unknown>, exitCode = 1): void {
  emitJson({ ok: false, ...payload });
  process.exitCode = exitCode;
}

async function runCli(): Promise<void> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail({
      error: {
        code: "invalid_args",
        message: error instanceof Error ? error.message : String(error),
      },
    });
    return;
  }

  if (parsed.command === "help") {
    printHelp();
    return;
  }

  if (parsed.command === "models") {
    // models is static; credentials optional
    let config: AppConfig | undefined;
    try {
      config = loadConfig({ allowMissingCredentials: true });
    } catch {
      config = undefined;
    }
    const listed = listModels(config);
    emitJson({
      ok: true,
      defaultModel: listed.defaultModel,
      models: listed.models,
      ...(listed.baseUrl ? { baseUrl: listed.baseUrl } : {}),
      // Never print apiKey
      note: "Pass any official Model ID with --model; catalog is recommended Seedance 2.0 IDs only.",
    });
    return;
  }

  if (parsed.command === "generate") {
    if (
      !parsed.prompt &&
      !parsed.firstFrame &&
      parsed.refImages.length === 0 &&
      parsed.refVideos.length === 0
    ) {
      printHelp();
      process.exitCode = 1;
      return;
    }

    let config: AppConfig;
    try {
      config = loadConfig();
    } catch (error) {
      fail({
        error: {
          code: "config",
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }

    // Secrets must never appear in stdout/stderr diagnostics that re-print config.
    void maskSecret(config.apiKey);

    const result = await runGenerate({
      prompt: parsed.prompt ?? "",
      model: parsed.model,
      firstFrame: parsed.firstFrame,
      lastFrame: parsed.lastFrame,
      refImages: parsed.refImages,
      refVideos: parsed.refVideos,
      refAudios: parsed.refAudios,
      ratio: parsed.ratio,
      duration: parsed.duration,
      resolution: parsed.resolution,
      generateAudio: parsed.generateAudio,
      watermark: parsed.watermark,
      returnLastFrame: parsed.returnLastFrame,
      priority: parsed.priority,
      wait: parsed.wait,
      pollIntervalMs: parsed.pollIntervalMs,
      timeoutMs: parsed.timeoutMs,
      save: parsed.save,
      config,
    });

    emitJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (parsed.command === "status") {
    if (!parsed.taskId) {
      fail({
        error: { code: "invalid_args", message: "usage: video-gen status <task_id>" },
      });
      return;
    }
    let config: AppConfig;
    try {
      config = loadConfig();
    } catch (error) {
      fail({
        error: {
          code: "config",
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }
    const result = await getTaskStatus(parsed.taskId, { config });
    emitJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (parsed.command === "download") {
    if (!parsed.taskId) {
      fail({
        error: { code: "invalid_args", message: "usage: video-gen download <task_id>" },
      });
      return;
    }
    let config: AppConfig;
    try {
      config = loadConfig();
    } catch (error) {
      fail({
        error: {
          code: "config",
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }
    const result = await downloadTaskVideo(parsed.taskId, {
      config,
      save: parsed.save,
    });
    emitJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  printHelp();
  process.exitCode = 1;
}

runCli().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  // Avoid leaking secrets if an error message ever embeds them.
  const safe = message.replace(/(Bearer\s+)[^\s]+/gi, "$1***");
  try {
    emitJson({
      ok: false,
      error: { code: "runtime", message: safe },
    });
  } catch {
    console.error(safe);
  }
  process.exitCode = 1;
});
