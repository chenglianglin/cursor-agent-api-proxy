# cursor-agent-api-proxy

[![npm version](https://img.shields.io/npm/v/cursor-agent-api-proxy)](https://www.npmjs.com/package/cursor-agent-api-proxy)
[![npm downloads](https://img.shields.io/npm/dm/cursor-agent-api-proxy)](https://www.npmjs.com/package/cursor-agent-api-proxy)
[![license](https://img.shields.io/npm/l/cursor-agent-api-proxy)](./LICENSE)

[English](./README.md)

Cursor CLI 的 OpenAI 兼容 API 代理。让任何 OpenAI 兼容客户端直接使用你的 Cursor 订阅。

## 前置条件

- Node.js 20+
- 有效的 [Cursor](https://cursor.com) 订阅（Pro / Business）

## 安装

**1. 安装 Cursor CLI 并登录：**

```bash
# macOS / Linux
curl https://cursor.com/install -fsS | bash

# Windows PowerShell
irm 'https://cursor.com/install?win32=true' | iex
```

```bash
agent login          # 打开浏览器，用 Cursor 账号登录
agent --list-models  # 确认 CLI 可用
```

> **无头环境？** 跳过 `agent login`，到 [cursor.com/settings](https://cursor.com/settings) 生成 API Key，然后 `export CURSOR_API_KEY=<key>`。

**2. 安装并启动代理：**

```bash
npm install -g cursor-agent-api-proxy
cursor-agent-api          # 后台启动，默认 http://localhost:4646
cursor-agent-api status   # 查看运行状态
```

**3. 验证：**

```bash
curl http://localhost:4646/health
```

**其他命令：**

```bash
cursor-agent-api stop           # 停止
cursor-agent-api restart        # 重启
cursor-agent-api start 8080     # 指定端口启动
cursor-agent-api run            # 前台运行（调试用）
```

日志：`~/.cursor-agent-api/server.log`

## 配合 OpenClaw 使用

### 首次安装（onboard 向导）

如果还没装过 [OpenClaw](https://docs.openclaw.ai)，运行引导向导：

```bash
openclaw onboard
```

向导进行到 **Model/Auth** 步骤时：

1. Provider 类型 → 选 **Custom Provider**（OpenAI-compatible）
2. Base URL → `http://localhost:4646/v1`
3. API Key → 输入 `not-needed`（已 `agent login` 就不需要 key）
4. Default model → `auto`（或 `agent --list-models` 中的任意模型）

### 已有配置（编辑配置文件）

OpenClaw 已经在用了？直接改配置文件：

```json5
{
  env: {
    // "not-needed" = 已通过 agent login 登录，不需要 key
    // 或填你的 Cursor API Key，代理会按请求转发
    OPENAI_API_KEY: "not-needed",
    OPENAI_BASE_URL: "http://localhost:4646/v1",
  },
  agents: {
    defaults: {
      model: { primary: "openai/auto" },
    },
  },
}
```

## 模型

模型 ID 和 `agent --list-models` 输出一致，直接填：

```bash
auto                  # 自动选择
gpt-5.2               # GPT-5.2
gpt-5.3-codex         # GPT-5.3 Codex
opus-4.6-thinking     # Claude Opus 4.6 (thinking)
sonnet-4.5-thinking   # Claude Sonnet 4.5 (thinking)
gemini-3-pro          # Gemini 3 Pro
```

完整列表：`curl http://localhost:4646/v1/models` 或 `agent --list-models`。

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/v1/models` | GET | 模型列表 |
| `/v1/sessions` | GET | 列出 Cursor CLI session（按最近修改时间排序） |
| `/v1/chat/completions` | POST | 聊天补全（支持 `stream: true`、`session_id` 续接） |

### Session 查询与续接

Cursor CLI 的 session 保存在 `~/.cursor/chats/<workspace_md5>/<session_id>/`。代理会扫描本机目录并提供续接能力。

**列出最近 session：**

```bash
curl 'http://localhost:4646/v1/sessions?limit=5'
curl 'http://localhost:4646/v1/sessions?cwd=/path/to/project&limit=1'
```

**续接已有 session：**

```bash
curl -X POST http://localhost:4646/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"auto","session_id":"<uuid>","messages":[{"role":"user","content":"继续"}]}'
```

响应会带上 `X-Session-Id` header；非流式 JSON 还会包含 `session_id` 字段，便于 OpenClaw 等客户端保存后下次续接。

### OpenClaw 自动续接（推荐）

默认开启：当请求带有稳定的对话 key 时，代理会自动把该 key 映射到 Cursor CLI `session_id`，同一对话的后续消息会 `--resume`，无需客户端手动传 `session_id`。

识别顺序（优先级从高到低）：

1. 请求 body 的 `session_id`（显式指定，最高优先级）
2. Header `x-openclaw-session-key`
3. Header `x-cursor-session-key`
4. Header `x-session-affinity` / `session_id` / `x-openclaw-session-id` / `x-client-request-id`
5. 请求 body 的 `user` 字段
6. OpenClaw 消息 metadata 中的 `chat_id`（自动从 user 消息解析，无需额外配置）

映射表保存在 `~/.cursor-agent-api/session-map.json`。服务端 log 示例：

```
session=new (key=conv:abc123)                    # 第一次，新建
session=b64caee3-... (mapped:conv:abc123)      # 第二次，自动 resume
```

**OpenClaw 注意**：默认情况下 OpenClaw 不会发送 `user` 或 `x-openclaw-session-key`，但会在 user 消息里嵌入 `chat_id` metadata，代理会自动识别。若 log 仍显示 `session=new`（无 key），说明请求里没有任何可识别的对话 key。

也可在 `openclaw.json` 为 `cursor-local` 配置 provider headers（推荐 `x-openclaw-session-key: "{{session.key}}"`，需 OpenClaw 支持 header 模板）。

关闭自动映射：`CURSOR_PROXY_AUTO_SESSION=false`

## 配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `PORT` | `4646` | 监听端口（或 `cursor-agent-api start 8080`） |
| `CURSOR_API_KEY` | - | `agent login` 的替代方案 |
| `CURSOR_PROXY_AUTO_SESSION` | `true` | 用 `user` / session header 自动映射并 resume Cursor session |

## 开机自启

开机自动启动代理：

```bash
cursor-agent-api install    # 注册为系统服务
cursor-agent-api uninstall  # 移除
```

- macOS → LaunchAgent
- Windows → Task Scheduler
- Linux → systemd user service

## 其他客户端

<details>
<summary>Python (openai SDK)</summary>

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:4646/v1",
    api_key="not-needed",
)

resp = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)
```

</details>

<details>
<summary>Continue.dev</summary>

```json
{
  "models": [{
    "title": "Cursor",
    "provider": "openai",
    "model": "auto",
    "apiBase": "http://localhost:4646/v1",
    "apiKey": "not-needed"
  }]
}
```

</details>

<details>
<summary>curl</summary>

```bash
curl -X POST http://localhost:4646/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello!"}]}'
```

</details>

## 原理

```
客户端  →  POST /v1/chat/completions (OpenAI 格式)
        →  cursor-agent-api-proxy
        →  spawn agent CLI (stream-json)
        →  Cursor 订阅
        →  AI 响应 → OpenAI 格式 → 客户端
```

## 参与开发

```bash
git clone https://github.com/tageecc/cursor-agent-api-proxy.git
cd cursor-agent-api-proxy
pnpm install && pnpm run build
pnpm start
```

## License

MIT
