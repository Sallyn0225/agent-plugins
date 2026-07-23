import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Resolve the repository independently of the caller's workspace cwd. */
const REPO_ROOT = resolve(import.meta.dirname, "../../..");
export const VIDEO_GEN_CLI = resolve(REPO_ROOT, "packages/video-gen/dist/cli.js");

export function assertBuiltBinaries(): void {
  if (!existsSync(VIDEO_GEN_CLI)) {
    throw new Error(
      `Built CLI missing at ${VIDEO_GEN_CLI}. Run: npm run build -w @sallyn0225/video-gen`,
    );
  }
}

export interface CliResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface RunCliOptions {
  args?: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** Kill the process after this many ms (default: 30_000). */
  timeoutMs?: number;
  stdin?: string;
}

/**
 * Spawn the built video-gen CLI as a black-box child process.
 * Uses process.execPath + absolute script path — no shell.
 */
export async function runCli(options: RunCliOptions = {}): Promise<CliResult> {
  assertBuiltBinaries();
  const { args = [], env, cwd = REPO_ROOT, timeoutMs = 30_000, stdin } = options;

  return new Promise<CliResult>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [VIDEO_GEN_CLI, ...args], {
      cwd,
      env: sanitizeEnv(env),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 1_000).unref();
      reject(new Error(`CLI timed out after ${timeoutMs}ms: video-gen ${args.join(" ")}`));
    }, timeoutMs);
    timer.unref?.();

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ exitCode, signal, stdout, stderr });
    });

    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

/**
 * Clean env for child processes: strip host secrets, force VIDEO_GEN_CONFIG isolation.
 */
export function sanitizeEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {
    ...process.env,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };

  delete base.VIDEO_GEN_CONFIG;
  delete base.VIDEO_GEN_API_KEY;
  delete base.ARK_API_KEY;
  delete base.VIDEO_GEN_BASE_URL;
  delete base.VIDEO_GEN_DEFAULT_MODEL;
  delete base.VIDEO_GEN_OUTPUT_DIR;
  delete base.VIDEO_GEN_TIMEOUT_MS;
  delete base.VIDEO_GEN_POLL_INTERVAL_MS;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete base[key];
    } else {
      base[key] = value;
    }
  }

  return base;
}
