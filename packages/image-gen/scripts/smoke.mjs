/**
 * LIVE / MANUAL smoke against real image Providers.
 *
 * Networked and potentially billable. Requires real credentials in config.
 * Never run as a required pull-request check.
 *
 * For deterministic offline verification of built CLI + MCP binaries, use:
 *   npm run smoke:offline
 * (from the repository root)
 */
import { runEdit, runGenerate, listModels } from "../dist/service.js";

const cmd = process.argv[2] || "generate";
const model = process.argv[3] || "gpt-image-2";
const arg4 = process.argv[4];
const arg5 = process.argv[5];

console.error("Models:", JSON.stringify(listModels(), null, 2));

if (cmd === "generate") {
  const prompt = arg4 || "a tiny red apple on white background";
  console.error(`generate model=${model}`);
  const started = Date.now();
  const { summary } = await runGenerate({ prompt, model });
  console.log(JSON.stringify({ ok: true, ms: Date.now() - started, ...summary }, null, 2));
  process.exit(0);
}

if (cmd === "edit") {
  const imagePath = arg4;
  const prompt = arg5 || "make it watercolor style";
  if (!imagePath) {
    console.error("Usage: node scripts/smoke.mjs edit <model> <imagePath> [prompt]");
    process.exit(1);
  }
  console.error(`edit model=${model} image=${imagePath}`);
  const started = Date.now();
  const { summary } = await runEdit({
    prompt,
    model,
    images: [{ path: imagePath }],
  });
  console.log(JSON.stringify({ ok: true, ms: Date.now() - started, ...summary }, null, 2));
  process.exit(0);
}

console.error("Usage: smoke.mjs generate|edit ...");
process.exit(1);
