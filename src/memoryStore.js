/** Local persistence for visitor-left Opera House memories. */

import { normalizeEmotion } from "./emotions.js";
import { readJson, writeJson, remove } from "./core/storage.js";

const STORAGE_KEY = "stillhere.memories.local";
const LEGACY_KEY = "still-here-user-memories-v1";

const VALID_RELATIONSHIPS = new Set([
  "firstTime",
  "often",
  "usedTo",
  "passingThrough",
]);
const VALID_REGIONS = new Set(["steps", "sails", "harbour", "forecourt"]);

const MAX_BODY = 400;
const listeners = new Set();

function emit(list) {
  for (const fn of listeners) {
    try {
      fn(list);
    } catch {
      /* ignore */
    }
  }
}

/** @param {(list: object[]) => void} fn */
export function onMemoriesChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function migrateLegacyIfNeeded() {
  const current = readJson(STORAGE_KEY, null);
  if (Array.isArray(current)) return;
  const legacy = readJson(LEGACY_KEY, null);
  if (!Array.isArray(legacy) || !legacy.length) return;
  const cleaned = legacy.map(normalizeMemory).filter(Boolean);
  writeJson(STORAGE_KEY, cleaned);
  remove(LEGACY_KEY);
}

/** @returns {object[]} */
export function getMemories() {
  migrateLegacyIfNeeded();
  const parsed = readJson(STORAGE_KEY, null);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeMemory).filter(Boolean);
}

/** @deprecated use getMemories */
export function loadUserMemories() {
  return getMemories();
}

export function saveUserMemories(list) {
  const cleaned = list.map(normalizeMemory).filter(Boolean);
  const { ok, error } = writeJson(STORAGE_KEY, cleaned);
  if (!ok) {
    throw error instanceof Error ? error : new Error("Storage write failed");
  }
  emit(cleaned);
  return cleaned;
}

/**
 * @param {object} memory
 * @returns {{ ok: boolean, audioDropped: boolean, memories: object[], memory?: object }}
 */
export function addMemory(memory) {
  return appendUserMemory(memory);
}

/**
 * @param {object} memory
 * @returns {{ ok: boolean, audioDropped: boolean, memories: object[], memory?: object }}
 */
export function appendUserMemory(memory) {
  const normalized = normalizeMemory(memory);
  const prev = getMemories();
  if (!normalized) {
    return { ok: false, audioDropped: false, memories: prev };
  }

  const next = [...prev.filter((m) => m.id !== normalized.id), normalized];
  const full = writeMemories(next);
  if (full.ok) {
    emit(full.cleaned);
    return {
      ok: true,
      audioDropped: false,
      memories: full.cleaned,
      memory: normalized,
    };
  }

  if (normalized.audioDataUrl) {
    const slim = { ...normalized };
    delete slim.audioDataUrl;
    const fallback = [...prev.filter((m) => m.id !== slim.id), slim];
    const retry = writeMemories(fallback);
    if (retry.ok) {
      emit(retry.cleaned);
      return {
        ok: true,
        audioDropped: true,
        memories: retry.cleaned,
        memory: slim,
      };
    }
  }

  return { ok: false, audioDropped: false, memories: prev };
}

function writeMemories(list) {
  const cleaned = list.map(normalizeMemory).filter(Boolean);
  const { ok } = writeJson(STORAGE_KEY, cleaned);
  return { ok, cleaned };
}

function normalizeMemory(m) {
  if (!m || typeof m !== "object") return null;
  if (!m.id || !m.body || !VALID_RELATIONSHIPS.has(m.relationship)) return null;
  if (!VALID_REGIONS.has(m.region)) return null;
  const out = {
    id: String(m.id),
    title: String(m.title || "A memory").slice(0, 48),
    body: String(m.body).slice(0, MAX_BODY),
    relationship: m.relationship,
    region: m.region,
    local: Boolean(m.local),
    createdAt: Number(m.createdAt) || Date.now(),
  };
  const emotion = normalizeEmotion(m.emotion);
  if (emotion) out.emotion = emotion;
  const author = m.author ?? m.authorName;
  if (author) {
    out.author = String(author).slice(0, 18);
    out.authorName = out.author;
  }
  if (m.audioDataUrl && String(m.audioDataUrl).startsWith("data:audio")) {
    out.audioDataUrl = m.audioDataUrl;
  }
  if (m.place) out.place = String(m.place);
  if (
    Array.isArray(m.position) &&
    m.position.length >= 3 &&
    m.position.every((n) => Number.isFinite(Number(n)))
  ) {
    out.position = [
      Number(m.position[0]),
      Number(m.position[1]),
      Number(m.position[2]),
    ];
  }
  return out;
}

/** Merge seed + local user memories (user ids win on collision). */
export function mergeMemories(seed, user = getMemories()) {
  const byId = new Map();
  for (const m of seed) byId.set(m.id, { ...m });
  for (const m of user) byId.set(m.id, m);
  return [...byId.values()];
}
