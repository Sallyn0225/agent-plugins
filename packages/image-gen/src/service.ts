import { loadConfig, maskSecret, resolveModelConfig } from "./config.js";
import { editImage, generateImage } from "./providers/index.js";
import { saveImages } from "./save.js";
import type {
  AppConfig,
  EditImageRequest,
  GenerateImageRequest,
  GenerateImageResult,
  ImageInput,
} from "./types.js";

export interface RunGenerateOptions {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  quality?: string;
  aspectRatio?: string;
  imageSize?: string;
  responseFormat?: "b64_json" | "url";
  save?: boolean;
  includeBase64InSummary?: boolean;
  signal?: AbortSignal;
  config?: AppConfig;
}

export interface RunEditOptions {
  prompt: string;
  model?: string;
  images: ImageInput[];
  mask?: ImageInput;
  n?: number;
  size?: string;
  quality?: string;
  aspectRatio?: string;
  imageSize?: string;
  responseFormat?: "b64_json" | "url";
  save?: boolean;
  includeBase64InSummary?: boolean;
  signal?: AbortSignal;
  config?: AppConfig;
}

export interface ImageJobSummary {
  operation: "generate" | "edit";
  model: string;
  upstreamModel: string;
  provider: string;
  prompt: string;
  count: number;
  savedPaths: string[];
  outputDir: string;
  rawText?: string;
  inputImages?: string[];
  images: Array<{
    index: number;
    mimeType: string;
    revisedPrompt?: string;
    url?: string;
    path?: string;
    bytes: number;
    base64?: string;
  }>;
}

function toSummary(
  config: AppConfig,
  alias: string,
  prompt: string,
  result: GenerateImageResult,
  savedPaths: string[],
  includeBase64: boolean,
  inputImages?: string[],
): ImageJobSummary {
  return {
    operation: result.operation,
    model: alias,
    upstreamModel: result.model,
    provider: result.provider,
    prompt,
    count: result.images.length,
    savedPaths,
    outputDir: config.outputDir,
    rawText: result.rawText,
    inputImages,
    images: result.images.map((img, index) => ({
      index,
      mimeType: img.mimeType,
      revisedPrompt: img.revisedPrompt,
      url: img.url,
      path: savedPaths[index],
      bytes: Buffer.from(img.base64, "base64").byteLength,
      ...(includeBase64 ? { base64: img.base64 } : {}),
    })),
  };
}

export function listModels(config = loadConfig()) {
  return {
    defaultModel: config.defaultModel,
    outputDir: config.outputDir,
    timeoutMs: config.timeoutMs,
    models: Object.entries(config.models).map(([alias, model]) => ({
      alias,
      provider: model.provider,
      upstreamModel: model.model ?? alias,
      baseUrl: model.baseUrl,
      apiKey: maskSecret(model.apiKey),
    })),
  };
}

export async function runGenerate(options: RunGenerateOptions): Promise<{
  result: GenerateImageResult;
  summary: ImageJobSummary;
  imagesBase64: Array<{ data: string; mimeType: string }>;
}> {
  const config = options.config ?? loadConfig();
  const { alias, modelConfig } = resolveModelConfig(config, options.model);

  const request: GenerateImageRequest = {
    prompt: options.prompt,
    model: alias,
    n: options.n,
    size: options.size,
    quality: options.quality,
    aspectRatio: options.aspectRatio,
    imageSize: options.imageSize,
    responseFormat: options.responseFormat,
    signal: options.signal,
  };

  const result = await generateImage(modelConfig, request, config.timeoutMs);
  const shouldSave = options.save !== false;
  const savedPaths = shouldSave
    ? await saveImages(config.outputDir, alias, options.prompt, result.images, "generate")
    : [];

  return {
    result,
    summary: toSummary(
      config,
      alias,
      options.prompt,
      result,
      savedPaths,
      options.includeBase64InSummary === true,
    ),
    imagesBase64: result.images.map((img) => ({
      data: img.base64,
      mimeType: img.mimeType,
    })),
  };
}

export async function runEdit(options: RunEditOptions): Promise<{
  result: GenerateImageResult;
  summary: ImageJobSummary;
  imagesBase64: Array<{ data: string; mimeType: string }>;
}> {
  const config = options.config ?? loadConfig();
  const { alias, modelConfig } = resolveModelConfig(config, options.model);

  if (!options.images?.length) {
    throw new Error("edit requires at least one input image (path or base64)");
  }

  const request: EditImageRequest = {
    prompt: options.prompt,
    model: alias,
    images: options.images,
    mask: options.mask,
    n: options.n,
    size: options.size,
    quality: options.quality,
    aspectRatio: options.aspectRatio,
    imageSize: options.imageSize,
    responseFormat: options.responseFormat,
    signal: options.signal,
  };

  const result = await editImage(modelConfig, request, config.timeoutMs);
  const shouldSave = options.save !== false;
  const savedPaths = shouldSave
    ? await saveImages(config.outputDir, alias, options.prompt, result.images, "edit")
    : [];

  const inputImages = options.images.map((img) => img.path).filter((p): p is string => Boolean(p));

  return {
    result,
    summary: toSummary(
      config,
      alias,
      options.prompt,
      result,
      savedPaths,
      options.includeBase64InSummary === true,
      inputImages,
    ),
    imagesBase64: result.images.map((img) => ({
      data: img.base64,
      mimeType: img.mimeType,
    })),
  };
}
