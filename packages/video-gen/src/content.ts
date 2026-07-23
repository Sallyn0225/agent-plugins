import type { ContentItem, GenerateOptions } from "./types.js";

const MAX_REF_IMAGES = 9;
const MAX_REF_VIDEOS = 3;
const MAX_REF_AUDIOS = 3;

function requireHttpsUrl(url: string, label: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} must be a public HTTPS URL, got: ${url}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${label} must be a public HTTP(S) URL, got: ${url}`);
  }
  // Allow http for local offline tests; document HTTPS for production in skill/README.
  return trimmed;
}

/**
 * Build Ark `content[]` and validate modality limits / invalid combos client-side.
 */
export function buildContent(options: GenerateOptions): ContentItem[] {
  const prompt = options.prompt?.trim() ?? "";
  const firstFrame = options.firstFrame?.trim();
  const lastFrame = options.lastFrame?.trim();
  const refImages = options.refImages ?? [];
  const refVideos = options.refVideos ?? [];
  const refAudios = options.refAudios ?? [];

  if (refImages.length > MAX_REF_IMAGES) {
    throw new Error(`Too many --ref-image values (max ${MAX_REF_IMAGES})`);
  }
  if (refVideos.length > MAX_REF_VIDEOS) {
    throw new Error(`Too many --ref-video values (max ${MAX_REF_VIDEOS})`);
  }
  if (refAudios.length > MAX_REF_AUDIOS) {
    throw new Error(`Too many --ref-audio values (max ${MAX_REF_AUDIOS})`);
  }

  if (lastFrame && !firstFrame) {
    throw new Error("--last-frame requires --first-frame");
  }

  const hasText = prompt.length > 0;
  const hasImage = Boolean(firstFrame) || Boolean(lastFrame) || refImages.length > 0;
  const hasVideo = refVideos.length > 0;
  const hasAudio = refAudios.length > 0;

  // Reject pure audio and text+audio-only when locally detectable.
  if (hasAudio && !hasText && !hasImage && !hasVideo) {
    throw new Error(
      "Pure audio generation is not supported; provide a text prompt and/or image/video refs",
    );
  }
  if (hasAudio && hasText && !hasImage && !hasVideo) {
    throw new Error(
      "Text + audio only is not supported; add --first-frame / --ref-image / --ref-video or drop --ref-audio",
    );
  }

  if (!hasText && !hasImage && !hasVideo) {
    throw new Error("A text prompt and/or media reference URL is required");
  }

  const content: ContentItem[] = [];

  if (hasText) {
    content.push({ type: "text", text: prompt });
  }

  if (firstFrame) {
    content.push({
      type: "image_url",
      image_url: { url: requireHttpsUrl(firstFrame, "--first-frame") },
      role: "first_frame",
    });
  }

  if (lastFrame) {
    content.push({
      type: "image_url",
      image_url: { url: requireHttpsUrl(lastFrame, "--last-frame") },
      role: "last_frame",
    });
  }

  for (const url of refImages) {
    content.push({
      type: "image_url",
      image_url: { url: requireHttpsUrl(url, "--ref-image") },
      role: "reference_image",
    });
  }

  for (const url of refVideos) {
    content.push({
      type: "video_url",
      video_url: { url: requireHttpsUrl(url, "--ref-video") },
      role: "reference_video",
    });
  }

  for (const url of refAudios) {
    content.push({
      type: "audio_url",
      audio_url: { url: requireHttpsUrl(url, "--ref-audio") },
      role: "reference_audio",
    });
  }

  return content;
}

/** Official API defaults when flags are omitted. */
export const GENERATE_DEFAULTS = {
  generateAudio: true,
  watermark: false,
  ratio: "adaptive",
  duration: 5,
  resolution: "720p",
} as const;
