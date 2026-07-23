import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/** Tiny fake MP4 payload (not a real container; enough for download tests). */
export const TINY_MP4_BYTES = Buffer.from("ftypisom-fake-mp4-bytes-for-offline-tests");

export type RequestCapture = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  bodyText: string;
};

export type TaskScript =
  | { kind: "sequence"; statuses: string[]; videoUrl?: string; failMessage?: string }
  | { kind: "always"; status: string; videoUrl?: string; failMessage?: string };

export type AdapterHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer,
  capture: RequestCapture,
) => void | Promise<void>;

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

/**
 * Local Ark-shaped HTTP adapter:
 * - POST /contents/generations/tasks
 * - GET  /contents/generations/tasks/:id
 * - GET  /fixture/video.mp4 (binary)
 */
export class LocalArkAdapter {
  readonly captures: RequestCapture[] = [];
  private server: Server | null = null;
  private port = 0;
  private handler: AdapterHandler;
  private taskCounter = 0;
  private taskPollCount = new Map<string, number>();
  private taskScripts = new Map<string, TaskScript>();
  private defaultScript: TaskScript = {
    kind: "sequence",
    statuses: ["running", "succeeded"],
  };

  constructor(handler?: AdapterHandler) {
    this.handler =
      handler ?? ((req, res, body, capture) => this.defaultHandle(req, res, body, capture));
  }

  setHandler(handler: AdapterHandler): void {
    this.handler = handler;
  }

  setDefaultScript(script: TaskScript): void {
    this.defaultScript = script;
  }

  setTaskScript(taskId: string, script: TaskScript): void {
    this.taskScripts.set(taskId, script);
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  videoUrl(name = "video.mp4"): string {
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
      throw new Error("Failed to bind local Ark adapter");
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
      const capture: RequestCapture = {
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: { ...req.headers },
        bodyText: body.toString("utf8"),
      };
      this.captures.push(capture);

      if ((req.url ?? "").startsWith("/fixture/")) {
        res.writeHead(200, { "content-type": "video/mp4" });
        res.end(TINY_MP4_BYTES);
        return;
      }

      await this.handler(req, res, body, capture);
    } catch (error) {
      sendJson(res, 500, { error: { message: String(error) } });
    }
  }

  private defaultHandle(
    req: IncomingMessage,
    res: ServerResponse,
    body: Buffer,
    _capture: RequestCapture,
  ): void {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";

    if (method === "POST" && url.startsWith("/contents/generations/tasks")) {
      this.taskCounter += 1;
      const id = `task-offline-${this.taskCounter}`;
      this.taskPollCount.set(id, 0);
      this.taskScripts.set(id, this.defaultScript);
      // Validate auth is present
      const auth = req.headers.authorization ?? "";
      if (!String(auth).startsWith("Bearer ")) {
        sendJson(res, 401, { error: { message: "missing bearer token" } });
        return;
      }
      // Parse body so tests can assert content via captures; optional early validation.
      try {
        JSON.parse(body.toString("utf8"));
      } catch {
        sendJson(res, 400, { error: { message: "invalid JSON body" } });
        return;
      }
      sendJson(res, 200, { id });
      return;
    }

    const getMatch = url.match(/^\/contents\/generations\/tasks\/([^/?]+)/);
    if (method === "GET" && getMatch) {
      const id = decodeURIComponent(getMatch[1]);
      const script = this.taskScripts.get(id) ?? this.defaultScript;
      const poll = (this.taskPollCount.get(id) ?? 0) + 1;
      this.taskPollCount.set(id, poll);

      let status: string;
      let failMessage: string | undefined;
      let videoUrl: string | undefined;

      if (script.kind === "always") {
        status = script.status;
        failMessage = script.failMessage;
        videoUrl = script.videoUrl;
      } else {
        const idx = Math.min(poll - 1, script.statuses.length - 1);
        status = script.statuses[idx];
        failMessage = script.failMessage;
        videoUrl = script.videoUrl;
      }

      if (status === "succeeded") {
        sendJson(res, 200, {
          id,
          model: "doubao-seedance-2-0-260128",
          status: "succeeded",
          content: {
            video_url: videoUrl ?? this.videoUrl(),
          },
          ratio: "adaptive",
          duration: 5,
          resolution: "720p",
          usage: { completion_tokens: 1 },
        });
        return;
      }

      if (status === "failed" || status === "expired") {
        sendJson(res, 200, {
          id,
          status,
          error: {
            code: status,
            message: failMessage ?? `upstream ${status}`,
          },
        });
        return;
      }

      sendJson(res, 200, {
        id,
        status,
        model: "doubao-seedance-2-0-260128",
      });
      return;
    }

    sendJson(res, 404, { error: { message: `no route for ${method} ${url}` } });
  }
}

export function createSuccessAdapter(): LocalArkAdapter {
  const adapter = new LocalArkAdapter();
  adapter.setDefaultScript({
    kind: "sequence",
    statuses: ["running", "succeeded"],
  });
  return adapter;
}
