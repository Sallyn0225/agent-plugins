import { createTimeoutSignal, joinGeminiGenerateUrl, parseJsonResponse } from "../http.js";
import { guessMimeFromBase64, resolveImageInput } from "../image-io.js";
import type {
  EditImageRequest,
  GenerateImageRequest,
  GenerateImageResult,
  GeneratedImage,
  ModelConfig,
} from "../types.js";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}

function buildGenerationConfig(request: {
  aspectRatio?: string;
  imageSize?: string;
  responseModalities?: Array<"TEXT" | "IMAGE">;
}): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    responseModalities: request.responseModalities ?? ["TEXT", "IMAGE"],
  };

  const imageConfig: Record<string, unknown> = {};
  if (request.aspectRatio) imageConfig.aspectRatio = request.aspectRatio;
  if (request.imageSize) imageConfig.imageSize = request.imageSize;
  if (Object.keys(imageConfig).length > 0) {
    generationConfig.imageConfig = imageConfig;
  }

  return generationConfig;
}

function extractGeminiResult(
  json: unknown,
  model: string,
  operation: "generate" | "edit",
): GenerateImageResult {
  const candidates = (json as { candidates?: Array<{ content?: { parts?: GeminiPart[] } }> })
    .candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(`Gemini returned no candidates: ${JSON.stringify(json).slice(0, 500)}`);
  }

  const images: GeneratedImage[] = [];
  const textParts: string[] = [];

  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];
    for (const part of parts) {
      if (typeof part.text === "string" && part.text.trim()) {
        textParts.push(part.text.trim());
      }

      const inline = part.inlineData
        ? {
            data: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
          }
        : part.inline_data
          ? {
              data: part.inline_data.data,
              mimeType: part.inline_data.mime_type,
            }
          : undefined;
      const data = inline?.data;
      if (!data) continue;

      images.push({
        base64: data,
        mimeType: inline.mimeType ?? guessMimeFromBase64(data),
      });
    }
  }

  if (images.length === 0) {
    throw new Error(
      `Gemini response contained no images. Text: ${
        textParts.join("\n").slice(0, 500) || JSON.stringify(json).slice(0, 500)
      }`,
    );
  }

  return {
    model,
    provider: "gemini",
    images,
    rawText: textParts.length > 0 ? textParts.join("\n") : undefined,
    operation,
  };
}

async function postGemini(
  modelConfig: ModelConfig,
  model: string,
  body: unknown,
  timeoutMs: number,
  outer?: AbortSignal,
): Promise<unknown> {
  const endpoint = joinGeminiGenerateUrl(modelConfig.baseUrl, model);
  const { signal, cleanup } = createTimeoutSignal(timeoutMs, outer);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${modelConfig.apiKey}`,
        "x-goog-api-key": modelConfig.apiKey,
        "Content-Type": "application/json",
        ...(modelConfig.headers ?? {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    return parseJsonResponse(response, "Gemini generateContent");
  } finally {
    cleanup();
  }
}

export async function generateWithGemini(
  modelConfig: ModelConfig,
  request: GenerateImageRequest,
  timeoutMs: number,
): Promise<GenerateImageResult> {
  const model = modelConfig.model ?? request.model;
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: request.prompt }],
      },
    ],
    generationConfig: buildGenerationConfig(request),
  };

  const json = await postGemini(modelConfig, model, body, timeoutMs, request.signal);
  return extractGeminiResult(json, model, "generate");
}

/**
 * Gemini image editing is conversational multimodal generateContent:
 * send text prompt + one or more reference images as inlineData parts.
 */
export async function editWithGemini(
  modelConfig: ModelConfig,
  request: EditImageRequest,
  timeoutMs: number,
): Promise<GenerateImageResult> {
  if (!request.images.length) {
    throw new Error("edit_image requires at least one input image");
  }

  const model = modelConfig.model ?? request.model;
  const parts: Array<Record<string, unknown>> = [{ text: request.prompt }];

  for (const image of request.images) {
    const resolved = await resolveImageInput(image);
    parts.push({
      inlineData: {
        mimeType: resolved.mimeType,
        data: resolved.base64,
      },
    });
  }

  // Optional mask as an extra image with a clarifying note
  if (request.mask) {
    parts.push({
      text: "The next image is a mask. Edit only the masked region when possible.",
    });
    const mask = await resolveImageInput(request.mask);
    parts.push({
      inlineData: {
        mimeType: mask.mimeType,
        data: mask.base64,
      },
    });
  }

  const body = {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: buildGenerationConfig(request),
  };

  const json = await postGemini(modelConfig, model, body, timeoutMs, request.signal);
  return extractGeminiResult(json, model, "edit");
}
