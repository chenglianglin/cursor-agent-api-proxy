/**
 * Cursor CLI (agent) stream-json output types.
 *
 * `agent -p --output-format stream-json --stream-partial-output --yolo`
 *
 * Message flow (per turn):
 *   system(init) -> assistant(chunk)... -> [assistant(complete)] -> tool_call... -> assistant(chunk)... -> result
 *
 * With --stream-partial-output the CLI emits incremental assistant chunks
 * followed by a complete assistant message per turn. The complete message
 * duplicates the chunks and must be deduplicated by the consumer.
 */

export interface CursorCliSystemInit {
  type: "system";
  subtype: "init";
  model?: string;
  tools?: string[];
  mcp_servers?: string[];
  cwd?: string;
  session_id?: string;
}

export interface CursorCliContentPart {
  type: "text";
  text: string;
}

export interface CursorCliAssistantMessage {
  type: "assistant";
  message: {
    /** CLI may omit or set null between turns / tool results. */
    content?: CursorCliContentPart[] | string | null;
  };
  timestamp_ms?: number;
}

export interface CursorCliToolCallStarted {
  type: "tool_call";
  subtype: "started";
  tool_call: Record<string, unknown>;
}

export interface CursorCliToolCallCompleted {
  type: "tool_call";
  subtype: "completed";
  tool_call: Record<string, unknown>;
}

/** Present on newer Cursor CLI `result` lines when usage accounting is available. */
export interface CursorCliUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface CursorCliResult {
  type: "result";
  /** e.g. "success" on newer CLIs */
  subtype?: string;
  result: string;
  duration_ms?: number;
  num_turns?: number;
  is_error?: boolean;
  session_id?: string;
  request_id?: string;
  usage?: CursorCliUsage;
}

export type CursorCliMessage =
  | CursorCliSystemInit
  | CursorCliAssistantMessage
  | CursorCliToolCallStarted
  | CursorCliToolCallCompleted
  | CursorCliResult;

export function isSystemInit(msg: CursorCliMessage): msg is CursorCliSystemInit {
  return msg.type === "system" && (msg as CursorCliSystemInit).subtype === "init";
}

export function isAssistantMessage(msg: CursorCliMessage): msg is CursorCliAssistantMessage {
  return msg.type === "assistant";
}

export function isAssistantDelta(msg: CursorCliMessage): msg is CursorCliAssistantMessage {
  return msg.type === "assistant" && typeof (msg as CursorCliAssistantMessage).timestamp_ms === "number";
}

export function isToolCallMessage(
  msg: CursorCliMessage
): msg is CursorCliToolCallStarted | CursorCliToolCallCompleted {
  return msg.type === "tool_call";
}

export function isResultMessage(msg: CursorCliMessage): msg is CursorCliResult {
  return msg.type === "result";
}
