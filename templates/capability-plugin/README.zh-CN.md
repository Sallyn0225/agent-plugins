# @sallyn0225/__CAPABILITY_ID__

> English: [README.md](./README.md)

__CAPABILITY_DESCRIPTION__

## 交付接口

模板默认启用库、CLI 与 Agent Skill。只在 `package.json` 中保留真正有用的接口；不要为了结构对称添加空适配器。

| 接口 | 入口 |
| --- | --- |
| 库 | `@sallyn0225/__CAPABILITY_ID__` |
| CLI | `__CAPABILITY_ID__` |
| Agent Skill | `skills/__CAPABILITY_ID__/SKILL.md` |

## 安装

要求 Node.js 22 或更高版本。

```bash
npm install @sallyn0225/__CAPABILITY_ID__
npx @sallyn0225/__CAPABILITY_ID__ --help
```

## 配置

在此记录全部配置来源、默认值、优先级、环境变量与密钥处理要求。绝不能提交凭据或本地配置。

## CLI

记录命令、参数、退出码以及 stdout/stderr 契约。若元数据禁用 CLI，应明确说明不提供此接口。

## MCP

起步模板的元数据未启用 MCP。只有存在有用的结构化工具时才启用，并记录传输方式、启动配置、稳定工具名、schema 与错误行为；否则说明不提供 MCP。

## 库

记录公共包导出并提供面向调用方的最小示例。优先介绍高层操作，而不是私有辅助函数。

## Agent Skill

开放 Agent Skills 的规范文件是 [`skills/__CAPABILITY_ID__/SKILL.md`](./skills/__CAPABILITY_ID__/SKILL.md)，且必须发布到 npm tarball。若禁用 Skill，请同时移除元数据与产物并解释原因。

## 兼容性与验证范围

列出协议要求以及准确的自动和手动验证范围。协议兼容性不代表持续在真实 Host 或 Provider 上测试。必需检查应离线且不需要凭据；任何在线冒烟都应标为手动、联网且可能产生费用。

## 迁移

首次发布应说明无需迁移。后续版本需记录保留契约、弃用回退、警告、优先级与移除版本。

## 故障排除

记录常见安装、配置、接口、Provider 与输出问题，同时避免暴露凭据。

## 开发

替换所有占位符并将目录移动到 `packages/__CAPABILITY_ID__/` 后，在仓库根目录运行：

```bash
npm install
npm run validate:plugins
npm run docs:check
npm run catalog:generate
npm run typecheck
npm test
npm run build
```

参见[创建能力插件](../../docs/creating-a-capability-plugin.md)。

## 许可证

[MIT](./LICENSE) © Sallyn0225。
