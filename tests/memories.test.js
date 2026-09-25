import { describe, expect, it } from "vitest";
import { EMOTIONS } from "../src/emotions.js";
import {
  autoTitleFromBody,
  memories,
  REGION_LABELS,
  RELATIONSHIP_LABELS,
} from "../src/memories.js";

describe("autoTitleFromBody", () => {
  it('returns "A memory" for empty input', () => {
    expect(autoTitleFromBody("")).toBe("A memory");
    expect(autoTitleFromBody("   ")).toBe("A memory");
  });

  it("uses up to the first four words of the first sentence", () => {
    expect(autoTitleFromBody("We sat on the steps until late.")).toBe(
      "We sat on the"
    );
  });

  it("stops at the first sentence boundary", () => {
    expect(autoTitleFromBody("Quiet. Then the ferry horn.")).toBe("Quiet");
  });

  it("ellipsizes when the four-word span is longer than 28 chars", () => {
    // Characterize: words joined, then slice(0, 26) + … if length > 28
    const title = autoTitleFromBody(
      "Extraordinary circumstances surround everything here tonight."
    );
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(27);
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
