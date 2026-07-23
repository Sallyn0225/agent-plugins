# Development

## Prerequisites

- Node.js 22 or newer
- npm with workspace support
- Git

No real Provider credentials are required for normal development or pull-request checks.

## Repository Structure

```text
packages/                       publishable Capability Plugin workspaces
templates/capability-plugin/    non-workspace starter template
docs/                           architecture and author guidance
scripts/agent-plugin/           metadata validation and catalog generation
scripts/docs/                   documentation validation
tests/                          repository-level public-interface tests
```

A Capability Plugin owns its implementation, tests, canonical Skill, user documentation, and release metadata. See [Architecture](docs/architecture.md).

## Setup

```bash
git clone https://github.com/Sallyn0225/agent-plugins.git
cd agent-plugins
npm install
npm run build
npm test
```

Run commands from the repository root unless a guide explicitly says otherwise.

## Common Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Build all workspaces that provide a build script |
| `npm run typecheck` | Type-check repository and workspace TypeScript |
| `npm test` | Run the Vitest suite |
| `npm run smoke:offline` | Exercise built public CLI and MCP interfaces without external services |
| `npm run smoke:live` | Manually contact a real Provider; networked and potentially billable |
| `npm run validate:plugins` | Validate plugin metadata and package contracts |
| `npm run catalog:generate` | Regenerate only marked root catalog sections |
| `npm run catalog:check` | Check that generated catalogs are current |

The approved repository quality contract also covers formatting, linting, documentation, package contents, and Changesets status. Some of those root gates and cross-platform CI are introduced by follow-up quality/release work; do not treat an unavailable command as a current check.

## Architecture Rules

- Organize around independently versioned Capability Plugins, not Host-specific integrations.
- Add only useful Delivery Interfaces. Library, CLI, MCP, and Agent Skill are optional individually.
- Keep capability logic in the package core and make Delivery Interfaces thin adapters.
- Prefer existing high-level and Provider seams over speculative abstractions.
- Keep one canonical open-format Agent Skill inside its publishable package.
- Treat standard npm metadata as authoritative; do not duplicate it in `agentPlugin`.
- Preserve documented public contracts unless an approved migration says otherwise.

## Local and Generated Data

Do not commit credentials, `config.local.json`, generated images, build output, or machine-specific settings. Ignored `.agents/`, `.claude/`, local configuration, and generated output belong to the local user and are not cleanup targets.

Root README catalog blocks are generated artifacts. Change package metadata, then run `npm run catalog:generate`; do not rewrite the markers or surrounding generated block manually.
