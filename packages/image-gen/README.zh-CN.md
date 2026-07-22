# @sallyn0225/image-gen

> English: [README.md](./README.md)

多供应商**图像生成与编辑**能力插件，同一核心上提供三种交付接口：

| 交付接口 | 入口 | 适用场景 |
|---------|-------|----------|
| **MCP** | `image-gen-mcp` | Claude Code、Codex、Cursor 等支持 MCP 的 Host |
| **CLI** | `image-gen` | 脚本、CI、无 MCP 的代理 |
| **Agent Skill** | 包内 `skills/image-gen/SKILL.md` | 教代理何时/如何调用 CLI |
| **Library** | `@sallyn0225/image-gen` | 在 TypeScript/JavaScript 中直接调用 |

## 安装

```bash
npm i -g @sallyn0225/image-gen

# 或不全局安装
npx -y @sallyn0225/image-gen list
npx -y @sallyn0225/image-gen generate --model gpt-image-2 "a red apple"
npx -y @sallyn0225/image-gen mcp
```

## 配置

每位用户使用**自己的** `baseUrl` 与 `apiKey`。不要提交 `config.local.json`。

优先环境变量：`IMAGE_GEN_CONFIG`。

完整配置、CLI、MCP、Skill、故障排除说明见英文 README 对应章节；中英文文档的技术事实保持一致。

完整指南：[README.md](./README.md)。
