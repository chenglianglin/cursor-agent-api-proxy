/**
 * Convert OpenAI Chat Completion requests into a prompt string
 * suitable for the Cursor CLI `agent -p` command.
 */

import type { OpenAIChatMessage, OpenAIChatRequest, OpenAIContentPart } from "../types/openai.js";

const KNOWN_CURSOR_MODELS = new Set([
  "auto",
  "composer-2-fast",
  "composer-2",
  "gpt-5.3-codex",
  "gpt-5.3-codex-fast",
  "gpt-5.3-codex-high",
  "gpt-5.3-codex-high-fast",
  "gpt-5.3-codex-xhigh",
  "gpt-5.3-codex-xhigh-fast",
  "claude-4.5-opus-high",
  "claude-4.5-opus-high-thinking",
  "claude-4.5-sonnet",
  "claude-4.5-sonnet-thinking",
  "gemini-3-pro",
  "gemini-3-flash"
]);

export interface CliInput {
  prompt: string;
  model: string;
}

/**
 * Resolve the Cursor CLI model name from an OpenAI-style model string.
 *
 * Supported formats:
 *   "cursor/opus-4.6"     -> "opus-4.6"
 *   "cursor-opus-4.6"     -> "opus-4.6"
 *   "auto"                -> "auto"
 *   "opus-4.6-thinking"   -> "opus-4.6-thinking"
 */
export function extractModel(model: string): string {
  for (const prefix of ["cursor-local/", "cursor/"]) {
    if (model.startsWith(prefix)) {
      return model.slice(prefix.length) || "auto";
    }
  }

  if (model.startsWith("cursor-")) {
    const remainder = model.slice("cursor-".length);
    if (remainder && KNOWN_CURSOR_MODELS.has(remainder)) {
      return remainder;
    }
    if (remainder) return remainder;
  }

  if (KNOWN_CURSOR_MODELS.has(model)) {
    return model;
  }

  // Unknown model name without any prefix: pass through as-is.
  // Cursor CLI will reject it if unsupported; avoids silent fallback to "auto".
  if (model && model !== "auto") {
    return model;
  }

  return "auto";
}

function messageContentToText(content: string | OpenAIContentPart[] | null | undefined): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter((part): part is OpenAIContentPart & { type: "text" } => part?.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

/**
 * Flatten an array of OpenAI messages into a single prompt string.
 *
 * When there's only one user message (the common case), pass the text
 * directly without role markers to keep the prompt clean.
 * Multi-turn conversations get [System]/[User]/[Assistant] prefixes.
 */
export function messagesToPrompt(messages: OpenAIChatMessage[]): string {
  const nonEmpty = messages.filter((m) => {
    const text = messageContentToText(m.content);
    return text.length > 0;
  });

  if (nonEmpty.length === 1 && nonEmpty[0].role === "user") {
    return messageContentToText(nonEmpty[0].content);
  }

  const parts: string[] = [];
  for (const msg of nonEmpty) {
    const text = messageContentToText(msg.content);
    switch (msg.role) {
      case "system":
        parts.push(`[System]\n${text}`);
        break;
      case "user":
        parts.push(`[User]\n${text}`);
        break;
      case "assistant":
        parts.push(`[Assistant]\n${text}`);
        break;
    }
  }

  return parts.join("\n\n");
}

export function openaiToCli(request: OpenAIChatRequest): CliInput {
  return {
    prompt: messagesToPrompt(request.messages),
    model: extractModel(request.model || "auto"),
  };
}
