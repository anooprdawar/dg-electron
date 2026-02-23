import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTranscribeFile } from "./tools/transcribeFile.js";
import { registerRecordAndTranscribe } from "./tools/recordAndTranscribe.js";
import { registerAnalyzeAudio } from "./tools/analyzeAudio.js";
import { registerSummarizeAudio } from "./tools/summarizeAudio.js";
import { registerTextToSpeech } from "./tools/textToSpeech.js";
import { registerCheckPermissions } from "./tools/checkPermissions.js";
import { registerListMicDevices } from "./tools/listMicDevices.js";
import { registerListenForTurn } from "./tools/listenForTurn.js";

// IMPORTANT: Never write to stdout after transport.connect() —
// stdout is exclusively used for JSON-RPC messages.
// All logging must go to stderr.

process.on("uncaughtException", (err) => {
  process.stderr.write(`[deepgram-mcp] uncaughtException: ${err.message}\n${err.stack}\n`);
});

process.on("unhandledRejection", (reason) => {
  process.stderr.write(`[deepgram-mcp] unhandledRejection: ${reason}\n`);
});

const server = new McpServer({
  name: "deepgram",
  version: "0.1.0",
});

registerTranscribeFile(server);
registerRecordAndTranscribe(server);
registerAnalyzeAudio(server);
registerSummarizeAudio(server);
registerTextToSpeech(server);
registerCheckPermissions(server);
registerListMicDevices(server);
registerListenForTurn(server);

const transport = new StdioServerTransport();

process.stderr.write("[deepgram-mcp] starting server...\n");
await server.connect(transport);
process.stderr.write("[deepgram-mcp] server connected, ready for tool calls\n");
