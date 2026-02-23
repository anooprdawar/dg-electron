import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DeepgramElectron } from "@deepgram/electron";
import type { InputDevice } from "@deepgram/electron";

const schema = {
  _placeholder: z
    .boolean()
    .optional()
    .describe("No parameters needed."),
};

export function registerListMicDevices(server: McpServer): void {
  server.tool(
    "list_mic_devices",
    "List all available microphone input devices on this Mac. " +
      "Use when the user wants to record with a specific microphone, headset, or audio interface. " +
      "The device ID returned can be passed to record_and_transcribe as 'device_id'.",
    schema,
    async (_args) => {
      process.stderr.write("[deepgram-mcp] listing mic devices\n");

      let devices: InputDevice[];
      try {
        devices = await DeepgramElectron.listInputDevices("silent");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Failed to list microphone devices: ${msg}\n\nEnsure microphone permission is granted.`,
            },
          ],
        };
      }

      if (devices.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No microphone devices found. Check that a microphone is connected and permission is granted.",
            },
          ],
        };
      }

      let out = `## Available Microphone Devices\n\n`;
      out += `| Name | Device ID | Default |\n|------|-----------|--------|\n`;
      for (const device of devices) {
        const defaultMark = device.isDefault ? "✓ default" : "";
        out += `| ${device.name} | \`${device.id}\` | ${defaultMark} |\n`;
      }

      out += `\n*Pass a device ID to \`record_and_transcribe\` as \`device_id\` to use a specific microphone.*`;

      return { content: [{ type: "text", text: out }] };
    }
  );
}
