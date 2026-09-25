import { describe, expect, it } from "vitest";
import { EMOTIONS } from "../src/emotions.js";
import {
  autoTitleFromBody,
  memories,
  MAX_BODY_CHARS,
  MIN_BODY_CHARS,
  REGION_LABELS,
  RELATIONSHIP_LABELS,
} from "../src/memories.js";

describe("body limits", () => {
  it("exposes 20–400 character bounds", () => {
    expect(MIN_BODY_CHARS).toBe(20);
    expect(MAX_BODY_CHARS).toBe(400);
  });
});

describe("autoTitleFromBody", () => {
  it('returns "A memory" for empty input', () => {
    expect(autoTitleFromBody("")).toBe("A memory");
    expect(autoTitleFromBody("   ")).toBe("A memory");
  });

  it("uses up to the first five words", () => {
    expect(autoTitleFromBody("We sat on the steps until late.")).toBe(
      "We sat on the steps"
    );
  });

  it("keeps short bodies as-is when under five words", () => {
    expect(autoTitleFromBody("Quiet harbour light")).toBe("Quiet harbour light");
  });

  it("ellipsizes when the five-word span is longer than 48 chars", () => {
    const title = autoTitleFromBody(
      "Supercalifragilisticexpialidocious wonderful magnificent extraordinary breathtaking view"
    );
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(48);
  });
});

describe("seed memories integrity", () => {
  it("has 50 entries with unique ids", () => {
    expect(memories).toHaveLength(50);
    expect(new Set(memories.map((m) => m.id)).size).toBe(50);
  });

  it("uses only valid relationship and region keys", () => {
    for (const m of memories) {
      expect(RELATIONSHIP_LABELS).toHaveProperty(m.relationship);
      expect(REGION_LABELS).toHaveProperty(m.region);
    }
  });

  it("covers every canonical emotion at least once", () => {
    const present = new Set(memories.map((m) => m.emotion));
    for (const e of EMOTIONS) {
      expect(present.has(e)).toBe(true);
    }
  });
});
