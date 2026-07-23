import { loadConfig } from "./config.js";
import { buildContent, GENERATE_DEFAULTS } from "./content.js";
import { ArkVideoClient } from "./http.js";
import { listCatalogModels } from "./models.js";
import { saveVideo } from "./save.js";
import type {
  AppConfig,
  CreateTaskRequest,
  GenerateOptions,
  GenerateResult,
  TaskResponse,
  TaskStatus,
} from "./types.js";

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "expired"]);

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.has(String(status).toLowerCase());
}

function extractVideoUrl(task: TaskResponse): string | undefined {
  const content = task.content;
  if (!content) return undefined;
  if (typeof content.video_url === "string") return content.video_url;
  // Defensive: some gateways may nest differently.
  const nested = content as Record<string, unknown>;
  if (typeof nested.videoUrl === "string") return nested.videoUrl as string;
  return undefined;
}

function extractLastFrameUrl(task: TaskResponse): string | undefined {
  const content = task.content;
  if (!content) return undefined;
  if (typeof content.last_frame_url === "string") return content.last_frame_url;
  const nested = content as Record<string, unknown>;
  if (typeof nested.lastFrameUrl === "string") return nested.lastFrameUrl as string;
  return undefined;
}

function resolveModel(config: AppConfig, model?: string): string {
  const resolved = model?.trim() || config.defaultModel;
  if (!resolved) {
    throw new Error("No model specified and no defaultModel configured");
  }
  return resolved;
}

function buildCreateBody(options: GenerateOptions, model: string): CreateTaskRequest {
  const content = buildContent(options);
  const body: CreateTaskRequest = {
    model,
    content,
    ratio: options.ratio ?? GENERATE_DEFAULTS.ratio,
    duration: options.duration ?? GENERATE_DEFAULTS.duration,
    resolution: options.resolution ?? GENERATE_DEFAULTS.resolution,
    generate_audio: options.generateAudio ?? GENERATE_DEFAULTS.generateAudio,
    watermark: options.watermark ?? GENERATE_DEFAULTS.watermark,
  };
  if (options.returnLastFrame) {
    body.return_last_frame = true;
  }
  if (options.priority !== undefined) {
    body.priority = options.priority;
  }
  return body;
}

function taskToResult(
  task: TaskResponse,
  model: string,
  extras: Partial<GenerateResult> = {},
): GenerateResult {
  const status = task.status;
  const lower = String(status).toLowerCase();
  const failed = lower === "failed" || lower === "expired";
  return {
    ok: !failed && extras.ok !== false,
    taskId: task.id,
    status,
    model: task.model ?? model,
    videoUrl: extractVideoUrl(task),
    lastFrameUrl: extractLastFrameUrl(task),
    ratio: typeof task.ratio === "string" ? task.ratio : undefined,
    duration: typeof task.duration === "number" ? task.duration : undefined,
    resolution: typeof task.resolution === "string" ? task.resolution : undefined,
    usage: task.usage,
    ...(failed
      ? {
          ok: false,
          error: {
            code: task.error?.code ?? lower,
            message: task.error?.message ?? `Task ${task.id} ended with status ${status}`,
          },
        }
      : {}),
    ...extras,
  };
}

export function listModels(config?: AppConfig) {
  const catalog = listCatalogModels();
  const defaultModel = config?.defaultModel ?? catalog.defaultModel;
  return {
    defaultModel,
    models: catalog.models,
    baseUrl: config?.baseUrl,
  };
}

export async function getTaskStatus(
  taskId: string,
  options: { config?: AppConfig } = {},
): Promise<GenerateResult> {
  const config = options.config ?? loadConfig();
  const client = new ArkVideoClient({ baseUrl: config.baseUrl, apiKey: config.apiKey });
  const task = await client.getTask(taskId);
  return taskToResult(task, task.model ?? config.defaultModel ?? "");
}

export async function downloadTaskVideo(
  taskId: string,
  options: { config?: AppConfig; save?: boolean; prompt?: string } = {},
): Promise<GenerateResult> {
  const config = options.config ?? loadConfig();
  const client = new ArkVideoClient({ baseUrl: config.baseUrl, apiKey: config.apiKey });
  const task = await client.getTask(taskId);
  const model = task.model ?? config.defaultModel ?? "video";
  const result = taskToResult(task, model);

  if (!result.ok) return result;

  const videoUrl = result.videoUrl;
  if (!videoUrl) {
    return {
      ...result,
      ok: false,
      error: {
        code: "missing_video_url",
        message: `Task ${taskId} has no video_url yet (status=${task.status})`,
      },
    };
  }

  if (options.save === false) {
    return result;
  }

  const bytes = await client.downloadBinary(videoUrl);
  const path = await saveVideo(config.outputDir, model, options.prompt ?? taskId, bytes, taskId);
  return { ...result, path };
}

export async function runGenerate(options: GenerateOptions): Promise<GenerateResult> {
  const config = options.config ?? loadConfig();
  const model = resolveModel(config, options.model);
  const wait = options.wait !== false;
  const save = options.save !== false;
  const pollIntervalMs = options.pollIntervalMs ?? config.pollIntervalMs;
  const timeoutMs = options.timeoutMs ?? config.timeoutMs;
  const onProgress = options.onProgress ?? ((msg: string) => console.error(msg));

  const client = new ArkVideoClient({ baseUrl: config.baseUrl, apiKey: config.apiKey });
  const body = buildCreateBody(options, model);

  const created = await client.createTask(body);
  const taskId = created.id;

  if (!wait) {
    return {
      ok: true,
      taskId,
      status: "queued",
      model,
    };
  }

  const deadline = Date.now() + timeoutMs;
  let lastTask: TaskResponse | undefined;

  while (Date.now() < deadline) {
    lastTask = await client.getTask(taskId);
    const status = lastTask.status;
    onProgress(`video-gen: task ${taskId} status=${status}`);

    if (isTerminal(status)) {
      const result = taskToResult(lastTask, model);
      if (!result.ok) return result;

      if (!save) {
        return result;
      }

      const videoUrl = result.videoUrl;
      if (!videoUrl) {
        return {
          ...result,
          ok: false,
          error: {
            code: "missing_video_url",
            message: `Task ${taskId} succeeded but content.video_url is missing`,
          },
        };
      }

      onProgress(`video-gen: downloading ${videoUrl}`);
      const bytes = await client.downloadBinary(videoUrl);
      const path = await saveVideo(config.outputDir, model, options.prompt, bytes, taskId);
      return { ...result, path };
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(pollIntervalMs, remaining));
  }

  return {
    ok: false,
    taskId,
    status: lastTask?.status ?? "running",
    model,
    videoUrl: lastTask ? extractVideoUrl(lastTask) : undefined,
    error: {
      code: "wait_timeout",
      message: `Timed out after ${timeoutMs}ms waiting for task ${taskId} (last status=${lastTask?.status ?? "unknown"}). Resume with: video-gen status ${taskId}`,
    },
  };
}
