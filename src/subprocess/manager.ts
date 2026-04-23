/**
 * Cursor CLI (agent) Subprocess Manager.
 *
 * Spawns `agent -p --output-format stream-json --stream-partial-output --yolo`
 * and emits normalized events: content_delta, result, error, close.
 *
 * The prompt is piped via stdin to avoid shell argument length limits.
 */

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { StringDecoder } from "node:string_decoder";
import type {
  CursorCliAssistantMessage,
  CursorCliMessage,
  CursorCliResult,
} from "../types/cursor-cli.js";
import {
  isSystemInit,
  isAssistantMessage,
  isToolCallMessage,
  isResultMessage,
} from "../types/cursor-cli.js";
import { cursorUsageToOpenAI, usagePayloadFromResult } from "../adapter/cursor-usage.js";
import type { OpenAICompletionUsage } from "../types/openai.js";

const IS_WIN = process.platform === "win32";
const _envTimeout = parseInt(process.env.CURSOR_PROXY_TIMEOUT_MS ?? "", 10);
const DEFAULT_TIMEOUT = Number.isFinite(_envTimeout) && _envTimeout > 0 ? _envTimeout : 300_000;
const DEBUG = !!process.env.CURSOR_DEBUG;
const LOG_USAGE = !!process.env.CURSOR_PROXY_LOG_USAGE;

/** Cursor CLI may send `message.content: null`, a string, or a parts array. */
function extractAssistantText(msg: CursorCliAssistantMessage): string {
  const content = msg.message?.content as unknown;
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (c): c is { type: string; text?: string } =>
        c != null && typeof c === "object" && (c as { type?: string }).type === "text"
    )
    .map((c) => (typeof c.text === "string" ? c.text : ""))
    .join("");
}

export interface SubprocessOptions {
  model: string;
  apiKey?: string;
  cwd?: string;
  timeout?: number;
}

export interface ContentDeltaEvent {
  text: string;
}

export interface ResultEvent {
  text: string;
  model: string;
  /** OpenAI-shaped usage when Cursor CLI included `usage` on the result line */
  usage?: OpenAICompletionUsage;
}

export interface ToolActivityEvent {
  subtype?: string;
  tool_call: Record<string, unknown>;
}

export class CursorSubprocess extends EventEmitter {
  private process: ChildProcess | null = null;
  private buffer = "";
  /** Must decode stdout as a stream; per-chunk toString("utf8") breaks CJK split across chunks. */
  private stdoutDecoder: StringDecoder | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  private isKilled = false;
  private detectedModel = "cursor-auto";
  private turnBuffer = "";

  async start(prompt: string, options: SubprocessOptions): Promise<void> {
    const args = this.buildArgs(options);
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    return new Promise<void>((resolve, reject) => {
      try {
        this.stdoutDecoder = new StringDecoder("utf8");
        this.buffer = "";

        const env = { ...process.env };
        if (options.apiKey) {
          env.CURSOR_API_KEY = options.apiKey;
        }

        this.process = spawn("agent", args, {
          cwd: options.cwd ?? process.cwd(),
          env,
          stdio: ["pipe", "pipe", "pipe"],
          shell: IS_WIN,
        });

        this.timeoutId = setTimeout(() => {
          if (!this.isKilled) {
            this.isKilled = true;
            this.process?.kill(IS_WIN ? undefined : "SIGTERM");
            this.emit("error", new Error(`Request timed out after ${timeout}ms`));
          }
        }, timeout);

        this.process.on("error", (err) => {
          this.clearTimer();
          if (err.message.includes("ENOENT")) {
            reject(
              new Error(
                IS_WIN
                  ? "Cursor CLI (agent) not found. Install: irm 'https://cursor.com/install?win32=true' | iex"
                  : "Cursor CLI (agent) not found. Install: curl https://cursor.com/install -fsS | bash"
              )
            );
          } else {
            reject(err);
          }
        });

        this.process.stdin?.write(prompt);
        this.process.stdin?.end();

        this.process.stdout?.on("data", (chunk: Buffer) => {
          if (this.stdoutDecoder) {
            this.buffer += this.stdoutDecoder.write(chunk);
          }
          this.processBuffer();
        });

        this.process.stderr?.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8").trim();
          if (text) {
            console.error("[CursorSubprocess stderr]", text.slice(0, 500));
          }
        });

        this.process.on("close", (code) => {
          this.clearTimer();
          if (this.stdoutDecoder) {
            const tail = this.stdoutDecoder.end();
            this.stdoutDecoder = null;
            if (tail) this.buffer += tail;
          }
          if (this.buffer.trim()) {
            this.processBuffer();
            this.flushTrailingLine();
          }
          this.emit("close", code);
        });

        resolve();
      } catch (err) {
        this.clearTimer();
        reject(err);
      }
    });
  }

  private buildArgs(options: SubprocessOptions): string[] {
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--stream-partial-output",
      "--yolo",
    ];

    if (options.model && options.model !== "auto") {
      args.push("--model", options.model);
    }

    return args;
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg: CursorCliMessage = JSON.parse(trimmed);
        this.handleMessage(msg);
      } catch {
        this.emit("raw", trimmed);
      }
    }
  }

  private handleMessage(msg: CursorCliMessage): void {
    if (DEBUG) {
      console.error("[debug]", JSON.stringify(msg).slice(0, 300));
    }

    if (isSystemInit(msg)) {
      if (msg.model) this.detectedModel = msg.model;
      return;
    }

    if (isAssistantMessage(msg)) {
      const text = extractAssistantText(msg);
      if (!text) return;

      if (text === this.turnBuffer) return;

      if (text.startsWith(this.turnBuffer)) {
        const diff = text.slice(this.turnBuffer.length);
        if (diff) this.emit("content_delta", { text: diff } as ContentDeltaEvent);
        this.turnBuffer = text;
        return;
      }

      this.emit("content_delta", { text } as ContentDeltaEvent);
      this.turnBuffer += text;
      return;
    }

    if (isToolCallMessage(msg)) {
      this.turnBuffer = "";
      const tc = msg as { subtype?: string; tool_call?: Record<string, unknown> };
      this.emit("tool_activity", {
        subtype: tc.subtype,
        tool_call: tc.tool_call && typeof tc.tool_call === "object" ? tc.tool_call : {},
      } satisfies ToolActivityEvent);
      return;
    }

    if (isResultMessage(msg)) {
      const raw = msg as CursorCliResult;
      const rawRec = raw as unknown as Record<string, unknown>;
      const usagePayload = usagePayloadFromResult(rawRec);
      const usageInfo = usagePayload ? cursorUsageToOpenAI(usagePayload) : undefined;
      if (LOG_USAGE) {
        console.error(
          "[cursor-agent-api-proxy] result usage:",
          usagePayload ? JSON.stringify(usagePayload) : "(missing — CLI may omit usage for this run)"
        );
      }
      const result: ResultEvent = {
        text: raw.result ?? "",
        model: this.detectedModel,
        usage: usageInfo,
      };
      this.emit("result", result);
      return;
    }
  }

  /** Last stdout line may lack trailing \\n; parse it so `result` / usage are not lost. */
  private flushTrailingLine(): void {
    const trimmed = this.buffer.trim();
    if (!trimmed) {
      this.buffer = "";
      return;
    }
    try {
      const msg: CursorCliMessage = JSON.parse(trimmed);
      this.handleMessage(msg);
    } catch {
      this.emit("raw", trimmed);
    }
    this.buffer = "";
  }

  private clearTimer(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  kill(): void {
    if (!this.isKilled && this.process) {
      this.isKilled = true;
      this.clearTimer();
      if (IS_WIN) {
        this.process.kill();
      } else {
        this.process.kill("SIGTERM");
      }
    }
  }

  isRunning(): boolean {
    return this.process !== null && !this.isKilled && this.process.exitCode === null;
  }
}

export async function verifyCursorCli(): Promise<{
  ok: boolean;
  error?: string;
  version?: string;
}> {
  return new Promise((resolve) => {
    const proc = spawn("agent", ["--version"], { stdio: "pipe", shell: IS_WIN });
    let output = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    proc.on("error", () => {
      resolve({
        ok: false,
        error:
          IS_WIN
          ? "Cursor CLI (agent) not found. Install: irm 'https://cursor.com/install?win32=true' | iex"
          : "Cursor CLI (agent) not found. Install: curl https://cursor.com/install -fsS | bash",
      });
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true, version: output.trim() });
      } else {
        resolve({
          ok: false,
          error: "Cursor CLI (agent) returned non-zero exit code",
        });
      }
    });
  });
}
