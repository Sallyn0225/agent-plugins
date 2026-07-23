import { existsSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { assertBuiltBinaries, runCli } from "./helpers/cli-process.js";
import { createOfflineFixture, offlineEnv, type OfflineFixture } from "./helpers/fixtures.js";
import {
  type LocalArkAdapter,
  TINY_MP4_BYTES,
  createSuccessAdapter,
} from "./helpers/local-ark-adapter.js";

const adapters: LocalArkAdapter[] = [];
const fixtures: OfflineFixture[] = [];

async function startAdapter(adapter = createSuccessAdapter()): Promise<LocalArkAdapter> {
  await adapter.start();
  adapters.push(adapter);
  return adapter;
}

async function fixtureFor(
  adapter: LocalArkAdapter,
  overrides: Parameters<typeof createOfflineFixture>[0] extends infer O
    ? Omit<O, "baseUrl">
    : never = {},
): Promise<OfflineFixture> {
  const fixture = await createOfflineFixture({ baseUrl: adapter.baseUrl, ...overrides });
  fixtures.push(fixture);
  return fixture;
}

beforeAll(() => {
  assertBuiltBinaries();
});

afterEach(async () => {
  while (adapters.length > 0) {
    await adapters.pop()?.stop();
  }
  while (fixtures.length > 0) {
    await fixtures.pop()?.cleanup();
  }
});

describe("video-gen CLI process interface (black-box)", () => {
  it("prints help for --help and exits 0", async () => {
    const result = await runCli({ args: ["--help"] });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("video-gen");
    expect(result.stdout).toContain("generate");
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("download");
    expect(result.stdout).toContain("models");
    expect(result.stderr.trim()).toBe("");
  });

  it("lists recommended Seedance 2.0 models as parseable JSON", async () => {
    const result = await runCli({ args: ["models"] });
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(true);
    expect(payload.defaultModel).toBe("doubao-seedance-2-0-260128");
    expect(payload.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "doubao-seedance-2-0-260128",
          maxResolution: "1080p/4k",
        }),
        expect.objectContaining({ id: "doubao-seedance-2-0-fast-260128" }),
        expect.objectContaining({ id: "doubao-seedance-2-0-mini-260615" }),
      ]),
    );
  });

  it("generates text-to-video with default wait + download", async () => {
    const adapter = await startAdapter();
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: ["generate", "a tiny offline clip", "--poll-interval", "20", "--timeout", "10000"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(true);
    expect(payload.taskId).toMatch(/^task-offline-/);
    expect(payload.status).toBe("succeeded");
    expect(payload.model).toBe("doubao-seedance-2-0-260128");
    expect(payload.videoUrl).toContain("/fixture/");
    expect(payload.path).toBeTruthy();
    expect(existsSync(payload.path)).toBe(true);
    expect(result.stderr).toMatch(/status=/);
    expect(result.stdout).not.toContain(fixture.apiKey);

    const create = adapter.captures.find(
      (c) => c.method === "POST" && c.url.startsWith("/contents/generations/tasks"),
    );
    expect(create).toBeTruthy();
    const body = JSON.parse(create!.bodyText);
    expect(body.model).toBe("doubao-seedance-2-0-260128");
    expect(body.generate_audio).toBe(true);
    expect(body.watermark).toBe(false);
    expect(body.ratio).toBe("adaptive");
    expect(body.duration).toBe(5);
    expect(body.resolution).toBe("720p");
    expect(body.content).toEqual([{ type: "text", text: "a tiny offline clip" }]);
    expect(create!.headers.authorization).toBe(`Bearer ${fixture.apiKey}`);
  });

  it("supports --no-wait and returns taskId without download", async () => {
    const adapter = await startAdapter();
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: ["generate", "--no-wait", "submit only"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      ok: true,
      status: "queued",
    });
    expect(payload.taskId).toBeTruthy();
    expect(payload.path).toBeUndefined();
  });

  it("maps first-frame / last-frame / ref media into content[] roles", async () => {
    const adapter = await startAdapter();
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: [
        "generate",
        "--no-wait",
        "--first-frame",
        "https://cdn.example/first.png",
        "--last-frame",
        "https://cdn.example/last.png",
        "--ref-image",
        "https://cdn.example/ref1.png",
        "--ref-image",
        "https://cdn.example/ref2.png",
        "--ref-video",
        "https://cdn.example/ref.mp4",
        "--ref-audio",
        "https://cdn.example/ref.mp3",
        "guided motion",
      ],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(0);
    const create = adapter.captures.find((c) => c.method === "POST");
    const body = JSON.parse(create!.bodyText);
    expect(body.content).toEqual([
      { type: "text", text: "guided motion" },
      {
        type: "image_url",
        image_url: { url: "https://cdn.example/first.png" },
        role: "first_frame",
      },
      {
        type: "image_url",
        image_url: { url: "https://cdn.example/last.png" },
        role: "last_frame",
      },
      {
        type: "image_url",
        image_url: { url: "https://cdn.example/ref1.png" },
        role: "reference_image",
      },
      {
        type: "image_url",
        image_url: { url: "https://cdn.example/ref2.png" },
        role: "reference_image",
      },
      {
        type: "video_url",
        video_url: { url: "https://cdn.example/ref.mp4" },
        role: "reference_video",
      },
      {
        type: "audio_url",
        audio_url: { url: "https://cdn.example/ref.mp3" },
        role: "reference_audio",
      },
    ]);
  });

  it("status and download work for a previously created task", async () => {
    const adapter = await startAdapter();
    adapter.setDefaultScript({ kind: "always", status: "succeeded" });
    const fixture = await fixtureFor(adapter);

    const submitted = await runCli({
      args: ["generate", "--no-wait", "later download"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });
    const { taskId } = JSON.parse(submitted.stdout) as { taskId: string };

    const status = await runCli({
      args: ["status", taskId],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });
    expect(status.exitCode).toBe(0);
    const statusPayload = JSON.parse(status.stdout);
    expect(statusPayload).toMatchObject({
      ok: true,
      taskId,
      status: "succeeded",
    });
    expect(statusPayload.videoUrl).toBeTruthy();

    const download = await runCli({
      args: ["download", taskId],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });
    expect(download.exitCode).toBe(0);
    const dl = JSON.parse(download.stdout);
    expect(dl.ok).toBe(true);
    expect(dl.path).toBeTruthy();
    expect(existsSync(dl.path)).toBe(true);
  });

  it("exits non-zero with JSON when config is missing apiKey", async () => {
    const adapter = await startAdapter();
    const fixture = await fixtureFor(adapter, { omitApiKey: true });

    const result = await runCli({
      args: ["generate", "no key"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toMatch(/API key/i);
    expect(result.stdout).not.toContain("test-key");
  });

  it("returns wait_timeout with taskId retained", async () => {
    const adapter = await startAdapter();
    adapter.setDefaultScript({ kind: "always", status: "running" });
    const fixture = await fixtureFor(adapter, {
      timeoutMs: 200,
      pollIntervalMs: 40,
    });

    const result = await runCli({
      args: ["generate", "hang forever", "--timeout", "150", "--poll-interval", "40"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
      timeoutMs: 10_000,
    });

    expect(result.exitCode).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(false);
    expect(payload.taskId).toMatch(/^task-offline-/);
    expect(payload.status).toBe("running");
    expect(payload.error.code).toBe("wait_timeout");
  });

  it("exits non-zero when upstream task fails", async () => {
    const adapter = await startAdapter();
    adapter.setDefaultScript({
      kind: "sequence",
      statuses: ["running", "failed"],
      failMessage: "content policy",
    });
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: ["generate", "will fail", "--poll-interval", "20", "--timeout", "10000"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(false);
    expect(payload.status).toBe("failed");
    expect(payload.error.message).toMatch(/content policy|failed/i);
    expect(payload.taskId).toBeTruthy();
  });

  it("supports --no-save (videoUrl only, no path)", async () => {
    const adapter = await startAdapter();
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: ["generate", "--no-save", "url only", "--poll-interval", "20", "--timeout", "10000"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(true);
    expect(payload.videoUrl).toBeTruthy();
    expect(payload.path).toBeUndefined();
    // Download endpoint should not have been hit
    expect(adapter.captures.some((c) => c.url.startsWith("/fixture/"))).toBe(false);
  });

  it("rejects text+audio-only before calling the API", async () => {
    const adapter = await startAdapter();
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: ["generate", "--ref-audio", "https://cdn.example/a.mp3", "voice over"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toMatch(/Text \+ audio/i);
    expect(adapter.captures.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("never prints full API keys in stdout or stderr", async () => {
    const adapter = await startAdapter();
    const secret = "sk-super-secret-offline-key-xyz";
    const fixture = await fixtureFor(adapter, { apiKey: secret });

    const result = await runCli({
      args: ["generate", "--no-wait", "secret hygiene"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain(secret);
    expect(result.stderr).not.toContain(secret);
  });

  it("passes --model through even when not in the static catalog", async () => {
    const adapter = await startAdapter();
    const fixture = await fixtureFor(adapter);

    const result = await runCli({
      args: ["generate", "--no-wait", "--model", "doubao-seedance-1-0-pro-250528", "legacy id"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });

    expect(result.exitCode).toBe(0);
    const create = adapter.captures.find((c) => c.method === "POST");
    const body = JSON.parse(create!.bodyText);
    expect(body.model).toBe("doubao-seedance-1-0-pro-250528");
  });

  // silence unused import when tree-shaken; bytes used for size sanity in download path
  it("downloaded file size matches adapter payload", async () => {
    const adapter = await startAdapter();
    const fixture = await fixtureFor(adapter);
    const result = await runCli({
      args: ["generate", "size check", "--poll-interval", "20", "--timeout", "10000"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });
    const payload = JSON.parse(result.stdout);
    const { readFileSync } = await import("node:fs");
    const written = readFileSync(payload.path);
    expect(written.byteLength).toBe(TINY_MP4_BYTES.byteLength);
  });
});
