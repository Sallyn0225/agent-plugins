/** Resolved runtime configuration for Volcengine Ark video generation. */
export interface AppConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
  outputDir: string;
  /** Wait-for-completion timeout in milliseconds (default 600_000). */
  timeoutMs: number;
  /** Poll interval while waiting (default 15_000). */
  pollIntervalMs: number;
  /** Path of the config file that was loaded, if any. */
  configPath?: string;
}

export type ContentRole =
  | "first_frame"
  | "last_frame"
  | "reference_image"
  | "reference_video"
  | "reference_audio";

export type ContentItem =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string };
      role: "first_frame" | "last_frame" | "reference_image";
    }
  | {
      type: "video_url";
      video_url: { url: string };
      role: "reference_video";
    }
  | {
      type: "audio_url";
      audio_url: { url: string };
      role: "reference_audio";
    };

export interface CreateTaskRequest {
  model: string;
  content: ContentItem[];
  ratio?: string;
  duration?: number;
  resolution?: string;
  generate_audio?: boolean;
  watermark?: boolean;
  return_last_frame?: boolean;
  priority?: number;
}

export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "expired" | string;

export interface TaskContent {
  video_url?: string;
  last_frame_url?: string;
  /** Some responses may nest last frame under alternate keys. */
  [key: string]: unknown;
}

export interface TaskResponse {
  id: string;
  model?: string;
  status: TaskStatus;
  content?: TaskContent;
  error?: {
    code?: string;
    message?: string;
  };
  usage?: Record<string, unknown>;
  ratio?: string;
  duration?: number;
  resolution?: string;
  created_at?: number;
  updated_at?: number;
  [key: string]: unknown;
}

export interface CatalogModel {
  id: string;
  name: string;
  maxResolution: string;
  notes?: string;
}

export interface GenerateOptions {
  prompt: string;
  model?: string;
  firstFrame?: string;
  lastFrame?: string;
  refImages?: string[];
  refVideos?: string[];
  refAudios?: string[];
  ratio?: string;
  duration?: number;
  resolution?: string;
  generateAudio?: boolean;
  watermark?: boolean;
  returnLastFrame?: boolean;
  priority?: number;
  wait?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
  save?: boolean;
  config?: AppConfig;
  /** Progress sink (defaults to stderr). */
  onProgress?: (message: string) => void;
}

export interface GenerateResult {
  ok: boolean;
  taskId?: string;
  status?: TaskStatus;
  model?: string;
  videoUrl?: string;
  lastFrameUrl?: string;
  path?: string;
  ratio?: string;
  duration?: number;
  resolution?: string;
  usage?: Record<string, unknown>;
  error?: {
    code?: string;
    message: string;
  };
}
