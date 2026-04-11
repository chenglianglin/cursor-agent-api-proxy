/**
 * Turn Cursor CLI stream-json `tool_call` events into short text for the client stream.
 *
 * Cursor often shapes `tool_call` as: { [toolName]: { args?, result? } }
 * (see openclaw-cursor-brain streaming-proxy parsing). We also support flat shapes.
 */

function pickString(v: unknown, maxLen: number): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length <= maxLen ? s : `${s.slice(0, maxLen)}…`;
}

/** `{ bash: { args: {...} } }` / `{ read_file: { result: {...} } }` */
function extractKeyedTool(
  tc: Record<string, unknown>
): { name: string; args?: unknown; result?: unknown } | null {
  for (const [key, val] of Object.entries(tc)) {
    if (val == null || typeof val !== "object" || Array.isArray(val)) continue;
    const v = val as Record<string, unknown>;
    if ("args" in v || "result" in v) {
      return { name: key, args: v.args, result: v.result };
    }
  }
  return null;
}

function toolNameFlat(tc: Record<string, unknown>): string {
  const fn = tc.function as Record<string, unknown> | undefined;
  const n =
    tc.name ??
    tc.toolName ??
    tc.tool ??
    tc.tool_name ??
    fn?.name ??
    tc.type ??
    "tool";
  return String(n);
}

function toolDetailFlat(tc: Record<string, unknown>): string {
  const args =
    (tc.args as unknown) ??
    (tc.arguments as unknown) ??
    (tc.input as unknown) ??
    (tc.params as unknown) ??
    (tc.function as Record<string, unknown> | undefined)?.arguments;

  if (typeof args === "string") return pickString(args, 400);

  if (args && typeof args === "object" && !Array.isArray(args)) {
    const a = args as Record<string, unknown>;
    const cmd = a.command ?? a.cmd ?? a.shell ?? a.script;
    if (cmd != null) return pickString(cmd, 400);
    const path = a.path ?? a.filePath ?? a.file ?? a.targetPath ?? a.cwd;
    if (path != null) return pickString(path, 300);
    return pickString(args, 400);
  }

  return "";
}

/**
 * Human-readable line(s) injected into assistant text so OpenAI clients show tool activity.
 * Set CURSOR_PROXY_STREAM_TOOLS=false to disable forwarding (subprocess still parses events).
 */
export function formatToolCallForStream(
  subtype: string | undefined,
  toolCall: Record<string, unknown>
): string {
  const phase =
    subtype === "started"
      ? "Tool (started)"
      : subtype === "completed"
        ? "Tool (done)"
        : subtype
          ? `Tool (${subtype})`
          : "Tool";

  const keyed = extractKeyedTool(toolCall);
  let body: string;

  if (keyed) {
    if (subtype === "completed" && keyed.result !== undefined) {
      const r = keyed.result as Record<string, unknown> | null;
      const ok =
        r && typeof r === "object" && "success" in r ? String(r.success) : "";
      const tail = ok !== "" ? ` success=${ok}` : "";
      body = `${keyed.name}${tail} ${pickString(keyed.result, 500)}`.trim();
    } else if (keyed.args !== undefined) {
      body = `${keyed.name} ${pickString(keyed.args, 600)}`.trim();
    } else {
      body = `${keyed.name} ${pickString(toolCall, 600)}`.trim();
    }
  } else {
    const name = toolNameFlat(toolCall);
    const detail = toolDetailFlat(toolCall);
    if (detail) {
      body = `${name}: ${detail}`;
    } else if (Object.keys(toolCall).length > 0) {
      body = `${name} ${pickString(toolCall, 700)}`.trim();
    } else {
      body = name;
    }
  }

  return `\n\n*${phase}* ${body}\n\n`;
}
