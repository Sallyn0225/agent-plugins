import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { editImage, generateImage } from "../../packages/image-gen/src/providers/index.js";
import type { ModelConfig } from "../../packages/image-gen/src/types.js";

/** 1x1 transparent PNG */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TINY_PNG_BYTES = Buffer.from(TINY_PNG_BASE64, "base64");

/** 1x1 JPEG (minimal) */
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";

type RequestCapture = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  bodyText: string;
  isMultipart: boolean;
  contentType: string;
};

type AdapterHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer,
  capture: RequestCapture,
) => void | Promise<void>;

class LocalProviderAdapter {
  readonly captures: RequestCapture[] = [];
  private server: Server | null = null;
  private port = 0;
  private handler: AdapterHandler;

  constructor(handler: AdapterHandler) {
    this.handler = handler;
  }

  setHandler(handler: AdapterHandler): void {
    this.handler = handler;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  imageUrl(name = "fixture.png"): string {
    return `${this.baseUrl}/fixture/${name}`;
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "127.0.0.1", () => resolve());
    });

    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind local provider adapter");
    }
    this.port = address.port;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      const contentType = String(req.headers["content-type"] ?? "");
      const capture: RequestCapture = {
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: { ...req.headers },
        bodyText: body.toString("utf8"),
        isMultipart: contentType.includes("multipart/form-data"),
        contentType,
      };
      this.captures.push(capture);

      // Local fixture download endpoint used for URL-mode responses
      if ((req.url ?? "").startsWith("/fixture/")) {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(TINY_PNG_BYTES);
        return;
      }

      await this.handler(req, res, body, capture);
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: String(error) } }));
    }
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function sendText(
  res: ServerResponse,
  status: number,
  text: string,
  contentType = "text/plain",
): void {
  res.writeHead(status, { "content-type": contentType });
  res.end(text);
}

function openaiImages(images: Array<Record<string, unknown>>): unknown {
  return { data: images };
}

function geminiImages(
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
): unknown {
  return {
    candidates: [
      {
        content: {
          parts,
        },
      },
    ],
  };
}

function modelConfig(
  adapter: LocalProviderAdapter,
  provider: "openai-images" | "gemini",
  overrides: Partial<ModelConfig> = {},
): ModelConfig {
  return {
    provider,
    baseUrl: adapter.baseUrl,
    apiKey: "test-key-not-real",
    model: provider === "gemini" ? "gemini-test" : "gpt-image-test",
    ...overrides,
  };
}

const adapters: LocalProviderAdapter[] = [];

async function startAdapter(handler: AdapterHandler): Promise<LocalProviderAdapter> {
  const adapter = new LocalProviderAdapter(handler);
  await adapter.start();
  adapters.push(adapter);
  return adapter;
}

afterEach(async () => {
  while (adapters.length > 0) {
    const adapter = adapters.pop();
    await adapter?.stop();
  }
});

describe("OpenAI-images provider through local HTTP adapter", () => {
  it("generates images from base64 responses", async () => {
    const adapter = await startAdapter((_req, res) => {
      sendJson(
        res,
        200,
        openaiImages([
          {
            b64_json: TINY_PNG_BASE64,
            revised_prompt: "a tiny pixel",
            mime_type: "image/png",
          },
        ]),
      );
    });

    const result = await generateImage(
      modelConfig(adapter, "openai-images"),
      { prompt: "a tiny pixel", model: "local-alias" },
      5_000,
    );

    expect(result.operation).toBe("generate");
    expect(result.provider).toBe("openai-images");
    expect(result.model).toBe("gpt-image-test");
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.base64).toBe(TINY_PNG_BASE64);
    expect(result.images[0]?.mimeType).toBe("image/png");
    expect(result.images[0]?.revisedPrompt).toBe("a tiny pixel");

    const capture = adapter.captures[0];
    expect(capture?.method).toBe("POST");
    expect(capture?.url).toBe("/v1/images/generations");
    expect(capture?.headers.authorization).toBe("Bearer test-key-not-real");
    expect(JSON.parse(capture?.bodyText ?? "{}")).toMatchObject({
      model: "gpt-image-test",
      prompt: "a tiny pixel",
      n: 1,
      response_format: "b64_json",
    });
  });

  it("downloads URL responses from the local adapter", async () => {
    const adapter = await startAdapter((_req, res) => {
      // Placeholder handler replaced after the port is known.
      sendJson(res, 500, { error: { message: "handler not ready" } });
    });

    adapter.setHandler((_req, res) => {
      sendJson(
        res,
        200,
        openaiImages([
          {
            url: adapter.imageUrl("gen.png"),
            revised_prompt: "from url",
          },
        ]),
      );
    });

    const result = await generateImage(
      modelConfig(adapter, "openai-images"),
      { prompt: "url mode", model: "local-alias", responseFormat: "url" },
      5_000,
    );

    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.base64).toBe(TINY_PNG_BASE64);
    expect(result.images[0]?.mimeType).toBe("image/png");
    expect(result.images[0]?.url).toBe(adapter.imageUrl("gen.png"));
    expect(result.images[0]?.revisedPrompt).toBe("from url");
  });

  it("returns multiple generated images", async () => {
    const adapter = await startAdapter((_req, res) => {
      sendJson(
        res,
        200,
        openaiImages([
          { b64_json: TINY_PNG_BASE64, mime_type: "image/png" },
          { b64: TINY_JPEG_BASE64, mimeType: "image/jpeg" },
        ]),
      );
    });

    const result = await generateImage(
      modelConfig(adapter, "openai-images"),
      { prompt: "two images", model: "local-alias", n: 2 },
      5_000,
    );

    expect(result.images).toHaveLength(2);
    expect(result.images[0]?.mimeType).toBe("image/png");
    expect(result.images[1]?.mimeType).toBe("image/jpeg");
    expect(result.images[1]?.base64).toBe(TINY_JPEG_BASE64);
  });

  it("forwards custom headers on generation requests", async () => {
    const adapter = await startAdapter((_req, res) => {
      sendJson(res, 200, openaiImages([{ b64_json: TINY_PNG_BASE64 }]));
    });

    await generateImage(
      modelConfig(adapter, "openai-images", {
        headers: { "X-Custom-Tenant": "tenant-a", "X-Request-Source": "tests" },
      }),
      { prompt: "headers", model: "local-alias" },
      5_000,
    );

    const headers = adapter.captures[0]?.headers ?? {};
    expect(headers["x-custom-tenant"]).toBe("tenant-a");
    expect(headers["x-request-source"]).toBe("tests");
  });

  it("edits images with multipart form data when the adapter accepts it", async () => {
    const adapter = await startAdapter((_req, res, _body, capture) => {
      expect(capture.isMultipart).toBe(true);
      expect(capture.contentType).toMatch(/multipart\/form-data/);
      // Multipart body should contain prompt and image field markers
      expect(capture.bodyText).toContain('name="prompt"');
      expect(capture.bodyText).toContain("make it blue");
      expect(capture.bodyText).toMatch(/name="image/);
      sendJson(res, 200, openaiImages([{ b64_json: TINY_PNG_BASE64 }]));
    });

    const result = await editImage(
      modelConfig(adapter, "openai-images"),
      {
        prompt: "make it blue",
        model: "local-alias",
        images: [{ base64: TINY_PNG_BASE64, mimeType: "image/png" }],
      },
      5_000,
    );

    expect(result.operation).toBe("edit");
    expect(result.provider).toBe("openai-images");
    expect(result.images).toHaveLength(1);
    expect(adapter.captures[0]?.url).toBe("/v1/images/edits");
  });

  it("falls back to JSON edit body when multipart is rejected", async () => {
    let requests = 0;
    const adapter = await startAdapter((_req, res, _body, capture) => {
      requests += 1;
      if (requests === 1) {
        expect(capture.isMultipart).toBe(true);
        sendText(res, 415, "unsupported media type: only application/json is accepted");
        return;
      }

      expect(capture.isMultipart).toBe(false);
      expect(capture.contentType).toMatch(/application\/json/);
      const body = JSON.parse(capture.bodyText) as {
        prompt: string;
        images: Array<{ image_url: string }>;
        mask?: { image_url: string };
      };
      expect(body.prompt).toBe("repaint sky");
      expect(body.images).toHaveLength(1);
      expect(body.images[0]?.image_url).toMatch(/^data:image\/png;base64,/);
      expect(body.mask?.image_url).toMatch(/^data:image\/png;base64,/);
      sendJson(res, 200, openaiImages([{ b64_json: TINY_PNG_BASE64 }]));
    });

    const result = await editImage(
      modelConfig(adapter, "openai-images"),
      {
        prompt: "repaint sky",
        model: "local-alias",
        images: [{ base64: TINY_PNG_BASE64, mimeType: "image/png" }],
        mask: { base64: TINY_PNG_BASE64, mimeType: "image/png" },
      },
      5_000,
    );

    expect(result.images).toHaveLength(1);
    expect(requests).toBe(2);
  });

  it("edits with multiple input images from temporary filesystem paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "image-gen-provider-"));
    try {
      const imageA = join(dir, "a.png");
      const imageB = join(dir, "b.png");
      await writeFile(imageA, TINY_PNG_BYTES);
      await writeFile(imageB, TINY_PNG_BYTES);

      const adapter = await startAdapter((_req, res, _body, capture) => {
        expect(capture.isMultipart).toBe(true);
        // Both images should appear in the multipart payload
        expect(capture.bodyText).toContain("a.png");
        expect(capture.bodyText).toContain("b.png");
        sendJson(
          res,
          200,
          openaiImages([{ b64_json: TINY_PNG_BASE64 }, { b64_json: TINY_PNG_BASE64 }]),
        );
      });

      const result = await editImage(
        modelConfig(adapter, "openai-images"),
        {
          prompt: "blend them",
          model: "local-alias",
          images: [{ path: imageA }, { path: imageB }],
          n: 2,
        },
        5_000,
      );

      expect(result.images).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("includes a mask field when provided for OpenAI edits", async () => {
    const adapter = await startAdapter((_req, res, _body, capture) => {
      expect(capture.bodyText).toContain('name="mask"');
      sendJson(res, 200, openaiImages([{ b64_json: TINY_PNG_BASE64 }]));
    });

    await editImage(
      modelConfig(adapter, "openai-images"),
      {
        prompt: "inpaint",
        model: "local-alias",
        images: [{ base64: TINY_PNG_BASE64, mimeType: "image/png" }],
        mask: { base64: TINY_PNG_BASE64, mimeType: "image/png" },
      },
      5_000,
    );

    expect(adapter.captures).toHaveLength(1);
  });
});

describe("Gemini provider through local HTTP adapter", () => {
  it("generates images from generateContent responses", async () => {
    const adapter = await startAdapter((_req, res, _body, capture) => {
      expect(capture.url).toBe("/v1beta/models/gemini-test:generateContent");
      expect(capture.headers.authorization).toBe("Bearer test-key-not-real");
      expect(capture.headers["x-goog-api-key"]).toBe("test-key-not-real");
      const body = JSON.parse(capture.bodyText) as {
        contents: Array<{ parts: Array<{ text?: string }> }>;
        generationConfig: { responseModalities: string[] };
      };
      expect(body.contents[0]?.parts[0]?.text).toBe("draw a square");
      expect(body.generationConfig.responseModalities).toEqual(["TEXT", "IMAGE"]);
      sendJson(
        res,
        200,
        geminiImages([
          { text: "here you go" },
          { inlineData: { mimeType: "image/png", data: TINY_PNG_BASE64 } },
        ]),
      );
    });

    const result = await generateImage(
      modelConfig(adapter, "gemini"),
      { prompt: "draw a square", model: "local-alias" },
      5_000,
    );

    expect(result.operation).toBe("generate");
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-test");
    expect(result.rawText).toBe("here you go");
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.base64).toBe(TINY_PNG_BASE64);
    expect(result.images[0]?.mimeType).toBe("image/png");
  });

  it("edits images by sending prompt plus inline reference images", async () => {
    const adapter = await startAdapter((_req, res, _body, capture) => {
      const body = JSON.parse(capture.bodyText) as {
        contents: Array<{
          parts: Array<{
            text?: string;
            inlineData?: { mimeType: string; data: string };
          }>;
        }>;
      };
      const parts = body.contents[0]?.parts ?? [];
      expect(parts[0]?.text).toBe("add snow");
      expect(parts[1]?.inlineData?.data).toBe(TINY_PNG_BASE64);
      expect(parts[1]?.inlineData?.mimeType).toBe("image/png");
      expect(parts.some((part) => part.text?.includes("mask"))).toBe(true);
      expect(parts.filter((part) => part.inlineData?.data === TINY_PNG_BASE64)).toHaveLength(2);

      // Snake_case inline_data is accepted by the provider parser
      sendJson(res, 200, {
        candidates: [
          {
            content: {
              parts: [
                {
                  inline_data: {
                    mime_type: "image/png",
                    data: TINY_PNG_BASE64,
                  },
                },
              ],
            },
          },
        ],
      });
    });

    const result = await editImage(
      modelConfig(adapter, "gemini"),
      {
        prompt: "add snow",
        model: "local-alias",
        images: [{ base64: TINY_PNG_BASE64, mimeType: "image/png" }],
        mask: { base64: TINY_PNG_BASE64, mimeType: "image/png" },
      },
      5_000,
    );

    expect(result.operation).toBe("edit");
    expect(result.provider).toBe("gemini");
    expect(result.images).toHaveLength(1);
  });

  it("forwards custom headers on Gemini requests", async () => {
    const adapter = await startAdapter((_req, res) => {
      sendJson(
        res,
        200,
        geminiImages([{ inlineData: { mimeType: "image/png", data: TINY_PNG_BASE64 } }]),
      );
    });

    await generateImage(
      modelConfig(adapter, "gemini", {
        headers: { "X-Proxy-Region": "us-test" },
      }),
      { prompt: "headers", model: "local-alias" },
      5_000,
    );

    expect(adapter.captures[0]?.headers["x-proxy-region"]).toBe("us-test");
  });
});

describe("Provider error and cancellation outcomes", () => {
  it("surfaces OpenAI HTTP errors through the public generate seam", async () => {
    const adapter = await startAdapter((_req, res) => {
      sendJson(res, 401, { error: { message: "invalid api key" } });
    });

    await expect(
      generateImage(
        modelConfig(adapter, "openai-images"),
        { prompt: "nope", model: "local-alias" },
        5_000,
      ),
    ).rejects.toThrow(/OpenAI images generations error \(401\): invalid api key/);
  });

  it("surfaces Gemini HTTP errors through the public generate seam", async () => {
    const adapter = await startAdapter((_req, res) => {
      sendJson(res, 429, { error: { message: "rate limited" } });
    });

    await expect(
      generateImage(
        modelConfig(adapter, "gemini"),
        { prompt: "nope", model: "local-alias" },
        5_000,
      ),
    ).rejects.toThrow(/Gemini generateContent error \(429\): rate limited/);
  });

  it("rejects malformed non-JSON OpenAI responses", async () => {
    const adapter = await startAdapter((_req, res) => {
      sendText(res, 200, "<html>not json</html>", "text/html");
    });

    await expect(
      generateImage(
        modelConfig(adapter, "openai-images"),
        { prompt: "broken", model: "local-alias" },
        5_000,
      ),
    ).rejects.toThrow(/non-JSON/);
  });

  it("rejects empty OpenAI image payloads", async () => {
    const adapter = await startAdapter((_req, res) => {
      sendJson(res, 200, { data: [] });
    });

    await expect(
      generateImage(
        modelConfig(adapter, "openai-images"),
        { prompt: "empty", model: "local-alias" },
        5_000,
      ),
    ).rejects.toThrow(/returned no data/);
  });

  it("rejects Gemini responses that contain no images", async () => {
    const adapter = await startAdapter((_req, res) => {
      sendJson(res, 200, geminiImages([{ text: "I can only describe, not draw" }]));
    });

    await expect(
      generateImage(
        modelConfig(adapter, "gemini"),
        { prompt: "text only", model: "local-alias" },
        5_000,
      ),
    ).rejects.toThrow(/no images/);
  });

  it("rejects OpenAI items that lack both base64 and url", async () => {
    const adapter = await startAdapter((_req, res) => {
      sendJson(res, 200, openaiImages([{ revised_prompt: "nothing useful" }]));
    });

    await expect(
      generateImage(
        modelConfig(adapter, "openai-images"),
        { prompt: "missing payload", model: "local-alias" },
        5_000,
      ),
    ).rejects.toThrow(/missing both b64_json and url/);
  });

  it("aborts generation when the caller signal is aborted after the request starts", async () => {
    let releaseHandler: (() => void) | undefined;
    const handlerGate = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    let requestSeen!: () => void;
    const sawRequest = new Promise<void>((resolve) => {
      requestSeen = resolve;
    });

    const adapter = await startAdapter(async (_req, res) => {
      requestSeen();
      await handlerGate;
      sendJson(res, 200, openaiImages([{ b64_json: TINY_PNG_BASE64 }]));
    });

    const controller = new AbortController();
    const pending = generateImage(
      modelConfig(adapter, "openai-images"),
      { prompt: "abort me", model: "local-alias", signal: controller.signal },
      5_000,
    );

    await sawRequest;
    controller.abort();
    releaseHandler?.();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("times out slow provider responses through the public seam", async () => {
    const adapter = await startAdapter(async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      sendJson(res, 200, openaiImages([{ b64_json: TINY_PNG_BASE64 }]));
    });

    await expect(
      generateImage(
        modelConfig(adapter, "openai-images"),
        { prompt: "too slow", model: "local-alias" },
        50,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("surfaces multipart edit failures that are not eligible for JSON fallback", async () => {
    const adapter = await startAdapter((_req, res) => {
      sendText(res, 500, "upstream exploded");
    });

    await expect(
      editImage(
        modelConfig(adapter, "openai-images"),
        {
          prompt: "fail hard",
          model: "local-alias",
          images: [{ base64: TINY_PNG_BASE64, mimeType: "image/png" }],
        },
        5_000,
      ),
    ).rejects.toThrow(/OpenAI images edits error \(500\): upstream exploded/);
  });
});
