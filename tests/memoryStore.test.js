import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import {
  appendUserMemory,
  loadUserMemories,
  mergeMemories,
  saveUserMemories,
} from "../src/memoryStore.js";

const STORAGE_KEY = "still-here-user-memories-v1";

function baseMemory(overrides = {}) {
  return {
    id: "u-test-1",
    title: "Harbour edge",
    body: "I stood here longer than I meant to.",
    relationship: "firstTime",
    region: "harbour",
    emotion: "Joy",
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("appendUserMemory / loadUserMemories", () => {
  it("round-trips a valid memory through localStorage", () => {
    const { ok, memories } = appendUserMemory(baseMemory());
    expect(ok).toBe(true);
    expect(memories).toHaveLength(1);
    expect(loadUserMemories()).toEqual(memories);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toHaveLength(1);
  });

  it("rejects invalid relationship or region (returns previous list unchanged)", () => {
    appendUserMemory(baseMemory());
    const rejectedRel = appendUserMemory(
      baseMemory({ id: "bad-rel", relationship: "never" })
    );
    expect(rejectedRel.ok).toBe(false);
    expect(rejectedRel.memories).toHaveLength(1);

    const rejectedRegion = appendUserMemory(
      baseMemory({ id: "bad-region", region: "roof" })
    );
    expect(rejectedRegion.ok).toBe(false);
    expect(rejectedRegion.memories).toHaveLength(1);
  });

  it("truncates body to 280 and title to 48", () => {
    const body = "x".repeat(400);
    const title = "T".repeat(60);
    const { memories } = appendUserMemory(baseMemory({ body, title }));
    expect(memories[0].body).toHaveLength(280);
    expect(memories[0].title).toHaveLength(48);
  });

  it('drops audioDataUrl that does not start with "data:audio"', () => {
    const { memories: first } = appendUserMemory(
      baseMemory({ audioDataUrl: "https://example.com/clip.mp3" })
    );
    expect(first[0].audioDataUrl).toBeUndefined();

    const { memories: list } = appendUserMemory(
      baseMemory({
        id: "with-audio",
        audioDataUrl: "data:audio/webm;base64,AAA",
      })
    );
    const kept = list.find((m) => m.id === "with-audio");
    expect(kept.audioDataUrl).toBe("data:audio/webm;base64,AAA");
  });

  it("returns fallback when getItem throws SecurityError", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([baseMemory()]));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(loadUserMemories()).toEqual([]);
  });

  it("returns [] for corrupted JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not-json");
    expect(loadUserMemories()).toEqual([]);
  });
});

describe("mergeMemories", () => {
  it("lets user memory win on colliding ids", () => {
    const seed = [baseMemory({ id: "shared", body: "seed body" })];
    const user = [baseMemory({ id: "shared", body: "user body" })];
    const merged = mergeMemories(seed, user);
    expect(merged).toHaveLength(1);
    expect(merged[0].body).toBe("user body");
  });
});

describe("appendUserMemory storage fallback", () => {
  it("drops audio when setItem throws once, but still saves the memory", () => {
    const original = Storage.prototype.setItem;
    let calls = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      key,
      value
    ) {
      calls += 1;
      if (calls === 1) {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      }
      return original.call(this, key, value);
    });

    const result = appendUserMemory(
      baseMemory({
        id: "audio-fallback",
        audioDataUrl: "data:audio/webm;base64,BBB",
      })
    );

    expect(result.ok).toBe(true);
    expect(result.audioDropped).toBe(true);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].audioDataUrl).toBeUndefined();
    expect(loadUserMemories()[0].id).toBe("audio-fallback");
  });

  it("does not throw when storage is fully unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });

    let result;
    expect(() => {
      result = appendUserMemory(
        baseMemory({
          id: "no-storage",
          audioDataUrl: "data:audio/webm;base64,CCC",
        })
      );
    }).not.toThrow();

    expect(result.ok).toBe(false);
    expect(result.audioDropped).toBe(false);
    expect(result.memories).toEqual([]);
    expect(loadUserMemories()).toEqual([]);
  });
});

describe("saveUserMemories", () => {
  it("persists cleaned list", () => {
    const cleaned = saveUserMemories([
      baseMemory({ id: "a" }),
      { id: "junk" },
    ]);
    expect(cleaned).toHaveLength(1);
    expect(loadUserMemories()).toHaveLength(1);
  });
});
