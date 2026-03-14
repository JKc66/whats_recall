import { describe, test, expect } from "bun:test";
import { escapeHtml, mediaIcon } from "./utils";

describe("utils", () => {
  describe("escapeHtml", () => {
    test("should return empty string for falsy input", () => {
      expect(escapeHtml("")).toBe("");
      // @ts-ignore
      expect(escapeHtml(null)).toBe("");
      // @ts-ignore
      expect(escapeHtml(undefined)).toBe("");
    });

    test("should escape ampersands", () => {
      expect(escapeHtml("a & b")).toBe("a &amp; b");
      expect(escapeHtml("&")).toBe("&amp;");
    });

    test("should escape less than and greater than signs", () => {
      expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
      expect(escapeHtml("1 < 2 > 0")).toBe("1 &lt; 2 &gt; 0");
    });

    test("should escape multiple HTML characters", () => {
      expect(escapeHtml("<b>R&D</b>")).toBe("&lt;b&gt;R&amp;D&lt;/b&gt;");
    });
  });

  describe("mediaIcon", () => {
    test("should return correct icon for known types", () => {
      expect(mediaIcon("image")).toBe("🖼️");
      expect(mediaIcon("video")).toBe("🎬");
      expect(mediaIcon("audio")).toBe("🎵");
      expect(mediaIcon("ptt")).toBe("🎙️");
      expect(mediaIcon("document")).toBe("📄");
      expect(mediaIcon("sticker")).toBe("🏷️");
    });

    test("should return default attachment icon for unknown types", () => {
      expect(mediaIcon("unknown")).toBe("📎");
      expect(mediaIcon("text")).toBe("📎");
      expect(mediaIcon("")).toBe("📎");
      expect(mediaIcon("123")).toBe("📎");
    });

    test("should handle case sensitivity (currently defaults for uppercase)", () => {
      // The current implementation uses strict lowercase matching
      expect(mediaIcon("Image")).toBe("📎");
      expect(mediaIcon("IMAGE")).toBe("📎");
      expect(mediaIcon("Video")).toBe("📎");
    });

    test("should return default icon for falsy values", () => {
      // @ts-ignore
      expect(mediaIcon(null)).toBe("📎");
      // @ts-ignore
      expect(mediaIcon(undefined)).toBe("📎");
    });
  });
});
