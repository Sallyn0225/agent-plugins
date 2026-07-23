import type { CreateTaskRequest, TaskResponse } from "./types.js";

export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function createTimeoutSignal(
  timeoutMs: number,
  outer?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (outer) outer.removeEventListener("abort", onAbort);
    },
  };
}

export async function parseJsonResponse(response: Response, label: string): Promise<unknown> {
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} returned non-JSON (${response.status}): ${text.slice(0, 500)}`);
  }

  if (!response.ok) {
    const errObj = json as { error?: { message?: string; code?: string }; message?: string };
    const message = errObj?.error?.message ?? errObj?.message ?? text.slice(0, 500);
    throw new Error(`${label} error (${response.status}): ${message}`);
  }

  return json;
}

export interface ArkClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Per-request HTTP timeout (not wait-for-completion). Default 60s. */
  httpTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class ArkVideoClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly httpTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ArkClientOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.httpTimeoutMs = options.httpTimeoutMs ?? 60_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async createTask(body: CreateTaskRequest, signal?: AbortSignal): Promise<{ id: string }> {
    const url = joinUrl(this.baseUrl, "/contents/generations/tasks");
    const { signal: timeoutSignal, cleanup } = createTimeoutSignal(this.httpTimeoutMs, signal);
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify(body),
        signal: timeoutSignal,
      });
      const json = (await parseJsonResponse(response, "Create video task")) as {
        id?: string;
      };
      if (!json.id || typeof json.id !== "string") {
        throw new Error("Create video task response missing id");
      }
      return { id: json.id };
    } finally {
      cleanup();
    }
  }

  async getTask(taskId: string, signal?: AbortSignal): Promise<TaskResponse> {
    const url = joinUrl(this.baseUrl, `/contents/generations/tasks/${encodeURIComponent(taskId)}`);
    const { signal: timeoutSignal, cleanup } = createTimeoutSignal(this.httpTimeoutMs, signal);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: timeoutSignal,
      });
      const json = (await parseJsonResponse(response, "Get video task")) as TaskResponse;
      if (!json.id) {
        // Some APIs omit id on get; normalize from request.
        return { ...json, id: taskId, status: json.status ?? "unknown" };
      }
      return json;
    } finally {
      cleanup();
    }
  }

  async downloadBinary(url: string, signal?: AbortSignal): Promise<Buffer> {
    const { signal: timeoutSignal, cleanup } = createTimeoutSignal(this.httpTimeoutMs, signal);
    try {
      const response = await this.fetchImpl(url, { method: "GET", signal: timeoutSignal });
      if (!response.ok) {
        throw new Error(`Download video failed (${response.status}): ${url}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } finally {
      cleanup();
    }
  }
}
