import type {
  EditImageRequest,
  GenerateImageRequest,
  GenerateImageResult,
  ModelConfig,
} from "../types.js";
import { editWithGemini, generateWithGemini } from "./gemini.js";
import { editWithOpenAIImages, generateWithOpenAIImages } from "./openai-images.js";

export async function generateImage(
  modelConfig: ModelConfig,
  request: GenerateImageRequest,
  timeoutMs: number,
): Promise<GenerateImageResult> {
  switch (modelConfig.provider) {
    case "openai-images":
      return generateWithOpenAIImages(modelConfig, request, timeoutMs);
    case "gemini":
      return generateWithGemini(modelConfig, request, timeoutMs);
    default: {
      const exhaustive: never = modelConfig.provider;
      throw new Error(`Unsupported provider: ${String(exhaustive)}`);
    }
  }
}

export async function editImage(
  modelConfig: ModelConfig,
  request: EditImageRequest,
  timeoutMs: number,
): Promise<GenerateImageResult> {
  switch (modelConfig.provider) {
    case "openai-images":
      return editWithOpenAIImages(modelConfig, request, timeoutMs);
    case "gemini":
      return editWithGemini(modelConfig, request, timeoutMs);
    default: {
      const exhaustive: never = modelConfig.provider;
      throw new Error(`Unsupported provider: ${String(exhaustive)}`);
    }
  }
}

export { editWithGemini, editWithOpenAIImages, generateWithGemini, generateWithOpenAIImages };
