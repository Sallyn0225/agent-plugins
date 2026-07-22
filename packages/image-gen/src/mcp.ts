#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { getMcpServerMetadata } from "./package-meta.js";
import { listModels, runEdit, runGenerate } from "./service.js";

const config = loadConfig();

const server = new McpServer(getMcpServerMetadata());

server.registerTool(
  "list_image_models",
  {
    title: "List Image Models",
    description:
      "List configured text-to-image / image-edit models and their providers. Call this first if unsure which model alias to use.",
    inputSchema: {},
  },
  async () => {
    const payload = listModels(config);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
);

const commonImageOptions = {
  model: z
    .string()
    .optional()
    .describe(
      `Model alias from config. Defaults to "${config.defaultModel ?? "first configured model"}". Use list_image_models to see options.`,
    ),
  n: z
    .number()
    .int()
    .min(1)
    .max(8)
    .optional()
    .describe("Number of images (OpenAI-compatible providers). Default: 1"),
  size: z
    .string()
    .optional()
    .describe('OpenAI-style size, e.g. "1024x1024", "1536x1024", "auto"'),
  quality: z
    .string()
    .optional()
    .describe('GPT Image quality: "low" | "medium" | "high" | "auto"'),
  aspect_ratio: z
    .string()
    .optional()
    .describe('Aspect ratio for Grok/Gemini style APIs, e.g. "1:1", "16:9"'),
  image_size: z
    .string()
    .optional()
    .describe('Gemini image size hint, e.g. "1K", "2K", "4K"'),
  response_format: z
    .enum(["b64_json", "url"])
    .optional()
    .describe("OpenAI-compatible response format preference. Default: b64_json"),
  save: z
    .boolean()
    .optional()
    .describe("Whether to save images under outputDir. Default: true"),
  include_base64_in_text: z
    .boolean()
    .optional()
    .describe("Include base64 in JSON text payload (huge). Default: false"),
};

server.registerTool(
  "generate_image",
  {
    title: "Generate Image",
    description: [
      "Generate images from a text prompt.",
      "Models:",
      "- gpt-image-2 / grok-imagine-image: POST /v1/images/generations",
      "- gemini-3.1-flash-image: generateContent with IMAGE modality",
      "Returns saved local paths and embeds image content blocks.",
    ].join("\n"),
    inputSchema: {
      prompt: z.string().min(1).describe("Text prompt describing the image to generate"),
      ...commonImageOptions,
    },
  },
  async (args, extra) => {
    try {
      const { summary, imagesBase64 } = await runGenerate({
        prompt: args.prompt,
        model: args.model,
        n: args.n,
        size: args.size,
        quality: args.quality,
        aspectRatio: args.aspect_ratio,
        imageSize: args.image_size,
        responseFormat: args.response_format,
        save: args.save,
        includeBase64InSummary: args.include_base64_in_text,
        signal: extra.signal,
        config,
      });

      const content: Array<
        | { type: "text"; text: string }
        | { type: "image"; data: string; mimeType: string }
      > = [
        {
          type: "text",
          text: [
            `Generated ${summary.count} image(s) with ${summary.model} (${summary.provider}).`,
            summary.savedPaths.length
              ? `Saved to:\n${summary.savedPaths.map((p) => `- ${p}`).join("\n")}`
              : "Not saved to disk (save=false).",
            summary.rawText ? `Model text:\n${summary.rawText}` : "",
            "",
            "Details:",
            JSON.stringify(summary, null, 2),
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ];

      for (const img of imagesBase64) {
        content.push({ type: "image", data: img.data, mimeType: img.mimeType });
      }

      return {
        content,
        structuredContent: summary as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Image generation failed: ${message}` }],
      };
    }
  },
);

server.registerTool(
  "edit_image",
  {
    title: "Edit Image",
    description: [
      "Edit one or more existing images with a text instruction.",
      "Providers:",
      "- openai-images (gpt-image-2, grok-imagine-image): POST /v1/images/edits",
      "- gemini (gemini-3.1-flash-image): multimodal generateContent with inline image parts",
      "Provide local image paths and/or base64 payloads.",
    ].join("\n"),
    inputSchema: {
      prompt: z
        .string()
        .min(1)
        .describe("Edit instruction, e.g. 'make it watercolor' or 'add a red hat'"),
      images: z
        .array(
          z.object({
            path: z.string().optional().describe("Local image path"),
            base64: z.string().optional().describe("Raw base64 or data URL"),
            mime_type: z.string().optional().describe("Optional mime type"),
          }),
        )
        .min(1)
        .describe("Source / reference images"),
      mask: z
        .object({
          path: z.string().optional(),
          base64: z.string().optional(),
          mime_type: z.string().optional(),
        })
        .optional()
        .describe("Optional mask image for inpainting (best-effort)"),
      ...commonImageOptions,
    },
  },
  async (args, extra) => {
    try {
      const { summary, imagesBase64 } = await runEdit({
        prompt: args.prompt,
        model: args.model,
        images: args.images.map((img) => ({
          path: img.path,
          base64: img.base64,
          mimeType: img.mime_type,
        })),
        mask: args.mask
          ? {
              path: args.mask.path,
              base64: args.mask.base64,
              mimeType: args.mask.mime_type,
            }
          : undefined,
        n: args.n,
        size: args.size,
        quality: args.quality,
        aspectRatio: args.aspect_ratio,
        imageSize: args.image_size,
        responseFormat: args.response_format,
        save: args.save,
        includeBase64InSummary: args.include_base64_in_text,
        signal: extra.signal,
        config,
      });

      const content: Array<
        | { type: "text"; text: string }
        | { type: "image"; data: string; mimeType: string }
      > = [
        {
          type: "text",
          text: [
            `Edited image(s) with ${summary.model} (${summary.provider}).`,
            summary.savedPaths.length
              ? `Saved to:\n${summary.savedPaths.map((p) => `- ${p}`).join("\n")}`
              : "Not saved to disk (save=false).",
            summary.rawText ? `Model text:\n${summary.rawText}` : "",
            "",
            "Details:",
            JSON.stringify(summary, null, 2),
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ];

      for (const img of imagesBase64) {
        content.push({ type: "image", data: img.data, mimeType: img.mimeType });
      }

      return {
        content,
        structuredContent: summary as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Image edit failed: ${message}` }],
      };
    }
  },
);

export async function startServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `image-gen MCP ready | models=${Object.keys(config.models).join(",")} | default=${config.defaultModel ?? "none"} | outputDir=${config.outputDir}`,
  );
}

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
const isDirectRun =
  entry.endsWith("/dist/mcp.js") ||
  entry.endsWith("/src/mcp.ts") ||
  entry.endsWith("/mcp.js");

if (isDirectRun) {
  startServer().catch((error) => {
    console.error("Fatal:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
