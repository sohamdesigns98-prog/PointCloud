import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import {
  isBookmarked,
  loadBookmarks,
  toggleBookmark,
} from "../src/bookmarkStore.js";

const STORAGE_KEY = "still-here-bookmarks-v1";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toggleBookmark", () => {
  it("toggles on then off", () => {
    const memory = {
      id: "m1",
      title: "Steps",
      body: "Cold wind off the water.",
      emotion: "Nostalgia",
      place: "Opera House",
    };

    const on = toggleBookmark(memory);
    expect(on.saved).toBe(true);
    expect(on.ok).toBe(true);
    expect(isBookmarked("m1")).toBe(true);
    expect(on.list).toHaveLength(1);

    const off = toggleBookmark(memory);
    expect(off.saved).toBe(false);
    expect(off.ok).toBe(true);
    expect(isBookmarked("m1")).toBe(false);
    expect(off.list).toHaveLength(0);
  });

  it("keeps newest bookmarks first", () => {
    toggleBookmark({ id: "older", body: "first", title: "A" });
    toggleBookmark({ id: "newer", body: "second", title: "B" });
    const ids = loadBookmarks().map((b) => b.id);
    expect(ids[0]).toBe("newer");
    expect(ids[1]).toBe("older");
  });

  it("stores snippet at most 80 characters", () => {
    const body = "y".repeat(120);
    const { list } = toggleBookmark({
      id: "long",
      title: "Long",
      body,
      emotion: "Joy",
    });
    expect(list[0].snippet).toHaveLength(80);
  });
});

describe("loadBookmarks", () => {
  it("returns [] for corrupted JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not-json");
    expect(loadBookmarks()).toEqual([]);
  });
});

describe("toggleBookmark storage failure", () => {
  it("returns ok:false when setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });
    const result = toggleBookmark({
      id: "m-fail",
      title: "X",
      body: "y",
    });
    expect(result.ok).toBe(false);
    expect(result.saved).toBe(true);
    expect(isBookmarked("m-fail")).toBe(false);
  });
});
