/** Local persistence for user-left Opera House memories (MVP). */

import { normalizeEmotion } from "./emotions.js";
import { readJson, writeJson } from "./core/storage.js";

const STORAGE_KEY = "still-here-user-memories-v1";

const VALID_RELATIONSHIPS = new Set([
  "firstTime",
  "often",
  "usedTo",
  "passingThrough",
]);
const VALID_REGIONS = new Set(["steps", "sails", "harbour", "forecourt"]);

export function loadUserMemories() {
  const parsed = readJson(STORAGE_KEY, null);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeMemory).filter(Boolean);
}

export function saveUserMemories(list) {
  const cleaned = list.map(normalizeMemory).filter(Boolean);
  const { ok, error } = writeJson(STORAGE_KEY, cleaned);
  if (!ok) {
    throw error instanceof Error ? error : new Error("Storage write failed");
  }
  return cleaned;
}

/**
 * @param {object} memory
 * @returns {{ ok: boolean, audioDropped: boolean, memories: object[] }}
 */
export function appendUserMemory(memory) {
  const normalized = normalizeMemory(memory);
  const prev = loadUserMemories();
  if (!normalized) {
    return { ok: false, audioDropped: false, memories: prev };
  }

  const next = [...prev, normalized];
  const full = writeMemories(next);
  if (full.ok) {
    return { ok: true, audioDropped: false, memories: full.cleaned };
  }

  if (normalized.audioDataUrl) {
    const slim = { ...normalized };
    delete slim.audioDataUrl;
    const fallback = [...prev, slim];
    const retry = writeMemories(fallback);
    if (retry.ok) {
      return { ok: true, audioDropped: true, memories: retry.cleaned };
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
    body: String(m.body).slice(0, 280),
    relationship: m.relationship,
    region: m.region,
  };
  const emotion = normalizeEmotion(m.emotion);
  if (emotion) out.emotion = emotion;
  if (m.authorName) out.authorName = String(m.authorName).slice(0, 18);
  if (m.audioDataUrl && String(m.audioDataUrl).startsWith("data:audio")) {
    out.audioDataUrl = m.audioDataUrl;
  }
  if (m.place) out.place = String(m.place);
  return out;
}

/** Merge seed + local user memories (user ids win on collision). */
export function mergeMemories(seed, user = loadUserMemories()) {
  const byId = new Map();
  for (const m of seed) byId.set(m.id, { ...m });
  for (const m of user) byId.set(m.id, m);
  return [...byId.values()];
}
