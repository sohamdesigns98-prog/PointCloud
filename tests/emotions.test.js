import { describe, expect, it } from "vitest";
import {
  emotionMatchesFilter,
  normalizeEmotion,
} from "../src/emotions.js";

describe("normalizeEmotion", () => {
  it('maps "sadness" alias to Pain', () => {
    expect(normalizeEmotion("sadness")).toBe("Pain");
  });

  it("is case- and space-insensitive for known emotions", () => {
    expect(normalizeEmotion("  JOY  ")).toBe("Joy");
    expect(normalizeEmotion("NoStAlGiA")).toBe("Nostalgia");
    expect(normalizeEmotion("love")).toBe("Love");
  });

  it("returns null for empty or junk values", () => {
    expect(normalizeEmotion(null)).toBe(null);
    expect(normalizeEmotion("")).toBe(null);
    expect(normalizeEmotion("not-an-emotion")).toBe(null);
  });
});

describe("emotionMatchesFilter", () => {
  it('treats "All" (and falsy) as matching everything', () => {
    expect(emotionMatchesFilter("Joy", "All")).toBe(true);
    expect(emotionMatchesFilter("Pain", null)).toBe(true);
    expect(emotionMatchesFilter("Love", "Love")).toBe(true);
    expect(emotionMatchesFilter("Joy", "Pain")).toBe(false);
  });
});
