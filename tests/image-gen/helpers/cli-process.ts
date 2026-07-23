import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Resolve the repository independently of the caller's workspace cwd. */
const REPO_ROOT = resolve(import.meta.dirname, "../../..");
export const IMAGE_GEN_CLI = resolve(REPO_ROOT, "packages/image-gen/dist/cli.js");
export const IMAGE_GEN_MCP = resolve(REPO_ROOT, "packages/image-gen/dist/mcp.js");

export function assertBuiltBinaries(): void {
  if (!existsSync(IMAGE_GEN_CLI)) {
    throw new Error(
      `Built CLI missing at ${IMAGE_GEN_CLI}. Run: npm run build -w @sallyn0225/image-gen`,
    );
  }
  if (!existsSync(IMAGE_GEN_MCP)) {
    throw new Error(
      `Built MCP binary missing at ${IMAGE_GEN_MCP}. Run: npm run build -w @sallyn0225/image-gen`,
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
  /** Optional stdin data to write then end. */
  stdin?: string;
}

/**
 * Spawn the built image-gen CLI as a black-box child process.
 * Uses `process.execPath` + absolute script path — no shell, works on Ubuntu and Windows.
 */
export async function runCli(options: RunCliOptions = {}): Promise<CliResult> {
  assertBuiltBinaries();
  const { args = [], env, cwd = REPO_ROOT, timeoutMs = 30_000, stdin } = options;

  return new Promise<CliResult>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [IMAGE_GEN_CLI, ...args], {
      cwd,
      env: sanitizeEnv(env),
      // Never use a shell — cross-platform requirement.
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
      // Force-kill if still alive shortly after.
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 1_000).unref();
      reject(new Error(`CLI timed out after ${timeoutMs}ms: image-gen ${args.join(" ")}`));
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
 * Build a clean env for child processes: strip host secrets, force IMAGE_GEN_CONFIG,
 * and avoid inheriting accidental local config that would hit real providers.
 */
export function sanitizeEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {
    ...process.env,
    // Ensure children don't pick up interactive terminal quirks.
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };

  // Drop any host config/env that could point at real providers.
  delete base.IMAGE_GEN_CONFIG;
  delete base.IMAGE_GEN_MCP_CONFIG;
  delete base.AGENT_TOOLING_IMAGE_GEN_CONFIG;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete base[key];
    } else {
      base[key] = value;
    }
  }

  return base;
}

export interface McpSpawnParams {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
}

/**
 * Parameters suitable for MCP SDK StdioClientTransport.
 * Spawns the built MCP binary (or CLI mcp alias) without a shell.
 */
export function mcpSpawnParams(options: {
  /** "mcp" binary or "cli" with mcp alias. Default: mcp binary. */
  entry?: "mcp" | "cli-mcp" | "cli-serve" | "cli-default";
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}): McpSpawnParams {
  assertBuiltBinaries();
  const entry = options.entry ?? "mcp";
  const cwd = options.cwd ?? REPO_ROOT;
  const envRecord = sanitizeEnv(options.env);

  // StdioClientTransport requires Record<string, string> (no undefined values).
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(envRecord)) {
    if (typeof v === "string") env[k] = v;
  }

  if (entry === "mcp") {
    return { command: process.execPath, args: [IMAGE_GEN_MCP], env, cwd };
  }
  if (entry === "cli-mcp") {
    return { command: process.execPath, args: [IMAGE_GEN_CLI, "mcp"], env, cwd };
  }
  if (entry === "cli-serve") {
    return { command: process.execPath, args: [IMAGE_GEN_CLI, "serve"], env, cwd };
  }
  // Default: bare CLI with no args starts MCP.
  return { command: process.execPath, args: [IMAGE_GEN_CLI], env, cwd };
}
