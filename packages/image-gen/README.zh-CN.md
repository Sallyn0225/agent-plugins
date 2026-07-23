# @sallyn0225/image-gen

> English: [README.md](./README.md)

一个稳定的多 Provider 图像生成与编辑能力插件。它在同一个核心上提供四种交付接口，并支持兼容 OpenAI Images 与 Gemini 的 Provider 协议。

## 交付接口

| 接口 | 入口 | 适用场景 |
| --- | --- | --- |
| 库 | `@sallyn0225/image-gen` | 通过导出的配置、服务、Provider 与保存 API 集成 TypeScript/JavaScript 应用 |
| CLI | `image-gen` | 脚本、CI 与可使用 shell 的代理 |
| MCP | `image-gen-mcp` 或 `image-gen mcp` | 通过 stdio 工具接入 MCP Host |
| Agent Skill | `skills/image-gen/SKILL.md` | 教代理何时以及如何调用此能力 |

npm 包会发布两个二进制入口、类型声明、规范 Skill、中英双语 README、配置示例与 MIT 许可证。

## 安装

要求 Node.js 22 或更高版本。

全局安装二进制入口：

```bash
npm install --global @sallyn0225/image-gen
image-gen --help
image-gen-mcp
```

不全局安装，直接运行 CLI 或 MCP 服务：

```bash
npx -y @sallyn0225/image-gen list
npx -y @sallyn0225/image-gen generate --model gpt-image-2 "a red apple"
npx -y @sallyn0225/image-gen mcp
```

安装为库依赖：

```bash
npm install @sallyn0225/image-gen
```

## 配置

每位用户自行提供 Provider 端点与 API 密钥。不要提交真实密钥或 `config.local.json`。可从 [`config.example.json`](./config.example.json) 开始：

```json
{
  "defaultModel": "gpt-image-2",
  "outputDir": "./generated-images",
  "timeoutMs": 180000,
  "models": {
    "gpt-image-2": {
      "provider": "openai-images",
      "baseUrl": "https://your-gateway.example",
      "apiKey": "sk-your-key",
      "model": "gpt-image-2",
      "headers": {
        "X-Optional-Header": "value"
      }
    }
  }
}
```

`provider` 可为 `openai-images` 或 `gemini`。每个模型必须有 `baseUrl` 与 `apiKey`；`model` 默认采用别名键，`headers` 可选。顶层默认值为 `outputDir: "./generated-images"` 与 `timeoutMs: 180000`。

### 配置文件优先级

按照以下准确顺序选择第一个存在的配置文件：

1. `IMAGE_GEN_CONFIG`
2. 未设置 `IMAGE_GEN_CONFIG` 时使用 `IMAGE_GEN_MCP_CONFIG`（继续支持的品牌无关别名）
3. `./config.local.json`
4. `./config.json`
5. `./packages/image-gen/config.local.json`
6. `./packages/image-gen/config.json`
7. 包目录内的 `config.local.json`
8. 包目录内的 `config.json`
9. `~/.config/agent-plugins/image-gen.json`（首选用户默认路径）
10. `AGENT_TOOLING_IMAGE_GEN_CONFIG`（v2 兼容回退）
11. `~/.config/agent-tooling/image-gen.json`（v2 兼容回退）
12. `~/.config/image-gen/config.json`（通用回退）
13. `~/.config/image-gen-mcp/config.json`（通用回退）
14. `~/.image-gen.json`（通用回退）
15. `~/.image-gen-mcp.json`（通用回退）

当前工作目录可能与已安装包目录相同，因此重复候选路径没有影响。`~` 会展开为当前用户主目录。

加载文件后，环境变量会覆盖或新增模型设置：

- 共享变量：`IMAGE_GEN_BASE_URL`、`IMAGE_GEN_API_KEY`；
- 内置别名：`IMAGE_GEN_GPT_IMAGE_2_*`、`IMAGE_GEN_GROK_IMAGINE_IMAGE_*` 与 `IMAGE_GEN_GEMINI_3_1_FLASH_IMAGE_*`，后缀为 `BASE_URL`、`API_KEY`；
- 任意别名：`IMAGE_GEN_MODEL_<ALIAS>_BASE_URL`、`_API_KEY`、`_PROVIDER` 与 `_MODEL`（也支持 `_BASEURL` 与 `_KEY`）。`<ALIAS>` 中的 `_` 转为 `-`，`__` 转为 `/`。

`IMAGE_GEN_DEFAULT_MODEL`、`IMAGE_GEN_OUTPUT_DIR` 与 `IMAGE_GEN_TIMEOUT_MS` 会覆盖对应顶层文件值。相对输出目录从当前工作目录解析。

## CLI

`image-gen` 二进制支持 `list`、`generate`、`edit`、`mcp` 与 `serve` 别名。为保持向后兼容，不带命令运行时会启动 MCP stdio 服务。

```bash
image-gen list
image-gen generate --model gpt-image-2 "a red apple"
image-gen generate --model grok-imagine-image --aspect-ratio 16:9 "sunset city"
image-gen generate --model gemini-3.1-flash-image --image-size 1K "flat icon"
image-gen edit --model gemini-3.1-flash-image --image ./in.png "watercolor style"
image-gen edit --model gpt-image-2 --image ./in.png --mask ./mask.png "fill the masked area"
image-gen generate --no-save "return without writing files"
image-gen mcp
```

生成选项包括 `--model`、`--n`、`--size`、`--quality`、`--aspect-ratio`、`--image-size` 与 `--no-save`。编辑支持相同选项，另有可重复的 `--image`/`-i` 和可选 `--mask`。

成功的 `list`、`generate` 与 `edit` 操作向 **stdout** 输出可解析 JSON。生成操作的 JSON 包含操作、模型、Provider、保存路径、MIME 类型与字节数；编辑还会报告输入路径。诊断、弃用警告与错误写入 **stderr**，失败时退出码非零，因此不会污染 JSON 管道。帮助信息是供人阅读的文本，不是 JSON。

## MCP

可通过任一二进制启动 stdio 服务：

```bash
image-gen-mcp
# 等价命令
image-gen mcp
```

MCP Host 可使用 `npx` 配置，避免全局安装：

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "npx",
      "args": ["-y", "@sallyn0225/image-gen", "mcp"],
      "env": {
        "IMAGE_GEN_CONFIG": "C:/Users/YOU/.config/agent-plugins/image-gen.json"
      }
    }
  }
}
```

全局安装后也可改用 `"command": "image-gen-mcp"`。应在 Host 进程中配置环境变量；绝不能把日志写到 MCP stdout。

stdio 服务准确暴露三个稳定工具：

| 工具 | 用途 |
| --- | --- |
| `list_image_models` | 返回已配置别名、Provider 信息、默认值与掩码后的密钥 |
| `generate_image` | 根据 `prompt` 及可选模型、尺寸、质量、宽高比、响应与保存设置生成一张或多张图像 |
| `edit_image` | 根据 `prompt`、可选蒙版与共享生成设置编辑一个或多个路径/base64 图像 |

生成与编辑会返回文本和图像内容以及结构化摘要。工具失败会返回 MCP 错误结果。服务身份与版本来自包元数据。

## 库

根导出包含：

- 高层 `listModels`、`runGenerate` 与 `runEdit` 操作；
- `loadConfig`、`resolveModelConfig`、`maskSecret` 与 `LoadConfigOptions`；
- 底层 `generateImage`、`editImage` 与 `saveImages`；
- `getPackageVersion` 与 `getMcpServerMetadata`；
- `types.ts` 中所有公共类型，包括配置、请求、结果与图像类型。

普通集成应优先使用高层服务操作：

```ts
import { loadConfig, runEdit, runGenerate } from "@sallyn0225/image-gen";

const config = loadConfig();

const generated = await runGenerate({
  config,
  model: "gpt-image-2",
  prompt: "a red apple on white paper",
  save: false,
});

await runEdit({
  config,
  model: "gpt-image-2",
  prompt: "turn the apple green",
  images: [{ base64: generated.imagesBase64[0].data }],
  save: true,
});
```

包还声明了 `@sallyn0225/image-gen/cli` 与 `@sallyn0225/image-gen/mcp` 可执行子路径导出。它们是进程入口，不能替代根编程 API。

## Agent Skill

唯一的开放 Agent Skills 规范副本是 [`skills/image-gen/SKILL.md`](./skills/image-gen/SKILL.md)。它会发布到 npm tarball；仓库根目录没有镜像，也不维护 Host 专用副本。

安装后，可让兼容的代理或 Skill 加载器读取 `node_modules/@sallyn0225/image-gen/skills/image-gen/SKILL.md`，或把该规范目录复制到 Host 文档指定的位置。Skill 只教授工作流与 CLI 用法；Provider 凭据仍按上述配置规则提供。

## 兼容性与验证范围

各接口面向协议：

- CLI 适用于能够启动 Node.js 22 进程并分别消费 stdout/stderr 的环境。
- MCP 使用 MCP SDK 与 stdio。
- Agent Skill 遵循开放 Agent Skills `SKILL.md` 格式。
- Provider 适配器使用兼容 OpenAI Images 的生成/编辑 HTTP，或兼容 Gemini `generateContent` 的图像内容协议。

仓库自动化会离线验证库行为、配置契约、构建后的 CLI 行为、MCP 初始化/工具/协议帧、元数据与文档。Provider 行为通过本地 HTTP 适配器测试，无需外部网络、真实凭据或费用。

清单中的验证范围是 `unit`、`offline-cli`、`offline-mcp`、`docs` 与 `metadata`；在线策略是 `liveProviders: manual`。这些标识是目录元数据，不代表更广泛的测试声明。

这些验证证明公共接口与协议行为；它们**不表示**持续在 Claude Code、Codex、Cursor 或其他所有 Host 中测试，也不表示持续连接所有真实网关或 Provider。真实 Provider 冒烟仅手动执行、需要联网，并且可能产生费用。

## 迁移

v2 保留包名、`image-gen` 与 `image-gen-mcp` 二进制、CLI 命令与参数、JSON 输出契约、三个 MCP 工具名称与输入契约、配置结构、Provider 行为以及品牌无关的 `IMAGE_GEN_MCP_CONFIG` 别名。

新安装应使用 `IMAGE_GEN_CONFIG` 或 `~/.config/agent-plugins/image-gen.json`。

仅在 v2 迁移窗口中保留以下 Agent Tooling 品牌来源：

- `AGENT_TOOLING_IMAGE_GEN_CONFIG`；
- `~/.config/agent-tooling/image-gen.json`。

实际选中其中一个来源时，image-gen 会向 stderr 输出一次不含敏感信息的弃用警告。警告不会包含凭据，不会进入 CLI JSON stdout，也不会改变 MCP 协议帧。这两个旧回退会在 v3 移除，请在升级前迁移。“配置”中列出的通用回退路径是另一组不带品牌的兼容位置，不会产生该警告。

## 故障排除

- **“No image models configured.”** 创建首选配置文件，或通过模型环境变量同时提供 base URL 与 API key。确认进程与 shell 看到相同的主目录和环境。
- **加载了错误配置。** 检查上述有序列表。已存在的工作目录或包内文件优先于用户默认路径以及所有旧/通用路径。设置 `IMAGE_GEN_CONFIG` 可消除歧义。
- **“Unknown model.”** 运行 `image-gen list`，使用 `models` 对象中的别名，或设置 `defaultModel`/`IMAGE_GEN_DEFAULT_MODEL`。
- **脚本无法解析 JSON。** 只解析 stdout，不要把 stderr 合并到 stdout；警告与错误有意使用 stderr。
- **MCP Host 无法初始化。** 使用绝对配置路径，确认 Node.js 22+，在相同环境中运行配置命令，并确认 Host 保留 stdio 而不是包装输出。
- **请求超时。** 增加 `timeoutMs` 或 `IMAGE_GEN_TIMEOUT_MS`，并检查 Provider 端点与模型名。超时单位是毫秒。
- **图像未保存。** 检查 `outputDir`、当前工作目录解析、权限，以及是否使用 `--no-save` 或 `save: false`。
- **编辑失败。** 至少提供一个可读取的图像路径或 base64 图像。蒙版与部分编辑行为取决于 Provider/网关。
- **输出中出现凭据。** 停止分享输出、轮换凭据，并按仓库[安全策略](../../SECURITY.md)私密报告泄漏。

## 开发

在仓库根目录运行：

```bash
npm install
npm run build
npm test
npm run smoke:offline
npm run validate:plugins
npm run catalog:check
```

也可运行包级命令：

```bash
npm run build -w @sallyn0225/image-gen
npm run typecheck -w @sallyn0225/image-gen
npm run cli -w @sallyn0225/image-gen -- list
npm run dev:mcp -w @sallyn0225/image-gen
```

普通测试与离线冒烟使用本地 Provider Adapter。`npm run smoke:live` 是独立的**手动、联网、可能产生费用**的真实 Provider 操作；它需要用户凭据，绝不是拉取请求要求。详见仓库[测试指南](../../TESTING.md)。

## 许可证

[MIT](./LICENSE) © Sallyn0225。
