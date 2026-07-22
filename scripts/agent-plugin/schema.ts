import { z } from "zod";

/**
 * Versioned Capability Plugin metadata contract.
 *
 * Lives under package.json → `agentPlugin`.
 * Standard npm fields remain authoritative for name, version, description,
 * repository, license, engines, exports, and bin — this manifest must not
 * duplicate them.
 */
export const AGENT_PLUGIN_SCHEMA_VERSION = 1 as const;

export const MATURITY_VALUES = ["experimental", "stable", "deprecated"] as const;
export type Maturity = (typeof MATURITY_VALUES)[number];

export const DELIVERY_INTERFACES = ["library", "cli", "mcp", "skill"] as const;
export type DeliveryInterface = (typeof DELIVERY_INTERFACES)[number];

export const AUTOMATED_VERIFICATION_SCOPES = [
  "unit",
  "offline-cli",
  "offline-mcp",
  "package-contents",
  "docs",
  "metadata",
] as const;
export type AutomatedVerificationScope =
  (typeof AUTOMATED_VERIFICATION_SCOPES)[number];

export const LIVE_PROVIDER_POLICIES = ["none", "manual", "ci"] as const;
export type LiveProviderPolicy = (typeof LIVE_PROVIDER_POLICIES)[number];

export const SKILL_FORMATS = ["agent-skills"] as const;
export type SkillFormat = (typeof SKILL_FORMATS)[number];

export const MCP_TRANSPORTS = ["stdio"] as const;
export type McpTransport = (typeof MCP_TRANSPORTS)[number];

const nonEmpty = z.string().trim().min(1);

export const deliveryInterfacesSchema = z
  .object({
    library: z.boolean(),
    cli: z.boolean(),
    mcp: z.boolean(),
    skill: z.boolean(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some(Boolean),
    "at least one Delivery Interface must be true",
  );

export const mcpManifestSchema = z
  .object({
    transport: z.enum(MCP_TRANSPORTS),
    tools: z.array(nonEmpty).min(1),
  })
  .strict();

export const skillManifestSchema = z
  .object({
    format: z.enum(SKILL_FORMATS),
    /** Package-relative directory containing SKILL.md */
    path: nonEmpty,
  })
  .strict();

export const verificationManifestSchema = z
  .object({
    automated: z.array(z.enum(AUTOMATED_VERIFICATION_SCOPES)).min(1),
    liveProviders: z.enum(LIVE_PROVIDER_POLICIES),
  })
  .strict();

/**
 * Forbidden keys that would duplicate authoritative npm fields.
 * Kept as a deny-list so the schema stays intentional.
 */
const FORBIDDEN_DUPLICATE_KEYS = [
  "name",
  "version",
  "description",
  "license",
  "repository",
  "engines",
  "bin",
  "exports",
  "main",
  "types",
] as const;

export const agentPluginSchema = z
  .object({
    schemaVersion: z.literal(AGENT_PLUGIN_SCHEMA_VERSION),
    /** Capability identity; must match `@sallyn0225/<id>` package name suffix */
    id: z
      .string()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "id must be lowercase alphanumeric with single hyphens",
      ),
    displayName: nonEmpty,
    maturity: z.enum(MATURITY_VALUES),
    interfaces: deliveryInterfacesSchema,
    mcp: mcpManifestSchema.optional(),
    skill: skillManifestSchema.optional(),
    verification: verificationManifestSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.interfaces.mcp && !value.mcp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "interfaces.mcp is true but mcp metadata is missing",
        path: ["mcp"],
      });
    }
    if (!value.interfaces.mcp && value.mcp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mcp metadata is present but interfaces.mcp is false",
        path: ["mcp"],
      });
    }
    if (value.interfaces.skill && !value.skill) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "interfaces.skill is true but skill metadata is missing",
        path: ["skill"],
      });
    }
    if (!value.interfaces.skill && value.skill) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "skill metadata is present but interfaces.skill is false",
        path: ["skill"],
      });
    }
  });

export type AgentPlugin = z.infer<typeof agentPluginSchema>;
export type DeliveryInterfaces = z.infer<typeof deliveryInterfacesSchema>;
export type McpManifest = z.infer<typeof mcpManifestSchema>;
export type SkillManifest = z.infer<typeof skillManifestSchema>;
export type VerificationManifest = z.infer<typeof verificationManifestSchema>;

export function parseAgentPlugin(input: unknown): AgentPlugin {
  if (
    input &&
    typeof input === "object" &&
    !Array.isArray(input)
  ) {
    for (const key of FORBIDDEN_DUPLICATE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        throw new Error(
          `agentPlugin must not duplicate npm field "${key}"; keep it on package.json only`,
        );
      }
    }
  }
  return agentPluginSchema.parse(input);
}

export function safeParseAgentPlugin(input: unknown) {
  try {
    return { success: true as const, data: parseAgentPlugin(input) };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
