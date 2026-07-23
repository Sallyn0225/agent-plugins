# Releasing

Releases are independently versioned per Capability Plugin. Changesets status is available through `npm run changeset:status`. The approved release design uses automated publication, with review of the Version Packages pull request and npm Trusted Publishing setup as manual gates. Until that workflow is installed, publication remains a policy rather than an available automated release command.

## Versioning and Changesets

Use semantic versioning and add a Changeset for every user-visible package change. Changesets are authoritative for versions and English changelogs; Conventional Commit pull-request titles keep squash-merged history readable but do not determine versions.

The migration Changeset is applied while `@sallyn0225/image-gen` remains at 1.1.1 so that the Version Packages pull request produces exactly 2.0.0. Do not set that version manually in the migration branch.

Only the latest major version of each plugin receives formal support.

## Version Packages Pull Request

Merging ordinary changes may create or update a Version Packages pull request; it must not publish packages. Before merging that release gate, verify:

- intended semantic versions and changelogs;
- lockfile changes;
- all required Ubuntu and Windows checks;
- packed contents, binaries, declarations, Skills, bilingual READMEs, examples, changelog, and license;
- exclusion of tests, fixtures, credentials, local configuration, and unintended development files; and
- completion of Trusted Publishing setup for the final repository identity.

For the first v2 release, confirm that the result is exactly `@sallyn0225/image-gen@2.0.0`.

## Trusted Publishing

Publish through GitHub Actions OIDC with an npm CLI that supports Trusted Publishing. Do not store `NPM_TOKEN` or another long-lived npm publication token.

Rename the repository first. The release workflow must exist on the final repository's default branch before the owner configures npm's Trusted Publisher. npm's configured owner, repository name, and workflow filename must match exactly; a GitHub redirect from the former name is insufficient.

## Release Verification

After publication, verify:

1. npm shows the expected public package version, Node.js engine, and provenance;
2. `npm pack --dry-run` or the registry tarball contains all intended files and no secrets or tests;
3. a zero-install CLI invocation starts successfully;
4. the standard package tag, such as `@sallyn0225/image-gen@2.0.0`, exists;
5. a matching GitHub Release exists; and
6. historical tags such as `image-gen-v1.1.1` remain unchanged.

Do not claim release completion until npm, provenance, Git tag, GitHub Release, and distribution contents agree.

## Rollback

Never rewrite release tags. Prefer a corrective patch such as 2.0.1. For a severe defect, deprecate the affected npm version and temporarily move the `latest` dist-tag to the prior safe version. Avoid unpublishing because it damages reproducibility and package history.
