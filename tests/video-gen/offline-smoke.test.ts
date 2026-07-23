/**
 * Offline smoke: built video-gen CLI against a local Ark adapter.
 * No external network, real credentials, or billable calls.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertBuiltBinaries, runCli } from "./helpers/cli-process.js";
import { createOfflineFixture, offlineEnv, type OfflineFixture } from "./helpers/fixtures.js";
import { createSuccessAdapter, type LocalArkAdapter } from "./helpers/local-ark-adapter.js";

describe("offline smoke (built video-gen CLI vs local Ark adapter)", () => {
  let adapter: LocalArkAdapter;
  let fixture: OfflineFixture;

  beforeAll(async () => {
    assertBuiltBinaries();
    adapter = createSuccessAdapter();
    await adapter.start();
    fixture = await createOfflineFixture({
      baseUrl: adapter.baseUrl,
      pollIntervalMs: 40,
      timeoutMs: 10_000,
    });
  });

  afterAll(async () => {
    await adapter?.stop();
    await fixture?.cleanup();
  });

  it("CLI help starts without config or network", async () => {
    const result = await runCli({ args: ["--help"] });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("video-gen");
  });

  it("CLI models → generate → status against the local adapter", async () => {
    const models = await runCli({ args: ["models"] });
    expect(models.exitCode).toBe(0);
    const listed = JSON.parse(models.stdout);
    expect(listed.defaultModel).toBe("doubao-seedance-2-0-260128");

    const gen = await runCli({
      args: ["generate", "offline smoke video", "--poll-interval", "30", "--timeout", "8000"],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });
    expect(gen.exitCode).toBe(0);
    const genPayload = JSON.parse(gen.stdout);
    expect(genPayload.ok).toBe(true);
    expect(genPayload.path).toBeTruthy();
    expect(existsSync(genPayload.path)).toBe(true);

    const status = await runCli({
      args: ["status", genPayload.taskId],
      env: offlineEnv(fixture),
      cwd: fixture.cwd,
    });
    expect(status.exitCode).toBe(0);
    const statusPayload = JSON.parse(status.stdout);
    expect(statusPayload.status).toBe("succeeded");
  });
});
