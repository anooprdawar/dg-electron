import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger } from "../../src/util/logger.js";

describe("Logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prefixes messages with component name", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = new Logger("test-comp", "error");
    logger.error("hello");
    expect(spy).toHaveBeenCalledWith("[@deepgram/electron:test-comp]", "hello");
  });

  it("respects log level - debug hidden at warn level", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const logger = new Logger("test", "warn");
    logger.debug("should not appear");
    expect(spy).not.toHaveBeenCalled();
  });

  it("respects log level - error shown at warn level", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = new Logger("test", "warn");
    logger.error("should appear");
    expect(spy).toHaveBeenCalled();
  });

  it("silent level suppresses all output", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const logger = new Logger("test", "silent");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("can change log level at runtime", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const logger = new Logger("test", "error");

    logger.debug("hidden");
    expect(spy).not.toHaveBeenCalled();

    logger.setLevel("debug");
    logger.debug("visible");
    expect(spy).toHaveBeenCalledOnce();
  });
});
