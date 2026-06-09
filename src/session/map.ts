/**
 * Map OpenClaw / OpenAI client conversation keys to Cursor CLI session ids.
 *
 * Keys come from `user`, `x-openclaw-session-key`, or `x-cursor-session-key`.
 * Persisted under ~/.cursor-agent-api/session-map.json.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Request } from "express";
import type { OpenAIChatMessage, OpenAIChatRequest } from "../types/openai.js";
import { workspaceHash } from "./list.js";

const STATE_DIR = join(homedir(), ".cursor-agent-api");
const MAP_FILE = join(STATE_DIR, "session-map.json");

interface MapEntry {
  sessionId: string;
  updatedAt: string;
}

interface MapFile {
  version: 1;
  entries: Record<string, MapEntry>;
}

export type SessionResolveSource = "explicit" | "mapped" | "new";

export interface ResolvedSession {
  sessionId?: string;
  clientKey?: string;
  workspace: string;
  source: SessionResolveSource;
}

function compositeKey(workspace: string, clientKey: string): string {
  return `${workspaceHash(workspace)}:${clientKey}`;
}

function headerValue(req: Request, name: string): string | undefined {
  const raw = req.headers[name];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw)) {
    const first = raw.find((v) => typeof v === "string" && v.trim());
    if (first) return first.trim();
  }
  return undefined;
}

/** Headers OpenClaw / clients may send for stable per-chat routing. */
const SESSION_KEY_HEADERS = [
  "x-openclaw-session-key",
  "x-cursor-session-key",
  "x-session-affinity",
  "session_id",
  "x-openclaw-session-id",
  "x-client-request-id",
] as const;

function messageText(content: OpenAIChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text!)
    .join("\n");
}

/** OpenClaw embeds chat_id in user message metadata when no header is sent. */
function extractOpenClawChatId(body: OpenAIChatRequest): string | undefined {
  for (let i = body.messages.length - 1; i >= 0; i--) {
    const msg = body.messages[i];
    if (msg.role !== "user") continue;
    const text = messageText(msg.content);
    if (!text.includes("chat_id")) continue;
    const match = text.match(/"chat_id"\s*:\s*"([^"]+)"/);
    const chatId = match?.[1]?.trim();
    if (chatId) return `openclaw:chat:${chatId}`;
  }
  return undefined;
}

/** Stable client-side conversation key from request body or headers. */
export function extractClientSessionKey(
  req: Request,
  body: OpenAIChatRequest
): string | undefined {
  for (const name of SESSION_KEY_HEADERS) {
    const value = headerValue(req, name);
    if (value) return value;
  }

  if (typeof body.user === "string" && body.user.trim()) {
    return body.user.trim();
  }

  return extractOpenClawChatId(body);
}

export class SessionMapStore {
  private cache: MapFile | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  private async load(): Promise<MapFile> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(MAP_FILE, "utf8");
      const parsed = JSON.parse(raw) as MapFile;
      if (parsed?.version === 1 && parsed.entries && typeof parsed.entries === "object") {
        this.cache = parsed;
        return parsed;
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
    this.cache = { version: 1, entries: {} };
    return this.cache;
  }

  async lookup(workspace: string, clientKey: string): Promise<string | undefined> {
    const map = await this.load();
    return map.entries[compositeKey(workspace, clientKey)]?.sessionId;
  }

  async save(workspace: string, clientKey: string, sessionId: string): Promise<void> {
    const map = await this.load();
    map.entries[compositeKey(workspace, clientKey)] = {
      sessionId,
      updatedAt: new Date().toISOString(),
    };
    this.writeChain = this.writeChain.then(() => this.persist(map));
    await this.writeChain;
  }

  private async persist(map: MapFile): Promise<void> {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(MAP_FILE, `${JSON.stringify(map, null, 2)}\n`, "utf8");
  }
}

export const sessionMap = new SessionMapStore();

const _falsyValues = new Set(["0", "false", "no", "off", ""]);

export function isAutoSessionEnabled(): boolean {
  return !_falsyValues.has((process.env.CURSOR_PROXY_AUTO_SESSION ?? "true").toLowerCase());
}

export async function resolveSession(
  req: Request,
  body: OpenAIChatRequest,
  workspace = process.cwd()
): Promise<ResolvedSession> {
  const explicit =
    typeof body.session_id === "string" && body.session_id.trim()
      ? body.session_id.trim()
      : undefined;
  const clientKey = extractClientSessionKey(req, body);

  if (explicit) {
    return { sessionId: explicit, clientKey, workspace, source: "explicit" };
  }

  if (isAutoSessionEnabled() && clientKey) {
    const mapped = await sessionMap.lookup(workspace, clientKey);
    if (mapped) {
      return { sessionId: mapped, clientKey, workspace, source: "mapped" };
    }
    return { clientKey, workspace, source: "new" };
  }

  return { workspace, source: "new" };
}

export async function persistSessionMapping(
  ctx: ResolvedSession,
  sessionId?: string
): Promise<void> {
  if (!sessionId || !ctx.clientKey) return;
  await sessionMap.save(ctx.workspace, ctx.clientKey, sessionId);
}

export function formatSessionLog(ctx: ResolvedSession): string {
  if (ctx.source === "mapped" && ctx.sessionId) {
    return `${ctx.sessionId} (mapped:${ctx.clientKey})`;
  }
  if (ctx.source === "explicit" && ctx.sessionId) {
    return `${ctx.sessionId} (explicit)`;
  }
  if (ctx.clientKey) {
    return `new (key=${ctx.clientKey})`;
  }
  return "new";
}
