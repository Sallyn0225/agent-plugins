# Security Policy

## Supported Versions

Only the latest major version of each Capability Plugin receives security fixes. Older majors may remain available but are not formally supported.

## Reporting a Vulnerability

Report vulnerabilities privately through [GitHub Private Vulnerability Reporting](https://github.com/Sallyn0225/agent-plugins/security/advisories/new).

Do **not** open a public issue, discussion, or pull request containing vulnerability details, credentials, private endpoints, or proof-of-concept secrets. Include the affected package and version, impact, reproduction steps, and any suggested mitigation. The maintainers will acknowledge the report, investigate it, coordinate disclosure, and communicate remediation status through the private advisory.

If Private Vulnerability Reporting is unavailable, do not disclose the issue publicly; use the repository owner's private GitHub contact channel to request a secure reporting path.

## Handling Sensitive Data

Never commit or attach API keys, tokens, real Provider configuration, generated private images, or logs containing secrets. Use minimal synthetic fixtures and redact endpoints and identifiers. Deprecation warnings, CLI errors, MCP responses, tests, and documentation must not expose credentials.

Normal tests and pull-request checks run offline without real Provider secrets. Manual live smoke uses protected credentials, is networked and potentially billable, and must not print secrets or upload its outputs as public artifacts.
