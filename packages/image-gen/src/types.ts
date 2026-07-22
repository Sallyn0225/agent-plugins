export type ImageProviderKind = "openai-images" | "gemini";

export interface ModelConfig {
  /** Backend protocol adapter */
  provider: ImageProviderKind;
  /** API base URL, e.g. https://api.openai.com or a reverse proxy */
  baseUrl: string;
  /** API key / token */
  apiKey: string;
  /**
   * Upstream model id. Defaults to the config map key when omitted.
   * Useful when local alias differs from remote model name.
   */
  model?: string;
  /** Optional extra headers merged into every request */
  headers?: Record<string, string>;
}

export interface AppConfig {
  defaultModel?: string;
  outputDir: string;
  timeoutMs: number;
  models: Record<string, ModelConfig>;
}

export interface GeneratedImage {
  /** base64 payload without data: prefix */
  base64: string;
  mimeType: string;
  /** revised prompt if the provider returns one */
  revisedPrompt?: string;
  /** remote url if provider returned a temporary url */
  url?: string;
}

export interface ImageInput {
  /** Absolute or relative local path */
  path?: string;
  /** Raw base64 without data: prefix */
  base64?: string;
  /** Mime type; inferred from path/base64 when omitted */
  mimeType?: string;
}

export interface GenerateImageRequest {
  prompt: string;
  model: string;
  n?: number;
  size?: string;
  quality?: string;
  aspectRatio?: string;
  responseFormat?: "b64_json" | "url";
  /** Gemini only: TEXT+IMAGE or IMAGE */
  responseModalities?: Array<"TEXT" | "IMAGE">;
  imageSize?: string;
  signal?: AbortSignal;
}

export interface EditImageRequest {
  prompt: string;
  model: string;
  /** One or more reference / source images */
  images: ImageInput[];
  /** Optional mask for inpainting (OpenAI edits) */
  mask?: ImageInput;
  n?: number;
  size?: string;
  quality?: string;
  aspectRatio?: string;
  responseFormat?: "b64_json" | "url";
  responseModalities?: Array<"TEXT" | "IMAGE">;
  imageSize?: string;
  signal?: AbortSignal;
}

export interface GenerateImageResult {
  model: string;
  provider: ImageProviderKind;
  images: GeneratedImage[];
  rawText?: string;
  operation: "generate" | "edit";
}
