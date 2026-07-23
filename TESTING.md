# Testing

## Testing Principles

Test behavior through the highest practical public interface used by a real caller. Avoid assertions about private helpers, internal call order, or implementation details that can change without affecting users. Tests must be deterministic, credential-free, and cross-platform.

## Public Test Seams

- **Monorepo:** root lifecycle commands, metadata validation, documentation contracts, catalog freshness, and packed tarballs.
- **Library:** exported configuration and high-level generation/editing operations.
- **CLI:** built binaries as child processes, including exit codes, JSON stdout, and stderr separation.
- **MCP:** an MCP SDK client over stdio, including initialization, advertised tools, schemas, results, errors, and framing.
- **Provider:** a local HTTP adapter on a random port, reached through high-level operations rather than mocked internal functions.

Use fixed tiny-image fixtures and temporary operating-system directories. Cover success, error, timeout, and abort outcomes without persistent generated output.

## Offline Tests

Required pull-request tests use no external network, API keys, or paid services. The local Provider Adapter verifies OpenAI-compatible generation and editing, multipart behavior and fallback, Gemini content, URL and base64 responses, multiple images, masks, custom headers, malformed responses, HTTP errors, timeouts, and aborts.

Offline smoke runs the built CLI and MCP binaries end to end on Ubuntu and Windows. Protocol compatibility proven by these tests must not be described as continuous verification of a real Host or Provider.

## Live Provider Smoke

Live smoke is an explicit manual operation for maintainers. It is networked, requires protected Provider credentials, and may incur charges. It is never a required pull-request check and does not establish that every Provider or Host is continuously supported.

Review the target, credentials, model, expected cost, and output location before running:

```bash
npm run smoke:live
```

## Commands

```bash
npm run typecheck
npm test
npm run build
npm run smoke:offline
npm run validate:plugins
npm run catalog:check
```

The approved repository gate additionally includes formatting, linting, documentation validation, package-content validation, and Changesets status. Follow-up quality and release work adds any corresponding root scripts that are not yet available. See [Development](DEVELOPMENT.md) for current command navigation and [the image-gen guide](packages/image-gen/README.md#development) for package-specific checks.
