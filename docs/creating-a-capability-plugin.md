# Creating a Capability Plugin

This guide explains how to start a new **Capability Plugin** in the Agent Plugins monorepo.

A Capability Plugin is an independently versioned module. CLI, MCP, and Agent Skill are optional **Delivery Interfaces**. Do not invent empty adapters only for symmetry.

## 1. Copy the template

The template lives outside the npm workspace so it is never published:

```text
templates/capability-plugin/
```

Copy it into the workspace:

```bash
cp -R templates/capability-plugin packages/my-capability
```

On Windows PowerShell:

```powershell
Copy-Item -Recurse templates/capability-plugin packages/my-capability
```

## 2. Replace placeholders

Replace every placeholder in the new package:

| Placeholder | Example |
| --- | --- |
| `__CAPABILITY_ID__` | `my-capability` |
| `__CAPABILITY_DISPLAY_NAME__` | `My Capability` |
| `__CAPABILITY_DESCRIPTION__` | `Does one useful thing for coding agents.` |

Rules:

- Package name must be `@sallyn0225/<id>`
- Capability `id` must match the package name suffix
- Skill directory name and `SKILL.md` frontmatter `name` must match the capability id
- License must remain `MIT`
- `engines.node` must require Node.js 22+
- Repository URL must reference `github.com/Sallyn0225/agent-plugins`

## 3. Fill in `agentPlugin` metadata

`package.json` must include a versioned `agentPlugin` object. Standard npm fields remain authoritative for `name`, `version`, `description`, `license`, `repository`, `engines`, `bin`, and `exports` — do **not** duplicate them inside `agentPlugin`.

Minimum shape:

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
      "automated": ["unit", "offline-cli", "metadata", "docs", "package-contents"],
      "liveProviders": "none"
    }
  }
}
```

### Maturity

- `experimental` — early, may change
- `stable` — supported public surface
- `deprecated` — scheduled for removal

### Delivery Interfaces

| Flag | When to set true |
| --- | --- |
| `library` | Package exports a programmatic API |
| `cli` | Package declares `bin` entrypoints |
| `mcp` | Package exposes MCP tools (also require `mcp.transport` + `mcp.tools`) |
| `skill` | Package ships an open Agent Skills `SKILL.md` |

### Skill packaging

- One canonical Skill copy lives inside the package
- Path is package-relative, usually `skills/<id>`
- File must be `SKILL.md` with `name` + `description` frontmatter
- Include the skill path in `package.json` `files` so it ships in the npm tarball

### Verification

- `verification.automated` lists what CI/local automation covers
- `verification.liveProviders` is `none`, `manual`, or `ci`
- Protocol compatibility is not the same as continuous Host/Provider verification

## 4. Provide bilingual package READMEs

Every publishable plugin needs:

- `README.md` (canonical English)
- `README.zh-CN.md` (Chinese counterpart)

Link each to the other at the top.

## 5. Validate and refresh the catalog

From the repository root:

```bash
npm run validate:plugins
npm run catalog:generate
npm run catalog:check
```

`validate:plugins` cross-checks:

- package naming (`@sallyn0225/<id>`)
- binaries when CLI is enabled
- Skill presence and Agent Skills frontmatter
- Skill inclusion in `files`
- Node engine baseline
- MIT license
- repository identity
- bilingual README presence

`catalog:generate` rewrites only the marked catalog sections in the root READMEs from plugin metadata. It does **not** embed package versions.

## 6. Optional MCP surface

If you enable MCP:

1. Set `interfaces.mcp` to `true`
2. Add `mcp.transport` (currently `stdio`) and `mcp.tools`
3. Ship a real MCP server entry (binary or documented command)
4. Cover offline MCP behavior in tests when the repository quality gates require it

## 7. Keep the template out of workspaces

Do not add `templates/*` to root `package.json` `workspaces`. The template is scaffolding only.

## Related commands

| Command | Purpose |
| --- | --- |
| `npm run validate:plugins` | Validate all Capability Plugin manifests and package contracts |
| `npm run catalog:generate` | Write generated catalog sections |
| `npm run catalog:check` | Fail if catalog sections are stale |
| `npm test` | Run repository tests, including contract tests |
