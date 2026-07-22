# @sallyn0225/__CAPABILITY_ID__

> English: [README.md](./README.md)

__CAPABILITY_DESCRIPTION__

## 交付接口

| 接口 | 入口 | 说明 |
| --- | --- | --- |
| 库 | `@sallyn0225/__CAPABILITY_ID__` | 编程 API |
| CLI | `__CAPABILITY_ID__` | Shell / 代理回退 |
| Agent Skill | `skills/__CAPABILITY_ID__/SKILL.md` | 开放 Agent Skills 格式 |

MCP 是可选的。仅在真实 Host 需要结构化工具时启用。

## 安装

```bash
npm i -g @sallyn0225/__CAPABILITY_ID__
__CAPABILITY_ID__ --help
```

## 开发

本包是 Agent Plugins  monorepo 中的能力插件。

1. 替换所有 `__CAPABILITY_*__` 占位符。
2. 将目录移动到 `packages/__CAPABILITY_ID__/`。
3. 实现库与所选交付接口。
4. 在仓库根目录运行 `npm run validate:plugins`。
5. 运行 `npm run catalog:generate` 刷新根目录目录表。
