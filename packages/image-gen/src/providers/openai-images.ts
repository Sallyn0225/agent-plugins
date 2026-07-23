import { createTimeoutSignal, joinOpenAIUrl, parseJsonResponse } from "../http.js";
import { fetchAsBase64, guessMimeFromBase64, resolveImageInput } from "../image-io.js";
import type {
  EditImageRequest,
  GenerateImageRequest,
  GenerateImageResult,
  GeneratedImage,
  ModelConfig,
} from "../types.js";

async function parseImagesPayload(json: unknown, signal?: AbortSignal): Promise<GeneratedImage[]> {
  const data = (json as { data?: Array<Record<string, unknown>> }).data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`OpenAI images API returned no data: ${JSON.stringify(json).slice(0, 500)}`);
  }

  const images: GeneratedImage[] = [];
  for (const item of data) {
    const revisedPrompt =
      typeof item.revised_prompt === "string" && item.revised_prompt
        ? item.revised_prompt
        : undefined;
    const url = typeof item.url === "string" ? item.url : undefined;
    const b64 =
      typeof item.b64_json === "string"
        ? item.b64_json
        : typeof item.b64 === "string"
          ? item.b64
          : undefined;
    const mimeFromItem =
      typeof item.mime_type === "string"
        ? item.mime_type
        : typeof item.mimeType === "string"
          ? item.mimeType
          : undefined;

    if (b64) {
      images.push({
        base64: b64,
        mimeType: mimeFromItem ?? guessMimeFromBase64(b64),
        revisedPrompt,
        url,
      });
      continue;
    }

    if (url) {
      const downloaded = await fetchAsBase64(url, signal);
      images.push({
        base64: downloaded.base64,
        mimeType: mimeFromItem ?? downloaded.mimeType,
        revisedPrompt,
        url,
      });
      continue;
    }

    throw new Error("OpenAI images API item missing both b64_json and url");
  }

  return images;
}

export async function generateWithOpenAIImages(
  modelConfig: ModelConfig,
  request: GenerateImageRequest,
  timeoutMs: number,
): Promise<GenerateImageResult> {
  const endpoint = joinOpenAIUrl(modelConfig.baseUrl, "/v1/images/generations");
  const model = modelConfig.model ?? request.model;

  const body: Record<string, unknown> = {
    model,
    prompt: request.prompt,
    n: request.n ?? 1,
    response_format: request.responseFormat ?? "b64_json",
  };

  if (request.size) body.size = request.size;
  if (request.quality) body.quality = request.quality;
  if (request.aspectRatio) body.aspect_ratio = request.aspectRatio;

  const { signal, cleanup } = createTimeoutSignal(timeoutMs, request.signal);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${modelConfig.apiKey}`,
        "Content-Type": "application/json",
        ...(modelConfig.headers ?? {}),
      },
      body: JSON.stringify(body),
      signal,
    });

    const json = await parseJsonResponse(response, "OpenAI images generations");
    const images = await parseImagesPayload(json, signal);

    return {
      model,
      provider: "openai-images",
      images,
      operation: "generate",
    };
  } finally {
    cleanup();
  }
}

async function buildEditJsonBody(
  model: string,
  request: EditImageRequest,
): Promise<Record<string, unknown>> {
  const resolvedImages = [];
  for (const img of request.images) {
    resolvedImages.push(await resolveImageInput(img));
  }

  // Confirmed against OpenAI-compatible reverse proxies:
  // images: [{ image_url: "data:<mime>;base64,<payload>" }]
  const images = resolvedImages.map((img) => ({
    image_url: `data:${img.mimeType};base64,${img.base64}`,
  }));

  const body: Record<string, unknown> = {
    model,
    prompt: request.prompt,
    n: request.n ?? 1,
    response_format: request.responseFormat ?? "b64_json",
    images,
  };

  if (request.size) body.size = request.size;
  if (request.quality) body.quality = request.quality;
  if (request.aspectRatio) body.aspect_ratio = request.aspectRatio;

  if (request.mask) {
    const mask = await resolveImageInput(request.mask);
    body.mask = {
      image_url: `data:${mask.mimeType};base64,${mask.base64}`,
    };
  }

  return body;
}

function shouldRetryEditAsJson(status: number, errorText: string): boolean {
  if (status === 415) return true;
  return /application\/json|only support.*json|multipart|content-type|unsupported media type|图片编辑仅支持/i.test(
    errorText,
  );
}

/**
 * OpenAI-compatible image edits against POST /v1/images/edits.
 * Tries multipart first (official OpenAI), then JSON base64 (many reverse proxies).
 */
export async function editWithOpenAIImages(
  modelConfig: ModelConfig,
  request: EditImageRequest,
  timeoutMs: number,
): Promise<GenerateImageResult> {
  if (!request.images.length) {
    throw new Error("edit_image requires at least one input image");
  }

  const endpoint = joinOpenAIUrl(modelConfig.baseUrl, "/v1/images/edits");
  const model = modelConfig.model ?? request.model;

  const resolvedImages = [];
  for (const img of request.images) {
    resolvedImages.push(await resolveImageInput(img));
  }
  const resolvedMask = request.mask ? await resolveImageInput(request.mask) : undefined;

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", request.prompt);
  form.append("n", String(request.n ?? 1));
  form.append("response_format", request.responseFormat ?? "b64_json");
  if (request.size) form.append("size", request.size);
  if (request.quality) form.append("quality", request.quality);
  if (request.aspectRatio) form.append("aspect_ratio", request.aspectRatio);

  for (let i = 0; i < resolvedImages.length; i += 1) {
    const resolved = resolvedImages[i];
    const bytes = new Uint8Array(resolved.bytes);
    const blob = new Blob([bytes], { type: resolved.mimeType });
    form.append("image[]", blob, resolved.filename);
    if (i === 0) form.append("image", blob, resolved.filename);
  }

  if (resolvedMask) {
    const maskBytes = new Uint8Array(resolvedMask.bytes);
    const maskBlob = new Blob([maskBytes], { type: resolvedMask.mimeType });
    form.append("mask", maskBlob, resolvedMask.filename);
  }

  const { signal, cleanup } = createTimeoutSignal(timeoutMs, request.signal);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${modelConfig.apiKey}`,
        ...(modelConfig.headers ?? {}),
      },
      body: form,
      signal,
    });

    if (!response.ok) {
      const firstErrorText = await response.text();
      if (shouldRetryEditAsJson(response.status, firstErrorText)) {
        const jsonBody = await buildEditJsonBody(model, request);
        const retry = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${modelConfig.apiKey}`,
            "Content-Type": "application/json",
            ...(modelConfig.headers ?? {}),
          },
          body: JSON.stringify(jsonBody),
          signal,
        });

        const json = await parseJsonResponse(retry, "OpenAI images edits");
        const images = await parseImagesPayload(json, signal);
        return {
          model,
          provider: "openai-images",
          images,
          operation: "edit",
        };
      }

      throw new Error(
        `OpenAI images edits error (${response.status}): ${firstErrorText.slice(0, 500)}`,
      );
    }

    const json = await parseJsonResponse(response, "OpenAI images edits");
    const images = await parseImagesPayload(json, signal);

    return {
      model,
      provider: "openai-images",
      images,
      operation: "edit",
    };
  } finally {
    cleanup();
  }
}
