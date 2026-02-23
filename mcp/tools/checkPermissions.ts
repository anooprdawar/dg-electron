import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DeepgramElectron } from "@deepgram/electron";

const schema = {
  _placeholder: z
    .boolean()
    .optional()
    .describe("No parameters needed."),
};

export function registerCheckPermissions(server: McpServer): void {
  server.tool(
    "check_audio_permissions",
    "Check whether macOS microphone and system audio permissions are granted. " +
      "Call this first if the user reports that recording is not working, " +
      "or before starting any live recording session.",
    schema,
    async (_args) => {
      process.stderr.write("[deepgram-mcp] checking audio permissions\n");

      let result: { microphone: string; systemAudio: string };
      try {
        result = await DeepgramElectron.checkPermissions("silent");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Failed to check permissions: ${msg}\n\nEnsure you are on macOS 14.2+ (Sonoma).`,
            },
          ],
        };
      }

      const micIcon =
        result.microphone === "granted" ? "✅" : result.microphone === "denied" ? "❌" : "❓";
      const sysIcon =
        result.systemAudio === "granted"
          ? "✅"
          : result.systemAudio === "denied"
            ? "❌"
            : "❓";

      let out = `## macOS Audio Permissions\n\n`;
      out += `| Permission | Status |\n|-----------|--------|\n`;
      out += `| ${micIcon} Microphone | **${result.microphone}** |\n`;
      out += `| ${sysIcon} System Audio | **${result.systemAudio}** |\n`;

      const fixes: string[] = [];

      if (result.microphone === "denied") {
        fixes.push(
          "**Microphone:** Open **System Settings → Privacy & Security → Microphone** and add your terminal app (Terminal or iTerm2)."
        );
      }
      if (result.systemAudio === "denied") {
        fixes.push(
          "**System Audio:** Open **System Settings → Privacy & Security → Screen Recording** and add your terminal app."
        );
      }
      if (result.microphone === "unknown") {
        fixes.push(
          "**Microphone:** Status unknown — try running a recording and macOS will prompt you for permission."
        );
      }

      if (fixes.length > 0) {
        out += `\n### How to Fix\n\n${fixes.join("\n\n")}`;
        out += `\n\nAfter granting permissions, **restart your terminal** and try again.`;
      } else {
        out += `\n✅ All required permissions are granted. You are ready to record!`;
      }

      return { content: [{ type: "text", text: out }] };
    }
  );
}
