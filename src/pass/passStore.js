/** Memory Pass persistence — one pass per device. */

import { readJson, writeJson, remove } from "../core/storage.js";
import { MAX_PASS_NAME, PASS_ART_IDS } from "./passArt.js";

const STORAGE_KEY = "stillhere.pass";
const LEGACY_KEY = "still-here-memory-pass-v1";

const listeners = new Set();

/**
 * @typedef {{ id: string, name: string, art: string, issuedAt: number }} MemoryPass
 */

function emit() {
  const pass = getPass();
  for (const fn of listeners) {
    try {
      fn(pass);
    } catch {
      /* ignore listener errors */
    }
  }
}

/** @param {(pass: MemoryPass | null) => void} fn */
export function onPassChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function randomPassId() {
  const hex = () =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .toUpperCase()
      .padStart(4, "0");
  return `SH-${hex()}-${hex()}`;
}

/**
 * @param {unknown} raw
 * @returns {MemoryPass | null}
 */
function normalizePass(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "")
    .trim()
    .slice(0, MAX_PASS_NAME)
    .toUpperCase();
  const art = String(raw.art || "").toLowerCase();
  if (!name || !PASS_ART_IDS.has(art)) return null;
  const id = String(raw.id || "").toUpperCase();
  if (!/^SH-[0-9A-F]{4}-[0-9A-F]{4}$/.test(id)) return null;
  const issuedAt = Number(raw.issuedAt) || Date.now();
  return { id, name, art, issuedAt };
}

/** @returns {MemoryPass | null} */
export function getPass() {
  return normalizePass(readJson(STORAGE_KEY, null));
}

/** @deprecated use getPass */
export function loadPass() {
  return getPass();
}

export function hasPass() {
  return Boolean(getPass());
}

/**
 * Create a new pass at bind time. Generates id + issuedAt once.
 * @param {{ name: string, art: string }} draft
 * @returns {MemoryPass | null}
 */
export function createPass(draft) {
  const name = String(draft?.name || "VISITOR")
    .trim()
    .slice(0, MAX_PASS_NAME)
    .toUpperCase() || "VISITOR";
  const art = String(draft?.art || "").toLowerCase();
  if (!PASS_ART_IDS.has(art)) return null;
  const pass = {
    id: randomPassId(),
    name,
    art,
    issuedAt: Date.now(),
  };
  const { ok } = writeJson(STORAGE_KEY, pass);
  if (!ok) return null;
  remove(LEGACY_KEY);
  emit();
  return pass;
}

/**
 * Update name/art; keeps id and issuedAt.
 * @param {{ name?: string, art?: string }} patch
 * @returns {MemoryPass | null}
 */
export function updatePass(patch) {
  const prev = getPass();
  if (!prev) return null;
  const name = String(patch?.name ?? prev.name)
    .trim()
    .slice(0, MAX_PASS_NAME)
    .toUpperCase() || prev.name;
  const art = String(patch?.art ?? prev.art).toLowerCase();
  if (!PASS_ART_IDS.has(art)) return null;
  const next = { ...prev, name, art };
  const { ok } = writeJson(STORAGE_KEY, next);
  if (!ok) return null;
  emit();
  return next;
}

export function clearPass() {
  remove(STORAGE_KEY);
  remove(LEGACY_KEY);
  emit();
}
