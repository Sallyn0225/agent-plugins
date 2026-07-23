# @sallyn0225/video-gen

> English: [README.md](./README.md)

面向火山引擎方舟 **Seedance 2.0** 视频生成的实验性 Capability Plugin。同一核心通过库、CLI 与 Agent Skill 交付。v1 仅对接方舟异步视频生成 API（`POST`/`GET /contents/generations/tasks`），**不提供 MCP**。

## 交付接口

| 接口 | 入口 | 用途 |
| --- | --- | --- |
| 库 | `@sallyn0225/video-gen` | 在 TypeScript/JavaScript 应用中使用配置、服务与 Ark 客户端导出 |
| CLI | `video-gen` | 脚本、CI 以及具备 shell 的智能体 |
| MCP | — | **v1 不提供** |
| Agent Skill | `skills/video-gen/SKILL.md` | 教智能体何时、如何调用该能力 |

npm 包包含 CLI 二进制、类型声明、规范 Skill、中英 README、`config.example.json` 与 MIT 许可证。

## 安装

需要 Node.js 22 或更高版本。真实调用还需已开通 Seedance 视频能力的方舟账号（余额或资源包）。

全局安装：

```bash
npm install --global @sallyn0225/video-gen
video-gen --help
```

不安装全局包时：

```bash
npx -y @sallyn0225/video-gen models
npx -y @sallyn0225/video-gen generate "雪地里的红狐狸"
```

作为库依赖安装：

```bash
npm install @sallyn0225/video-gen
```

## 配置

用户自行提供方舟 endpoint 与 API key。切勿提交真实密钥或 `config.local.json`。可从 [`config.example.json`](./config.example.json) 起步：

```json
{
  "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
  "apiKey": "your-ark-api-key",
  "defaultModel": "doubao-seedance-2-0-260128",
  "outputDir": "./generated-videos",
  "timeoutMs": 600000,
  "pollIntervalMs": 15000
}
```

默认值对齐官方 API：`baseUrl` 为 `https://ark.cn-beijing.volces.com/api/v3`，等待超时 **600000** ms，轮询间隔 **15000** ms，`outputDir` 为 `./generated-videos`。

### 配置文件优先级

按顺序使用**第一个存在的**配置文件：

1. `VIDEO_GEN_CONFIG`
2. 包本地 `config.local.json`（开发）
3. `~/.config/agent-plugins/video-gen.json`

`~` 会展开为当前用户主目录。相对路径的 `outputDir` 相对于当前工作目录解析。

### 环境变量覆盖

- `VIDEO_GEN_API_KEY`（优先）或 `ARK_API_KEY` 覆盖文件中的 `apiKey`
- `VIDEO_GEN_BASE_URL`、`VIDEO_GEN_DEFAULT_MODEL`、`VIDEO_GEN_OUTPUT_DIR`、`VIDEO_GEN_TIMEOUT_MS`、`VIDEO_GEN_POLL_INTERVAL_MS`

鉴权头：`Authorization: Bearer <apiKey>`。完整 API key **绝不会**出现在 stdout、stderr 或 `models` 输出中。

## CLI

```bash
video-gen models
video-gen generate "雪地里行走的红狐狸"
video-gen generate --model doubao-seedance-2-0-fast-260128 --no-audio "无声城市延时"
video-gen generate --first-frame https://cdn.example/frame.png "镜头推进"
video-gen generate --no-wait "长任务"
video-gen status <task_id>
video-gen download <task_id>
```

命令：`generate`、`status`、`download`、`models`。

`generate` 标志：`--model`、`--first-frame`、`--last-frame`、可重复的 `--ref-image` / `--ref-video` / `--ref-audio`、`--ratio`、`--duration`、`--resolution`、`--no-audio`、`--watermark`、`--return-last-frame`、`--priority`、`--wait` / `--no-wait`、`--poll-interval`、`--timeout`、`--no-save`。

省略标志时，创建请求体默认与官方一致：`generate_audio=true`、`watermark=false`、`ratio=adaptive`、`duration=5`、`resolution=720p`。

媒体输入**仅支持公网 HTTP(S) URL**（v1 不支持本地路径转 base64）。客户端限制：参考图 ≤9、参考视频 ≤3、参考音频 ≤3；纯音频与仅文本+音频会在请求前被拒绝。

成功时在 **stdout** 输出单个可解析 JSON；轮询进度在 **stderr**。失败以非零退出码返回 `{ "ok": false, "error": … }`；等待超时时仍保留 `taskId`，可用 `status` / `download` 续跑。结果 URL 约 24 小时有效，任务 ID 保留更久（约 7 天）——默认下载是刻意设计。

`video-gen models` 推荐的 Seedance 2.0 Model ID：

| Model ID | 最高分辨率 |
| --- | --- |
| `doubao-seedance-2-0-260128` | 1080p/4k |
| `doubao-seedance-2-0-fast-260128` | 720p |
| `doubao-seedance-2-0-mini-260615` | 720p |

`--model` 对任意官方 ID 透传（含非 2.0）。v1 不暴露 1.x 专属字段（如 `draft`、`seed`、`frames`、`camera_fixed`）。

## MCP

v1 **不提供** MCP，没有 `video-gen-mcp` 二进制。请使用 CLI 或库。

## 库

```ts
import { loadConfig, runGenerate, listModels } from "@sallyn0225/video-gen";

const config = loadConfig();
const models = listModels(config);
const result = await runGenerate({
  prompt: "雪地里的红狐狸",
  config,
});
// result.path → wait+save 成功时的本地 MP4
```

公共导出包括 `loadConfig`、`runGenerate`、`getTaskStatus`、`downloadTaskVideo`、`listModels`、`ArkVideoClient` 及相关类型。优先使用高层服务函数，而不是直接调用 HTTP 辅助函数。

## Agent Skill

规范的开放 Agent Skills 文件是 [`skills/video-gen/SKILL.md`](./skills/video-gen/SKILL.md)，并随 npm tarball 发布。它指导宿主优先使用 CLI、仅用 URL 媒体、等待或续跑，以及绝不编造视频 URL、不打印 API key。

## 兼容性与验证范围

- **上游协议：** 火山引擎方舟异步视频任务（`/contents/generations/tasks`）、Bearer 鉴权、强校验请求体字段。
- 清单中的验证范围为 `unit`、`offline-cli`、`docs`、`metadata` 与 `package-contents`；在线策略为 `liveProviders: manual`。这些标识是目录元数据，并不声称更广的测试覆盖。
- **自动化：** unit（配置/内容）、离线 CLI 黑盒（本地 Ark 形态 HTTP 适配器）、metadata、docs、package-contents。
- **在线 Provider 冒烟：** 仅手动（联网、需凭据、可能产生费用）。**不是** PR 必需检查。
- 协议兼容性不代表持续在真实 Host 或线上方舟账号上验证。

## 迁移

这是 `@sallyn0225/video-gen` 的首次公开发布，无需迁移。

## 故障排除

| 现象 | 排查 |
| --- | --- |
| `No API key configured` | 设置 `VIDEO_GEN_API_KEY` / `ARK_API_KEY`，或在可发现的配置文件中提供 `apiKey` |
| 等待超时 JSON 仍含 `taskId` | 用 `video-gen status` / `video-gen download` 续跑 |
| 上游 `failed` | 查看 stdout JSON 的 `error.message`，调整提示词/媒体/策略 |
| `videoUrl` 为空或过期 | 尽快下载（约 24h）；重新 `status` |
| 文本+音频 / 纯音频被拒 | 增加图/视频参考或去掉 `--ref-audio` |
| 账号/余额类错误 | 在火山引擎控制台开通 Seedance 资源 |

切勿在 issue 或日志中粘贴完整 API key。

## 开发

在仓库根目录：

```bash
npm install
npm run build -w @sallyn0225/video-gen
npm test
npm run smoke:offline -w @sallyn0225/video-gen
npm run validate:plugins
npm run docs:check
npm run catalog:generate
```

离线测试使用本地 HTTP 适配器，不需要真实方舟凭据。参见[创建能力插件](../../docs/creating-a-capability-plugin.md)与[测试](../../TESTING.md)。

## 许可证

[MIT](./LICENSE) © Sallyn0225。
