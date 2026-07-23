# Creating a Capability Plugin

This guide applies after a maintainer accepts a new-plugin proposal. Agent Plugins is a self-maintained implementation monorepo, not a third-party plugin index.

## Copy the Template

The starter is outside the npm workspace and is never published directly:

```bash
cp -R templates/capability-plugin packages/my-capability
```

PowerShell:

```powershell
Copy-Item -Recurse templates/capability-plugin packages/my-capability
```

Do not add `templates/*` to the root workspaces list.

## Replace Placeholders

Replace every `__CAPABILITY_ID__`, `__CAPABILITY_DISPLAY_NAME__`, and `__CAPABILITY_DESCRIPTION__` value. Package names use `@sallyn0225/<id>`; the package suffix, manifest id, Skill directory, and `SKILL.md` frontmatter name must agree.

Keep Node.js 22 or newer, MIT licensing attributed to Sallyn0225, and the Agent Plugins repository identity. Standard npm fields remain authoritative for name, version, description, license, repository, engines, exports, and binaries.

## Choose Delivery Interfaces

Library, CLI, MCP, and Agent Skill are optional **Delivery Interfaces**. Enable only interfaces that make the capability useful; never add an empty adapter for symmetry. Keep capability logic in the package core and Delivery Interfaces thin.

When MCP is enabled, declare `mcp.transport` and stable tool names and ship a real server entry. When Skill is enabled, keep one canonical open Agent Skills copy at `skills/<id>/SKILL.md` and include it in package files.

## Fill in Plugin Metadata

Add the versioned `agentPlugin` object to `package.json`:

```json
{
  "agentPlugin": {
    "schemaVersion": 1,
    "id": "my-capability",
    "displayName": "My Capability",
    "maturity": "experimental",
    "interfaces": {
      "library": true,
      "cli": true,
      "mcp": false,
      "skill": true
    },
    "skill": {
      "format": "agent-skills",
      "path": "skills/my-capability"
    },
    "verification": {
      "automated": ["unit", "offline-cli", "metadata", "docs"],
      "liveProviders": "none"
    }
  }
}
```

Maturity is `experimental`, `stable`, or `deprecated`. Verification metadata must describe what automation actually checks. Protocol compatibility is not evidence of continuous testing with a real Host or Provider.

## Documentation Contract

Provide canonical English `README.md` and a complete, structurally aligned `README.zh-CN.md`, with mutual language links at the top. Both documents cover Delivery Interfaces, installation, configuration, CLI, MCP, Library, Agent Skill, compatibility and verification, migration, troubleshooting, development, and license. Mark an inapplicable interface honestly instead of deleting its section.

Keep commands and technical facts aligned. English is authoritative when resolving drift. If the plugin has migration rules or ordered technical facts that cannot be derived from `package.json`, add a package-owned `docs-contract.json`; the documentation checker discovers it without hard-coding the plugin at the repository level. Run the documentation checker before review.

## Add Public-Interface Tests

Test behavior through the highest practical interface used by a real caller: exported library operations, built CLI processes, MCP over stdio, and Provider behavior through a local adapter. Do not couple tests to private helpers or internal call order.

Required tests are deterministic, offline, credential-free, and cross-platform. Use temporary operating-system directories and synthetic fixtures. Keep live Provider smoke separate, manual, networked, and potentially billable.

## Validate and Refresh the Catalog

From the repository root:

```bash
npm run validate:plugins
npm run docs:check
npm run catalog:generate
npm run catalog:check
npm run typecheck
npm test
npm run build
npm run smoke:offline
```

The catalog generator rewrites only marked blocks in the root bilingual READMEs. Never edit generated rows by hand and never put package versions in the catalog.

## Packaging Requirements

The npm tarball must include built binaries and declarations for enabled interfaces, the canonical Skill when enabled, bilingual READMEs, configuration examples, changelog when present, and MIT license. It must exclude tests, fixtures, credentials, local configuration, generated output, and unrelated development files.

Add a Changeset for user-visible package changes. Changesets manage independent semantic versions and English changelogs; a Conventional Commit pull-request title does not replace a Changeset. See [Development](../DEVELOPMENT.md), [Testing](../TESTING.md), [Architecture](architecture.md), and [Releasing](../RELEASING.md).
