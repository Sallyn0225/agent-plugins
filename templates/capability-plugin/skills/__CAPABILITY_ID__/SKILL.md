---
name: __CAPABILITY_ID__
description: __CAPABILITY_DESCRIPTION__ Use this skill whenever the user needs this capability through the local CLI.
---

# __CAPABILITY_DISPLAY_NAME__

Use the **`__CAPABILITY_ID__` CLI** from the `@sallyn0225/__CAPABILITY_ID__` package.

## Locate the CLI

```bash
__CAPABILITY_ID__ --help
# or
npx -y @sallyn0225/__CAPABILITY_ID__ --help
```

## Agent workflow

1. Confirm the user intent matches this capability.
2. Run the CLI with explicit flags.
3. Report real command output to the user.
4. Do not invent success or fabricate results.
