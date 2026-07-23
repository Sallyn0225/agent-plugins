import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/** 1x1 transparent PNG */
export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
export const TINY_PNG_BYTES = Buffer.from(TINY_PNG_BASE64, "base64");

/** 1x1 JPEG (minimal) */
export const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";

export type RequestCapture = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  bodyText: string;
  isMultipart: boolean;
  contentType: string;
};

export type AdapterHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer,
  capture: RequestCapture,
) => void | Promise<void>;

/**
 * Local HTTP Provider Adapter for offline tests.
 * Binds a random port on 127.0.0.1 and never contacts external networks.
 */
export class LocalProviderAdapter {
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

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

export function sendText(
  res: ServerResponse,
  status: number,
  text: string,
  contentType = "text/plain",
): void {
  res.writeHead(status, { "content-type": contentType });
  res.end(text);
}

export function openaiImages(images: Array<Record<string, unknown>>): unknown {
  return { data: images };
}

export function geminiImages(
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

/** OpenAI-style generate success handler returning a fixed tiny PNG. */
export function openaiGenerateSuccessHandler(
  overrides: { b64?: string; revisedPrompt?: string } = {},
): AdapterHandler {
  const b64 = overrides.b64 ?? TINY_PNG_BASE64;
  const revisedPrompt = overrides.revisedPrompt ?? "offline fixture";
  return (_req, res) => {
    sendJson(
      res,
      200,
      openaiImages([
        {
          b64_json: b64,
          revised_prompt: revisedPrompt,
          mime_type: "image/png",
        },
      ]),
    );
  };
}

/** OpenAI-style edit success handler. */
export function openaiEditSuccessHandler(
  overrides: { b64?: string; revisedPrompt?: string } = {},
): AdapterHandler {
  return openaiGenerateSuccessHandler(overrides);
}
