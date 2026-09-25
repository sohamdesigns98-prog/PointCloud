/** Guarded localStorage helpers — never throw to callers. */

/**
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === "") return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {{ ok: boolean, error?: unknown }}
 */
export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/** @param {string} key */
export function readFlag(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * @param {string} key
 * @param {boolean} bool
 * @returns {boolean} whether the write succeeded
 */
export function writeFlag(key, bool) {
  try {
    localStorage.setItem(key, bool ? "1" : "0");
    return true;
  } catch {
    return false;
  }
}

/** @param {string} key */
export function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
