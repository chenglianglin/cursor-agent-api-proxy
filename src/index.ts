/**
 * cursor-agent-api-proxy — package entry point.
 */

export { CursorSubprocess, verifyCursorCli } from "./subprocess/manager.js";
export type { SubprocessOptions, ContentDeltaEvent, ResultEvent } from "./subprocess/manager.js";

export { startServer, stopServer, getServer } from "./server/index.js";
export type { ServerConfig } from "./server/index.js";

export { openaiToCli, extractModel, messagesToPrompt } from "./adapter/openai-to-cli.js";
export {
  createStreamChunk,
  createDoneChunk,
  createChatResponse,
} from "./adapter/cli-to-openai.js";
