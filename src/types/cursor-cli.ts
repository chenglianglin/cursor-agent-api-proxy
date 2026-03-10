/**
 * Cursor CLI (agent) stream-json output types.
 *
 * `agent -p --output-format stream-json --stream-partial-output --yolo`
 *
 * Message flow:
 *   system(init) -> assistant(delta, has timestamp_ms) ... -> result
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
    content: CursorCliContentPart[];
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

export interface CursorCliResult {
  type: "result";
  result: string;
  duration_ms?: number;
  num_turns?: number;
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

export function isResultMessage(msg: CursorCliMessage): msg is CursorCliResult {
  return msg.type === "result";
}
