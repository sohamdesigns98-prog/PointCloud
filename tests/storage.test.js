import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readFlag,
  readJson,
  remove,
  writeFlag,
  writeJson,
} from "../src/core/storage.js";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("writeJson", () => {
  it("never throws when setItem fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });
    expect(() => writeJson("k", { a: 1 })).not.toThrow();
    expect(writeJson("k", { a: 1 })).toEqual(
      expect.objectContaining({ ok: false })
    );
  });

  it("returns ok:true on success", () => {
    expect(writeJson("still-here-test", { n: 2 })).toEqual({ ok: true });
    expect(JSON.parse(localStorage.getItem("still-here-test"))).toEqual({
      n: 2,
    });
  });
});

describe("readJson", () => {
  it("returns fallback for corrupted JSON", () => {
    localStorage.setItem("bad", "{not-json");
    expect(readJson("bad", [])).toEqual([]);
  });

  it("returns fallback when getItem throws SecurityError", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(readJson("any", { safe: true })).toEqual({ safe: true });
  });
});

describe("readFlag / writeFlag / remove", () => {
  it("round-trips flags as 1/0", () => {
    expect(readFlag("flag-a")).toBe(false);
    expect(writeFlag("flag-a", true)).toBe(true);
    expect(localStorage.getItem("flag-a")).toBe("1");
    expect(readFlag("flag-a")).toBe(true);
    writeFlag("flag-a", false);
    expect(localStorage.getItem("flag-a")).toBe("0");
    remove("flag-a");
    expect(localStorage.getItem("flag-a")).toBe(null);
  });

  it("survives setItem / getItem throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota", "QuotaExceededError");
    });
    expect(writeFlag("flag-b", true)).toBe(false);

    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(readFlag("flag-b")).toBe(false);
  });
});
