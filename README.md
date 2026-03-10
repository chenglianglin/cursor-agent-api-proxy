# cursor-agent-api-proxy

[![npm version](https://img.shields.io/npm/v/cursor-agent-api-proxy)](https://www.npmjs.com/package/cursor-agent-api-proxy)
[![npm downloads](https://img.shields.io/npm/dm/cursor-agent-api-proxy)](https://www.npmjs.com/package/cursor-agent-api-proxy)
[![license](https://img.shields.io/npm/l/cursor-agent-api-proxy)](./LICENSE)

[中文文档](./README.zh-CN.md)

Turn your Cursor subscription into an OpenAI-compatible API.

This project wraps the Cursor CLI (`agent` command) as an HTTP server that speaks the OpenAI API format, so tools like [OpenClaw](https://docs.openclaw.ai), [Continue.dev](https://continue.dev), or any OpenAI-compatible client can use your Cursor subscription directly.

Works on macOS, Linux, and Windows.

## Getting Started

### 1. Install the Cursor CLI

**macOS / Linux / WSL:**

```bash
curl https://cursor.com/install -fsS | bash
export CURSOR_API_KEY=your_key_here
```

**Windows (PowerShell):**

```powershell
irm 'https://cursor.com/install?win32=true' | iex
$env:CURSOR_API_KEY="your_key_here"
```

### 2. Install the proxy

**Option A — npm global install (recommended):**

```bash
npm install -g cursor-agent-api-proxy
cursor-agent-api
```

**Option B — from source:**

```bash
git clone https://github.com/tageecc/cursor-agent-api-proxy.git
cd cursor-agent-api-proxy
pnpm install && pnpm run build
pnpm start
```

The server listens on `http://localhost:4646` by default.

## Try it

**macOS / Linux / WSL:**

```bash
# non-streaming
curl -X POST http://localhost:4646/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"cursor/auto","messages":[{"role":"user","content":"Hello!"}]}'

# streaming
curl -N -X POST http://localhost:4646/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"cursor/auto","messages":[{"role":"user","content":"Hello!"}],"stream":true}'
```

**Windows (PowerShell):**

```powershell
# non-streaming
Invoke-RestMethod -Method POST -Uri http://localhost:4646/v1/chat/completions `
  -ContentType "application/json" `
  -Body '{"model":"cursor/auto","messages":[{"role":"user","content":"Hello!"}]}' | ConvertTo-Json -Depth 10

# streaming (curl.exe is built-in on Windows 10+)
curl.exe -N -X POST http://localhost:4646/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{\"model\":\"cursor/auto\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello!\"}],\"stream\":true}'
```

## OpenClaw Configuration

```json5
{
  env: {
    OPENAI_API_KEY: "your_cursor_api_key",
    OPENAI_BASE_URL: "http://localhost:4646/v1",
  },
  agents: {
    defaults: {
      model: { primary: "openai/cursor/auto" },
    },
  },
}
```

> You can put your Cursor API Key directly in `OPENAI_API_KEY`. The proxy extracts it from the `Authorization` header and passes it to the Cursor CLI. If you've already set `CURSOR_API_KEY` as a system environment variable, use `"not-needed"` here instead.

## Models

Specify models with the `cursor/` prefix:

| Model ID | Description |
|----------|-------------|
| `cursor/auto` | Auto-select |
| `cursor/opus-4.6-thinking` | Claude Opus 4.6 (thinking) |
| `cursor/opus-4.6` | Claude Opus 4.6 |
| `cursor/sonnet-4.5-thinking` | Claude Sonnet 4.5 (thinking) |
| `cursor/sonnet-4.5` | Claude Sonnet 4.5 |
| `cursor/gpt-5.3-codex` | GPT 5.3 Codex |
| `cursor/gpt-5.2` | GPT 5.2 |
| `cursor/gemini-3-pro` | Gemini 3 Pro |
| `cursor/grok` | Grok |

Dash format (`cursor-auto`, `cursor-opus-4.6`, etc.) is also supported for clients that don't allow `/` in model names.

Full list available at `GET /v1/models`.

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (includes CLI version) |
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | Chat completion (streaming supported) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4646` | Listen port |
| `CURSOR_API_KEY` | - | Cursor API Key (can also be passed via Authorization header) |

Port can also be set via CLI argument: `cursor-agent-api 8080`

## How it Works

```
Your client (OpenClaw / Python / curl ...)
    │
    │  POST /v1/chat/completions  (OpenAI format)
    ▼
cursor-agent-api-proxy
    │
    │  spawn("agent", ["-p", "--output-format", "stream-json", ...])
    │  prompt piped via stdin
    ▼
Cursor CLI (agent)
    │
    │  uses your Cursor subscription quota
    ▼
AI model response → converted to OpenAI format → returned to client
```

## Other Client Examples

### Python (openai SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:4646/v1",
    api_key="your_cursor_api_key",  # or "not-needed"
)

resp = client.chat.completions.create(
    model="cursor/auto",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)
```

### Continue.dev

```json
{
  "models": [{
    "title": "Cursor",
    "provider": "openai",
    "model": "cursor/auto",
    "apiBase": "http://localhost:4646/v1",
    "apiKey": "your_cursor_api_key"
  }]
}
```

## Auto-start Service

```bash
cursor-agent-api install    # register and start as system service
cursor-agent-api uninstall  # remove
```

Platform-specific backend:
- macOS → LaunchAgent
- Windows → Task Scheduler
- Linux → systemd user service

If `CURSOR_API_KEY` is set in your environment, it will be written into the service config automatically.

## Project Structure

```
src/
├── index.ts               # package exports
├── types/
│   ├── cursor-cli.ts      # Cursor CLI stream-json output types
│   └── openai.ts          # OpenAI API types
├── adapter/
│   ├── openai-to-cli.ts   # OpenAI request → CLI prompt
│   └── cli-to-openai.ts   # CLI output → OpenAI response
├── subprocess/
│   └── manager.ts         # agent subprocess management
├── service/
│   └── install.ts         # install / uninstall service registration
└── server/
    ├── index.ts           # Express app
    ├── routes.ts          # API routes
    └── standalone.ts      # CLI entry point
```

## License

MIT
