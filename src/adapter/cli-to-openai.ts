/**
 * Convert Cursor CLI output events into OpenAI Chat Completion format.
 */

import type {
  OpenAIChatResponse,
  OpenAIChatChunk,
  OpenAICompletionUsage,
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

export function createDoneChunk(
  requestId: string,
  model: string,
  usage?: OpenAICompletionUsage
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
        finish_reason: "stop",
      },
    ],
  };
  if (usage) {
    chunk.usage = usage;
  }
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
