import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { discoverPlugins } from "./discover.js";
import {
  isCatalogFresh,
  renderChineseCatalog,
  renderEnglishCatalog,
  upsertCatalogSection,
} from "./catalog.js";

export type CatalogGenerateOptions = {
  repoRoot: string;
  check?: boolean;
};

export type CatalogGenerateResult = {
  ok: boolean;
  changed: string[];
  stale: string[];
};

export async function generateCatalogs(
  options: CatalogGenerateOptions,
): Promise<CatalogGenerateResult> {
  const { repoRoot, check = false } = options;
  const plugins = await discoverPlugins(repoRoot);
  const targets = [
    {
      relative: "README.md",
      render: renderEnglishCatalog,
    },
    {
      relative: "README.zh-CN.md",
      render: renderChineseCatalog,
    },
  ] as const;

  const changed: string[] = [];
  const stale: string[] = [];

  for (const target of targets) {
    const abs = path.join(repoRoot, target.relative);
    let current = "";
    try {
      current = await readFile(abs, "utf8");
    } catch {
      if (check) {
        stale.push(target.relative);
        continue;
      }
      current = "";
    }

    const catalog = target.render(plugins);
    if (isCatalogFresh(current, catalog)) {
      continue;
    }

    if (check) {
      stale.push(target.relative);
      continue;
    }

    const next = upsertCatalogSection(current, catalog);
    await writeFile(abs, next.endsWith("\n") ? next : `${next}\n`, "utf8");
    changed.push(target.relative);
  }

  return {
    ok: stale.length === 0,
    changed,
    stale,
  };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const check = argv.includes("--check");
  const positional = argv.filter((a) => a !== "--check");
  const repoRoot = path.resolve(positional[0] ?? process.cwd());
  const result = await generateCatalogs({ repoRoot, check });

  if (check) {
    if (result.ok) {
      console.log("Catalog sections are up to date.");
      return 0;
    }
    console.error(
      `Catalog sections are stale: ${result.stale.join(", ")}. Run: npm run catalog:generate`,
    );
    return 1;
  }

  if (result.changed.length === 0) {
    console.log("Catalog sections already up to date.");
  } else {
    console.log(`Updated catalog sections: ${result.changed.join(", ")}`);
  }
  return 0;
}

const isCliEntry =
  process.argv[1] !== undefined &&
  /generate-catalog\.(ts|js|mts|mjs|cjs)$/.test(
    process.argv[1].replace(/\\/g, "/"),
  );

if (isCliEntry) {
  main().then((code) => {
    process.exitCode = code;
  });
}
