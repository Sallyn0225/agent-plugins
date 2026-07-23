# Contributing

Thank you for improving Agent Plugins. This repository is a self-maintained collection of host-independent Capability Plugins, not a directory of unrelated third-party plugins.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). For vulnerabilities, use the private process in [SECURITY.md](SECURITY.md), not a public issue.

## Ways to Contribute

Welcome contributions include:

- reproducible bug fixes;
- tests that cover public behavior;
- documentation and accessibility improvements;
- dependency and maintenance improvements; and
- feature work that a maintainer has approved.

New Capability Plugins require proposal and maintainer acceptance before implementation. Inclusion means the repository maintainers can own and support the plugin; this project is not a public listing service.

## Before You Start

Search [GitHub Issues](https://github.com/Sallyn0225/agent-plugins/issues) before opening a duplicate. Open an issue for a bug, substantial feature, public-interface change, or new plugin proposal. Small documentation corrections may go directly to a pull request.

Do not include credentials, private endpoints, generated images, local configuration, or undisclosed vulnerability details. The minimum development runtime is Node.js 22.

## Development Workflow

1. Fork and branch from `main`.
2. Run `npm install` from the repository root.
3. Make the smallest coherent change and add public-interface tests where behavior changes.
4. Run the checks described in [TESTING.md](TESTING.md) and [DEVELOPMENT.md](DEVELOPMENT.md).
5. Add a Changeset for user-visible changes to a publishable package; documentation-only and internal repository changes normally do not need one.
6. Update English documentation first, then keep its Chinese README counterpart structurally and factually aligned.

Never edit generated catalog blocks by hand. Update plugin metadata, run the catalog generator, and commit both generated blocks.

## Pull Requests

Use a [Conventional Commit](https://www.conventionalcommits.org/) pull-request title, because squash-merged history uses that title. Explain the problem, the public behavior affected, verification performed, and any compatibility or release impact. Link the approved issue when one exists.

Changesets, not commit messages, are authoritative for package versions and English changelogs. Keep pull requests focused; do not combine unrelated cleanup. CI must pass on Ubuntu and Windows without real Provider credentials or external network access.

## Proposing a Capability Plugin

Open an issue before writing a new plugin. Describe:

- the capability and intended users;
- why it belongs in this self-maintained repository;
- the proposed Library, CLI, MCP, and/or Agent Skill Delivery Interfaces;
- Provider or external-service boundaries;
- offline verification and live-verification policy; and
- long-term maintenance expectations.

Do not add interfaces merely for symmetry. After acceptance, follow [Creating a Capability Plugin](docs/creating-a-capability-plugin.md).
