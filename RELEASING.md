# Releasing

Releases are independently versioned per Capability Plugin. Changesets status is available through `npm run changeset:status`. The `release.yml` workflow prepares version pull requests and publishes reviewed versions; review of the Version Packages pull request and npm Trusted Publishing setup are manual gates.

## Versioning and Changesets

Use semantic versioning and add a Changeset for every user-visible package change. Changesets are authoritative for versions and English changelogs; Conventional Commit pull-request titles keep squash-merged history readable but do not determine versions.

The migration Changeset is applied while `@sallyn0225/image-gen` remains at 1.1.1 so that the Version Packages pull request produces exactly 2.0.0. Do not set that version manually in the migration branch.

Only the latest major version of each plugin receives formal support.

## Version Packages Pull Request

On a push to `main`, Changesets behaves in one of two ways: pending Changesets create or update a Version Packages pull request, while a commit with applied versions and no pending Changesets publishes unpublished packages. Therefore, merging the migration changes can only prepare the version pull request; it cannot publish image-gen 2.0.0. Publication becomes possible only after that generated pull request is reviewed and merged.

Before enabling Trusted Publishing, protect `main` against direct pushes and require at least one approving review for pull requests. The repository ruleset is the enforcement boundary for the review gate; the workflow intentionally reacts to accepted `main` commits rather than attempting to duplicate repository authorization policy.

Before merging the Version Packages release gate, verify:

- intended semantic versions and changelogs;
- lockfile changes;
- all required Ubuntu and Windows checks;
- packed contents, binaries, declarations, Skills, bilingual READMEs, examples, changelog, and license;
- exclusion of tests, fixtures, credentials, local configuration, and unintended development files; and
- completion of Trusted Publishing setup for the final repository identity.

For the first v2 release, confirm that the result is exactly `@sallyn0225/image-gen@2.0.0`.

## Trusted Publishing

Publish through GitHub Actions OIDC with the npm CLI version pinned in `.github/workflows/release.yml`. The workflow runs on a GitHub-hosted runner and grants `id-token: write`; it does not use `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or another long-lived npm credential. Trusted Publishing automatically supplies npm provenance for this public package.

Configure the publisher manually only after the renamed repository and `.github/workflows/release.yml` both exist on the default branch:

1. Open the settings for `@sallyn0225/image-gen` on npmjs.com and add a GitHub Actions Trusted Publisher.
2. Enter GitHub owner `Sallyn0225`, repository `agent-plugins`, and workflow filename `release.yml` exactly. Allow `npm publish`. Do not enter the full workflow path.
3. Confirm that repository and package metadata point directly to `https://github.com/Sallyn0225/agent-plugins`; the former repository redirect is not a valid substitute for the OIDC identity.
4. Remove obsolete automation tokens, if any, and set npm publishing access to require two-factor authentication while disallowing tokens.
5. Re-run required checks and review the generated version, changelog, lockfile, and packed contents before merging the Version Packages pull request.

Do not merge that first Version Packages pull request until these steps are complete. npm does not validate the publisher identity when it is saved, so an exact mismatch is discovered only when publication is attempted.

## Release Verification

After publication, verify:

1. npm shows the expected public package version, Node.js engine, and provenance;
2. `npm pack --dry-run` or the registry tarball contains all intended files and no secrets or tests;
3. `npx --yes @sallyn0225/image-gen@2.0.0 --help` starts the zero-install CLI successfully;
4. `git ls-remote --tags origin refs/tags/@sallyn0225/image-gen@2.0.0` reports the standard scoped-package tag;
5. the Changesets action created a GitHub Release named `@sallyn0225/image-gen@2.0.0`; and
6. `git ls-remote --tags origin refs/tags/image-gen-v1.1.1 refs/tags/image-gen-v1.1.1^{}` still reports the original annotated-tag object `1228fc77abdfcf17502238de8db79a5ed47bfadb` and peeled commit `855f5efe176be87c579647dcb297fac72ec88613`.

Do not claim release completion until npm, provenance, Git tag, GitHub Release, and distribution contents agree.

## Rollback

Never rewrite release tags or move the historical `image-gen-v1.1.1` tag. Prefer a corrective patch such as 2.0.1. For a severe defect, run `npm deprecate @sallyn0225/image-gen@2.0.0 "Use 1.1.1 until a corrective release is available"` and temporarily restore the prior safe default with `npm dist-tag add @sallyn0225/image-gen@1.1.1 latest`. Publish a corrective release and move `latest` forward again as soon as it is verified. Avoid unpublishing because it damages reproducibility and package history.
