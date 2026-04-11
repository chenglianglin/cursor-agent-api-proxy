/**
 * Turn Cursor CLI stream-json `tool_call` events into short text for the client stream.
 */

function pickString(v: unknown, maxLen: number): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length <= maxLen ? s : `${s.slice(0, maxLen)}…`;
}

function toolName(tc: Record<string, unknown>): string {
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

/** One-line hint: command, path, or truncated args. */
function toolDetail(tc: Record<string, unknown>): string {
  const args =
    (tc.args as unknown) ??
    (tc.arguments as unknown) ??
    (tc.input as unknown) ??
    (tc.params as unknown) ??
    (tc.function as Record<string, unknown> | undefined)?.arguments;

  if (typeof args === "string") return pickString(args, 280);

  if (args && typeof args === "object" && !Array.isArray(args)) {
    const a = args as Record<string, unknown>;
    const cmd = a.command ?? a.cmd ?? a.shell ?? a.script;
    if (cmd != null) return pickString(cmd, 280);
    const path = a.path ?? a.filePath ?? a.file ?? a.targetPath ?? a.cwd;
    if (path != null) return pickString(path, 200);
    return pickString(args, 280);
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
  const name = toolName(toolCall);
  const detail = toolDetail(toolCall);
  const body = detail ? `${name}: ${detail}` : name;
  return `\n\n*${phase}* ${body}\n\n`;
}
