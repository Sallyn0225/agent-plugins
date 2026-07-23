export function joinOpenAIUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  // Accept both https://host and https://host/v1
  if (base.endsWith("/v1") && path.startsWith("/v1/")) {
    return `${base}${path.slice(3)}`;
  }
  if (!base.endsWith("/v1") && path.startsWith("/v1/")) {
    return `${base}${path}`;
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function joinGeminiGenerateUrl(baseUrl: string, model: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/v1beta") || base.endsWith("/v1")) {
    return `${base}/models/${encodeURIComponent(model)}:generateContent`;
  }
  return `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
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
    const errObj = json as { error?: { message?: string }; message?: string };
    const message = errObj?.error?.message ?? errObj?.message ?? text.slice(0, 500);
    throw new Error(`${label} error (${response.status}): ${message}`);
  }

  return json;
}
