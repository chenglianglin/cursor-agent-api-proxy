/**
 * Convert Cursor CLI output events into OpenAI Chat Completion format.
 */

import type {
  OpenAIChatResponse,
  OpenAIChatChunk,
  OpenAICompletionUsage,
  OpenAIStreamToolCallDelta,
} from "../types/openai.js";

export function createStreamChunk(
  requestId: string,
  model: string,
  text: string,
  isFirst: boolean
): OpenAIChatChunk {
  return {
    id: `chatcmpl-${requestId}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {
          role: isFirst ? "assistant" : undefined,
          content: text,
        },
        finish_reason: null,
      },
    ],
  };
}

/**
 * OpenClaw (and other OpenAI clients) consume `delta.tool_calls` to build native tool cards.
 * Each Cursor `tool_call` (started) should map to one delta item with a stable `index`.
 */
export function createToolCallsStreamChunk(
  requestId: string,
  model: string,
  toolCalls: OpenAIStreamToolCallDelta[],
  isFirst: boolean
): OpenAIChatChunk {
  return {
    id: `chatcmpl-${requestId}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {
          ...(isFirst ? { role: "assistant" as const } : {}),
          tool_calls: toolCalls,
        },
        finish_reason: null,
      },
    ],
  };
}

export function createDoneChunk(
  requestId: string,
  model: string,
  usage?: OpenAICompletionUsage,
  finishReason: "stop" | "tool_calls" = "stop"
): OpenAIChatChunk {
  const chunk: OpenAIChatChunk = {
    id: `chatcmpl-${requestId}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: finishReason,
      },
    ],
  };
  chunk.usage = usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
  return chunk;
}

export function createChatResponse(
  requestId: string,
  model: string,
  text: string,
  usage?: OpenAICompletionUsage
): OpenAIChatResponse {
  return {
    id: `chatcmpl-${requestId}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
        },
        finish_reason: "stop",
      },
    ],
    usage: usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}
