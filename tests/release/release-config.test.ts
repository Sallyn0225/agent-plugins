import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const repoRoot = process.cwd();

async function readJson(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

async function readYaml(relativePath: string): Promise<Record<string, unknown>> {
  return parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

describe("release configuration", () => {
  it("manages publishable packages with independent Changesets versions", async () => {
    const changesetConfig = await readJson(".changeset/config.json");

    expect(changesetConfig).toMatchObject({
      changelog: "@changesets/cli/changelog",
      fixed: [],
      linked: [],
      access: "public",
      baseBranch: "main",
    });
  });

  it("prepares version pull requests and publishes through OIDC", async () => {
    const workflow = await readYaml(".github/workflows/release.yml");
    const rootPackage = await readJson("package.json");
    const rawWorkflow = await readFile(
      path.join(repoRoot, ".github/workflows/release.yml"),
      "utf8",
    );
    const releaseJob = (workflow.jobs as Record<string, Record<string, unknown>>).release;
    const steps = releaseJob.steps as Array<Record<string, unknown>>;
    const changesetsStep = steps.find((step) => step.uses === "changesets/action@v1");

    expect(workflow.on).toEqual({ push: { branches: ["main"] } });
    expect(workflow.permissions).toEqual({
      contents: "write",
      "pull-requests": "write",
      "id-token": "write",
    });
    expect(releaseJob["runs-on"]).toBe("ubuntu-latest");
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ run: "npm install --global npm@11.18.0" }),
        expect.objectContaining({ run: "npm run quality" }),
      ]),
    );
    const qualityStepIndex = steps.findIndex((step) => step.run === "npm run quality");
    const npmUpgradeStepIndex = steps.findIndex(
      (step) => step.run === "npm install --global npm@11.18.0",
    );
    expect(qualityStepIndex).toBeGreaterThanOrEqual(0);
    expect(npmUpgradeStepIndex).toBeGreaterThan(qualityStepIndex);
    expect(changesetsStep).toMatchObject({
      with: {
        publish: "npm run release",
        title: "chore: version packages",
        commit: "chore: version packages",
        createGithubReleases: true,
      },
      env: { GITHUB_TOKEN: "$" + "{{ secrets.GITHUB_TOKEN }}" },
    });
    expect((rootPackage.scripts as Record<string, string>).release).toBe("changeset publish");
    expect(rawWorkflow).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|npm_[A-Za-z0-9]{20,}/);
  });

  it("checks out complete LF-normalized history for cross-platform Changesets status", async () => {
    const qualityWorkflow = await readYaml(".github/workflows/quality.yml");
    const attributes = await readFile(path.join(repoRoot, ".gitattributes"), "utf8");
    const qualityJob = (qualityWorkflow.jobs as Record<string, Record<string, unknown>>).quality;
    const steps = qualityJob.steps as Array<Record<string, unknown>>;

    expect(steps).toContainEqual(
      expect.objectContaining({
        uses: "actions/checkout@v4",
        with: { "fetch-depth": 0 },
      }),
    );
    expect(attributes).toContain("* text=auto eol=lf");
  });

  it("establishes a local main base ref before running quality on pull requests", async () => {
    const qualityWorkflow = await readYaml(".github/workflows/quality.yml");
    const qualityJob = (qualityWorkflow.jobs as Record<string, Record<string, unknown>>).quality;
    const steps = qualityJob.steps as Array<Record<string, unknown>>;

    const checkoutIndex = steps.findIndex((step) => step.uses === "actions/checkout@v4");
    const prepareIndex = steps.findIndex(
      (step) =>
        typeof step.run === "string" &&
        step.run.includes("git update-ref refs/heads/main refs/remotes/origin/main"),
    );
    const qualityIndex = steps.findIndex((step) => step.run === "npm run quality");

    expect(prepareIndex).toBeGreaterThan(checkoutIndex);
    expect(prepareIndex).toBeLessThan(qualityIndex);
    expect(steps[prepareIndex].if).toBe("github.event_name == 'pull_request'");
    expect(steps[prepareIndex].run).toContain(
      "git fetch --no-tags origin main:refs/remotes/origin/main",
    );
  });

  it("checks npm and GitHub Actions dependencies every week", async () => {
    const dependabot = await readYaml(".github/dependabot.yml");

    expect(dependabot.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "package-ecosystem": "npm",
          directory: "/",
          schedule: { interval: "weekly" },
        }),
        expect.objectContaining({
          "package-ecosystem": "github-actions",
          directory: "/",
          schedule: { interval: "weekly" },
        }),
      ]),
    );
  });
});
