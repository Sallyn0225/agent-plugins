# Agent Plugins

> English: [README.md](./README.md)

面向编程代理的**主机无关能力插件**集合，仓库地址：[github.com/Sallyn0225/agent-plugins](https://github.com/Sallyn0225/agent-plugins)。

每个**能力插件（Capability Plugin）**都是可独立版本化的模块，可按需暴露 **库**、**CLI**、**MCP** 与 **Agent Skill** 等交付接口。不为了结构对称而强制实现无意义适配器。

<!-- agent-plugins:catalog:start -->

## 能力插件

包版本以 npm 为准，本页不镜像当前版本号。

| 能力 | 包 | 成熟度 | 交付接口 | 验证范围 |
| --- | --- | --- | --- | --- |
| Image Generation | [`@sallyn0225/image-gen`](packages/image-gen) | 稳定 | 库、CLI、MCP、Agent Skill | 自动化：unit、offline-cli、offline-mcp、package-contents、docs、metadata；仅手动在线 Provider 冒烟 |

交付接口的协议兼容性并不等于已对真实 Host 或 Provider 做持续验证。各插件 README 会说明实际测过什么。

<!-- agent-plugins:catalog:end -->

## 仓库布局

```text
.
├── packages/                      # 能力插件（npm workspaces）
│   └── image-gen/
├── templates/capability-plugin/   # 非 workspace 起步模板
├── scripts/agent-plugin/          # 元数据 schema、校验、目录生成
├── docs/creating-a-capability-plugin.md
└── README.md
```

## 安装插件

```bash
npm i -g @sallyn0225/image-gen
image-gen list

npx -y @sallyn0225/image-gen generate --model gpt-image-2 "a red apple"
npx -y @sallyn0225/image-gen mcp
```

完整说明见 [packages/image-gen/README.zh-CN.md](packages/image-gen/README.zh-CN.md)。

## 本地开发

```bash
npm install
npm run build
npm test
npm run validate:plugins
npm run catalog:check
```

## 新建能力插件

参见 [docs/creating-a-capability-plugin.md](docs/creating-a-capability-plugin.md)，并复制 `templates/capability-plugin/`。

## 设计原则

- Host 支持良好时优先 MCP。
- 需要 shell 或工作流回退时提供 CLI 与/或 Skill。
- 业务逻辑放在包核心；交付接口只做适配。
- Agent Skill 在可发布包内只保留一份规范副本。

## 许可证

MIT
