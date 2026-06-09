/**
 * List Cursor CLI chat sessions from ~/.cursor/chats/<workspace_md5>/.
 */

import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CursorSessionEntry {
  id: string;
  updated_at: string;
  workspace: string;
}

export function workspaceHash(cwd: string): string {
  return createHash("md5").update(resolve(cwd)).digest("hex");
}

function chatsBaseDir(): string {
  return join(homedir(), ".cursor", "chats");
}

export async function listSessions(opts: {
  cwd?: string;
  limit?: number;
} = {}): Promise<CursorSessionEntry[]> {
  const workspace = resolve(opts.cwd ?? process.cwd());
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 100));
  const base = join(chatsBaseDir(), workspaceHash(workspace));

  let entries: { id: string; mtimeMs: number }[];
  try {
    const names = await readdir(base);
    entries = [];
    for (const name of names) {
      if (!UUID_RE.test(name)) continue;
      const dir = join(base, name);
      try {
        const info = await stat(join(dir, "store.db"));
        entries.push({ id: name, mtimeMs: info.mtimeMs });
      } catch {
        // skip dirs without store.db
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }

  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);

  return entries.slice(0, limit).map((e) => ({
    id: e.id,
    updated_at: new Date(e.mtimeMs).toISOString(),
    workspace,
  }));
}
