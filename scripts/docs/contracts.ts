export type SectionPairContract = {
  english: string;
  chinese: string;
  englishSections: string[];
  chineseSections: string[];
};

export const PACKAGE_README_SECTIONS = {
  english: [
    "Delivery Interfaces",
    "Installation",
    "Configuration",
    "CLI",
    "MCP",
    "Library",
    "Agent Skill",
    "Compatibility and Verification",
    "Migration",
    "Troubleshooting",
    "Development",
    "License",
  ],
  chinese: [
    "交付接口",
    "安装",
    "配置",
    "CLI",
    "MCP",
    "库",
    "Agent Skill",
    "兼容性与验证范围",
    "迁移",
    "故障排除",
    "开发",
    "许可证",
  ],
} as const;

export const README_CONTRACTS: SectionPairContract[] = [
  {
    english: "README.md",
    chinese: "README.zh-CN.md",
    englishSections: [
      "Capability Plugins",
      "Documentation",
      "Repository Layout",
      "Install a Plugin",
      "Contributing",
      "Security",
      "License",
    ],
    chineseSections: ["能力插件", "文档导航", "仓库布局", "安装插件", "参与贡献", "安全", "许可证"],
  },
  {
    english: "templates/capability-plugin/README.md",
    chinese: "templates/capability-plugin/README.zh-CN.md",
    englishSections: [...PACKAGE_README_SECTIONS.english],
    chineseSections: [...PACKAGE_README_SECTIONS.chinese],
  },
];

export const DOCUMENT_SECTION_CONTRACTS: Record<string, string[]> = {
  "CONTRIBUTING.md": [
    "Ways to Contribute",
    "Before You Start",
    "Development Workflow",
    "Pull Requests",
    "Proposing a Capability Plugin",
  ],
  "DEVELOPMENT.md": [
    "Prerequisites",
    "Repository Structure",
    "Setup",
    "Common Commands",
    "Architecture Rules",
    "Local and Generated Data",
  ],
  "TESTING.md": [
    "Testing Principles",
    "Public Test Seams",
    "Offline Tests",
    "Live Provider Smoke",
    "Commands",
  ],
  "RELEASING.md": [
    "Versioning and Changesets",
    "Version Packages Pull Request",
    "Trusted Publishing",
    "Release Verification",
    "Rollback",
  ],
  "SECURITY.md": ["Supported Versions", "Reporting a Vulnerability", "Handling Sensitive Data"],
  "CODE_OF_CONDUCT.md": [
    "Our Standards",
    "Unacceptable Behavior",
    "Scope",
    "Reporting and Enforcement",
    "Attribution",
  ],
  "docs/architecture.md": [
    "Vocabulary",
    "Decision",
    "Package Structure",
    "Delivery Interfaces",
    "Metadata and Catalog",
    "Testing",
    "Trade-offs",
  ],
  "docs/creating-a-capability-plugin.md": [
    "Copy the Template",
    "Replace Placeholders",
    "Choose Delivery Interfaces",
    "Fill in Plugin Metadata",
    "Documentation Contract",
    "Add Public-Interface Tests",
    "Validate and Refresh the Catalog",
    "Packaging Requirements",
  ],
};
