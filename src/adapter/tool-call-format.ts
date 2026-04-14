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

/** Cursor `result` may be `{ error }`, `{ success: boolean }`, or `{ success: { content, errorMessage } }`. */
function summarizeToolCompletedResult(result: unknown, toolName: string): string {
  if (result == null) return toolName;
  if (typeof result !== "object" || Array.isArray(result)) {
    return `${toolName} ${pickString(result, 400)}`.trim();
  }

  const r = result as Record<string, unknown>;

  const err = r.error;
  if (err != null) {
    if (typeof err === "object" && err !== null && !Array.isArray(err)) {
      const em = (err as Record<string, unknown>).errorMessage;
      if (typeof em === "string") return `${toolName} error: ${em}`;
    }
    return `${toolName} error: ${pickString(err, 300)}`.trim();
  }

  if (!("success" in r)) {
    return `${toolName} ${pickString(r, 500)}`.trim();
  }

  const s = r.success;
  if (typeof s === "boolean") {
    return `${toolName} ok=${s}`.trim();
  }
  if (s != null && typeof s === "object" && !Array.isArray(s)) {
    const p = s as Record<string, unknown>;
    if (typeof p.errorMessage === "string") {
      return `${toolName} error: ${p.errorMessage}`.trim();
    }
    if (typeof p.content === "string") {
      return `${toolName} ${pickString(p.content, 450)}`.trim();
    }
    return `${toolName} ok`.trim();
  }

  return `${toolName} ${pickString(s, 200)}`.trim();
}

/**
 * Human-readable line(s) injected into assistant text so OpenAI clients show tool activity.
 * Set CURSOR_PROXY_STREAM_TOOLS=false to disable forwarding (subprocess still parses events).
 */
function coerceArgumentsRecord(args: unknown): Record<string, unknown> {
  if (args == null) {
    return {};
  }
  if (typeof args === "string") {
    const t = args.trim();
    if (!t) {
      return {};
    }
    try {
      const parsed = JSON.parse(t) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { value: parsed as unknown };
    } catch {
      return { raw: args };
    }
  }
  if (typeof args === "object" && !Array.isArray(args)) {
    return { ...(args as Record<string, unknown>) };
  }
  return { value: args as unknown };
}

/**
 * Map Cursor CLI `tool_call` payload → OpenAI function name + arguments object * for `choices[].delta.tool_calls[].function.{name,arguments}` (arguments JSON-stringified on the wire).
 */
export function resolveCursorToolForOpenAi(
  toolCall: Record<string, unknown>
): { name: string; arguments: Record<string, unknown> } | null {
  const keyed = extractKeyedTool(toolCall);
  if (keyed) {
    const name = keyed.name?.trim();
    if (!name) {
      return null;
    }
    return {
      name,
      arguments: coerceArgumentsRecord(keyed.args),
    };
  }

  const name = toolNameFlat(toolCall).trim();
  if (!name || name === "tool") {
    return null;
  }

  const fn = toolCall.function as Record<string, unknown> | undefined;
  const argsRaw =
    toolCall.args ??
    toolCall.arguments ??
    toolCall.input ??
    toolCall.params ??
    fn?.arguments;

  return {
    name,
    arguments: coerceArgumentsRecord(argsRaw),
  };
}

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
    if (subtype === "completed") {
      body = summarizeToolCompletedResult(keyed.result, keyed.name);
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
