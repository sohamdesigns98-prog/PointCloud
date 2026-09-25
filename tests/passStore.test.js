import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPass,
  createPass,
  getPass,
  hasPass,
  onPassChange,
  updatePass,
} from "../src/pass/passStore.js";
import { MAX_PASS_NAME } from "../src/pass/passArt.js";

beforeEach(() => {
  clearPass();
});

describe("createPass / getPass", () => {
  it(`trims name to ${MAX_PASS_NAME} characters and uppercases`, () => {
    const saved = createPass({
      name: "  " + "n".repeat(30) + "  ",
      art: "pass-02",
    });
    expect(saved.name).toHaveLength(MAX_PASS_NAME);
    expect(saved.name).toBe("N".repeat(MAX_PASS_NAME));
    expect(getPass().art).toBe("pass-02");
    expect(saved.id).toMatch(/^SH-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(typeof saved.issuedAt).toBe("number");
  });

  it("rejects invalid art (returns null)", () => {
    expect(createPass({ name: "Sam", art: "nope" })).toBe(null);
    expect(hasPass()).toBe(false);
  });

  it("emits change events", () => {
    const spy = vi.fn();
    const off = onPassChange(spy);
    createPass({ name: "Sam", art: "pass-01" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].name).toBe("SAM");
    off();
  });
});

describe("updatePass", () => {
  it("keeps id and issuedAt when editing", () => {
    const created = createPass({ name: "Sam", art: "pass-01" });
    const updated = updatePass({ name: "Alex", art: "pass-03" });
    expect(updated.id).toBe(created.id);
    expect(updated.issuedAt).toBe(created.issuedAt);
    expect(updated.name).toBe("ALEX");
    expect(updated.art).toBe("pass-03");
  });
});

describe("hasPass", () => {
  it("reflects whether a valid pass is stored", () => {
    expect(hasPass()).toBe(false);
    createPass({ name: "Sam", art: "pass-04" });
    expect(hasPass()).toBe(true);
  });
});
