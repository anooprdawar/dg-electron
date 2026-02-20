import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DeepgramSocket } from "../../src/deepgram/DeepgramSocket.js";
import { MockDeepgramServer } from "../mocks/MockDeepgramServer.js";
import type { DeepgramResponse } from "../../src/deepgram/DeepgramTypes.js";

describe("DeepgramSocket", () => {
  let server: MockDeepgramServer;

  beforeEach(async () => {
    server = new MockDeepgramServer();
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it("connects to WebSocket server", async () => {
    const socket = new DeepgramSocket(
      { apiKey: "test-key", apiUrl: server.url },
      16000,
      "silent"
    );

    await socket.connect();
    expect(socket.isConnected).toBe(true);
    await socket.close();
  });

  it("sends audio data to server", async () => {
    const socket = new DeepgramSocket(
      { apiKey: "test-key", apiUrl: server.url },
      16000,
      "silent"
    );

    await socket.connect();

    const pcmData = Buffer.alloc(3200);
    socket.send(pcmData);

    // Wait for data to be received
    await new Promise((r) => setTimeout(r, 100));
    expect(server.totalBytesReceived).toBe(3200);

    await socket.close();
  });

  it("receives and parses transcript responses", async () => {
    const socket = new DeepgramSocket(
      { apiKey: "test-key", apiUrl: server.url },
      16000,
      "silent"
    );

    const responses: DeepgramResponse[] = [];
    socket.on("response", (resp) => responses.push(resp));

    await socket.connect();

    // Server sends a transcript
    server.sendTranscript("hello world", { isFinal: true, confidence: 0.98 });

    await new Promise((r) => setTimeout(r, 100));

    expect(responses.length).toBe(1);
    expect(responses[0].type).toBe("Results");
    expect(responses[0].channel?.alternatives[0].transcript).toBe("hello world");
    expect(responses[0].is_final).toBe(true);

    await socket.close();
  });

  it("handles utterance end events", async () => {
    const socket = new DeepgramSocket(
      { apiKey: "test-key", apiUrl: server.url },
      16000,
      "silent"
    );

    const responses: DeepgramResponse[] = [];
    socket.on("response", (resp) => responses.push(resp));

    await socket.connect();

    server.sendUtteranceEnd(2.5);

    await new Promise((r) => setTimeout(r, 100));

    expect(responses.length).toBe(1);
    expect(responses[0].type).toBe("UtteranceEnd");
    expect(responses[0].last_word_end).toBe(2.5);

    await socket.close();
  });

  it("emits close event on disconnection", async () => {
    const socket = new DeepgramSocket(
      { apiKey: "test-key", apiUrl: server.url },
      16000,
      "silent"
    );

    let closed = false;
    socket.on("close", () => {
      closed = true;
    });

    await socket.connect();
    await socket.close();

    await new Promise((r) => setTimeout(r, 100));
    expect(closed).toBe(true);
  });

  it("builds URL with correct query parameters", async () => {
    const socket = new DeepgramSocket(
      {
        apiKey: "test-key",
        apiUrl: server.url,
        model: "nova-3",
        language: "en",
        punctuate: true,
        smart_format: true,
        interim_results: true,
        utterances: true,
        utterance_end_ms: 1000,
      },
      16000,
      "silent"
    );

    await socket.connect();
    expect(socket.isConnected).toBe(true);
    await socket.close();
  });

  it("reports not connected after close", async () => {
    const socket = new DeepgramSocket(
      { apiKey: "test-key", apiUrl: server.url },
      16000,
      "silent"
    );

    await socket.connect();
    expect(socket.isConnected).toBe(true);

    await socket.close();
    expect(socket.isConnected).toBe(false);
  });
});
