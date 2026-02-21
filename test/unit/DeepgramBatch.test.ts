import { describe, it, expect } from "vitest";
import { DeepgramBatch } from "../../src/deepgram/DeepgramBatch.js";

describe("DeepgramBatch", () => {
  it("accumulates audio chunks", () => {
    const batch = new DeepgramBatch(
      { apiKey: "test-key", model: "nova-3" },
      16000,
      "silent"
    );
    batch.addChunk(Buffer.alloc(640));
    batch.addChunk(Buffer.alloc(640));
    expect(batch.bytesRecorded).toBe(1280);
  });

  it("builds correct URL with query params", () => {
    const batch = new DeepgramBatch(
      { apiKey: "test-key", model: "nova-3", language: "en", punctuate: true },
      16000,
      "silent"
    );
    const url = (batch as any).buildUrl();
    expect(url).toContain("/v1/listen");
    expect(url).toContain("model=nova-3");
    expect(url).toContain("sample_rate=16000");
    expect(url).toContain("encoding=linear16");
  });

  it("rejects transcribe() with no audio", async () => {
    const batch = new DeepgramBatch({ apiKey: "test-key" }, 16000, "silent");
    await expect(batch.transcribe()).rejects.toThrow("No audio");
  });

  it("resets after clear()", () => {
    const batch = new DeepgramBatch({ apiKey: "test-key" }, 16000, "silent");
    batch.addChunk(Buffer.alloc(640));
    batch.clear();
    expect(batch.bytesRecorded).toBe(0);
  });
});
