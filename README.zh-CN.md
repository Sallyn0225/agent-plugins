# Agent Plugins

> English: [README.md](./README.md)

面向编程代理、与 Host 无关的**能力插件（Capability Plugin）**。每个可独立版本化的包提供一项由本仓库维护的能力，并按实际需要组合**库**、**CLI**、**MCP** 与 **Agent Skill** 交付接口。

本仓库是实现 monorepo，不是第三方插件目录。英文 README 是规范来源；中文对应文档保持相同结构、命令与技术事实。

<!-- agent-plugins:catalog:start -->

## 能力插件

包版本以 npm 为准，本页不镜像当前版本号。

| 能力 | 包 | 成熟度 | 交付接口 | 验证范围 |
| --- | --- | --- | --- | --- |
| Image Generation | [`@sallyn0225/image-gen`](packages/image-gen) | 稳定 | 库、CLI、MCP、Agent Skill | 自动化：unit、offline-cli、offline-mcp、docs、metadata；仅手动在线 Provider 冒烟 |

交付接口的协议兼容性并不等于已对真实 Host 或 Provider 做持续验证。各插件 README 会说明实际测过什么。

<!-- agent-plugins:catalog:end -->

## 文档导航

| 指南 | 适用读者 |
| --- | --- |
| [图像生成插件](packages/image-gen/README.zh-CN.md) | 使用库、CLI、MCP 服务或 Agent Skill 的用户 |
| [参与贡献](CONTRIBUTING.md) | 贡献者与新插件提案人 |
| [开发](DEVELOPMENT.md) | 本地设置、命令与仓库规则 |
| [测试](TESTING.md) | 离线检查、公共接口与手动在线冒烟 |
| [创建能力插件](docs/creating-a-capability-plugin.md) | 已获批准的插件作者 |
| [架构](docs/architecture.md) | 面向能力的设计与术语 |
| [发布](RELEASING.md) | 发布独立版本的维护者 |
| [安全](SECURITY.md) | 私密漏洞报告与支持版本 |
| [行为准则](CODE_OF_CONDUCT.md) | 社区行为与执行方式 |

## 仓库布局

```text
packages/                       能力插件 workspace
templates/capability-plugin/    非 workspace 起步模板
docs/                           架构与作者指南
scripts/                        校验与目录生成工具
tests/                          仓库级公共接口测试
```

能力插件拥有自己的实现、规范 Skill、用户文档、测试与发布元数据；在后续质量工作完成测试归位前，迁移期仓库级测试仍可能位于 `tests/`。预期边界详见[架构文档](docs/architecture.md)。

## 安装插件

当前稳定插件要求 Node.js 22 或更高版本：

```bash
npm install --global @sallyn0225/image-gen
image-gen list

# 或不全局安装
npx -y @sallyn0225/image-gen --help
```

安装与配置细节在各包指南中说明；可从 [image-gen 中文指南](packages/image-gen/README.zh-CN.md)开始。

## 参与贡献

欢迎错误修复、测试、文档与已批准的功能开发。新能力插件必须先提出方案并获得维护者接受；只按实际用途选择交付接口，不为结构对称而实现接口。

提交拉取请求前，请阅读[参与贡献](CONTRIBUTING.md)、[开发](DEVELOPMENT.md)与[测试](TESTING.md)。

## 安全

不要在公开 Issue 中报告漏洞或凭据。请按[安全策略](SECURITY.md)使用 [GitHub Private Vulnerability Reporting](https://github.com/Sallyn0225/agent-plugins/security/advisories/new)。

## 许可证

[MIT](LICENSE) © Sallyn0225。
