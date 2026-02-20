import { describe, it, expect, vi, afterEach } from "vitest";
import { PlatformError } from "../../src/errors.js";

let mockVersion = "14.5.0\n";

vi.mock("node:child_process", () => {
  return {
    execSync: () => mockVersion,
  };
});

// Import after mock setup
import { getMacOSVersion, assertPlatform } from "../../src/util/platform.js";

describe("platform", () => {
  afterEach(() => {
    mockVersion = "14.5.0\n";
  });

  describe("getMacOSVersion", () => {
    it("returns version tuple on macOS", () => {
      mockVersion = "14.5.0\n";
      const [major, minor, patch] = getMacOSVersion();
      expect(major).toBe(14);
      expect(minor).toBe(5);
      expect(patch).toBe(0);
    });

    it("handles two-part version numbers", () => {
      mockVersion = "15.0\n";
      const [major, minor, patch] = getMacOSVersion();
      expect(major).toBe(15);
      expect(minor).toBe(0);
      expect(patch).toBe(0);
    });
  });

  describe("assertPlatform", () => {
    it("passes for macOS 14.2+", () => {
      mockVersion = "14.2.0\n";
      expect(() => assertPlatform()).not.toThrow();
    });

    it("passes for macOS 15.0", () => {
      mockVersion = "15.0.0\n";
      expect(() => assertPlatform()).not.toThrow();
    });

    it("throws for macOS 14.0", () => {
      mockVersion = "14.0.0\n";
      expect(() => assertPlatform()).toThrow(PlatformError);
    });

    it("throws for macOS 13.x", () => {
      mockVersion = "13.6.0\n";
      expect(() => assertPlatform()).toThrow(PlatformError);
    });
  });
});
