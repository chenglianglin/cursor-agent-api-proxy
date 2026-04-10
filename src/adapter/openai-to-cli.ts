/**
 * Convert OpenAI Chat Completion requests into a prompt string
 * suitable for the Cursor CLI `agent -p` command.
 */

import type { OpenAIChatMessage, OpenAIChatRequest, OpenAIContentPart } from "../types/openai.js";

const KNOWN_CURSOR_MODELS = new Set([
  "auto",
  "composer-1.5",
  "composer-1",
  "gpt-5.3-codex",
  "gpt-5.3-codex-low",
  "gpt-5.3-codex-high",
  "gpt-5.3-codex-xhigh",
  "gpt-5.3-codex-fast",
  "gpt-5.3-codex-low-fast",
  "gpt-5.3-codex-high-fast",
  "gpt-5.3-codex-xhigh-fast",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.2-codex-high",
  "gpt-5.2-codex-low",
  "gpt-5.2-codex-xhigh",
  "gpt-5.2-codex-fast",
  "gpt-5.2-codex-high-fast",
  "gpt-5.2-codex-low-fast",
  "gpt-5.2-codex-xhigh-fast",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-max-high",
  "opus-4.6-thinking",
  "sonnet-4.5-thinking",
  "gpt-5.2-high",
  "opus-4.6",
  "opus-4.5",
  "opus-4.5-thinking",
  "sonnet-4.5",
  "gpt-5.1-high",
  "gemini-3-pro",
  "gemini-3-flash",
  "grok",
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
  if (model.startsWith("cursor/")) {
    return model.slice("cursor/".length) || "auto";
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
