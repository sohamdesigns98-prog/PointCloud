/** Local persistence for saved / bookmarked memories. */

import { normalizeEmotion } from "./emotions.js";
import { readJson, writeJson } from "./core/storage.js";

const STORAGE_KEY = "still-here-bookmarks-v1";

export function loadBookmarks() {
  const parsed = readJson(STORAGE_KEY, null);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeBookmark).filter(Boolean);
}

function persist(list) {
  const { ok } = writeJson(STORAGE_KEY, list);
  return { ok, list };
}

function normalizeBookmark(b) {
  if (!b || typeof b !== "object" || !b.id) return null;
  const emotion = normalizeEmotion(b.emotion);
  return {
    id: String(b.id),
    title: String(b.title || "A memory").slice(0, 48),
    snippet: String(b.snippet || "").slice(0, 80),
    emotion: emotion || "",
    place: String(b.place || "Opera House"),
    savedAt: Number(b.savedAt) || Date.now(),
  };
}

export function isBookmarked(id) {
  return loadBookmarks().some((b) => b.id === id);
}

function saveBookmark(memory) {
  if (!memory?.id) return { ok: true, list: loadBookmarks() };
  const list = loadBookmarks().filter((b) => b.id !== memory.id);
  const body = String(memory.body || "");
  const entry = normalizeBookmark({
    id: memory.id,
    title: memory.title || "A memory",
    snippet: body.slice(0, 80),
    emotion: memory.emotion,
    place: memory.place || "Opera House",
    savedAt: Date.now(),
  });
  if (!entry) return { ok: true, list };
  list.unshift(entry);
  return persist(list);
}

function removeBookmark(id) {
  const next = loadBookmarks().filter((b) => b.id !== id);
  return persist(next);
}

/**
 * @returns {{ saved: boolean, list: object[], ok: boolean }}
 */
export function toggleBookmark(memory) {
  if (!memory?.id) {
    return { saved: false, list: loadBookmarks(), ok: true };
  }
  if (isBookmarked(memory.id)) {
    const { ok, list } = removeBookmark(memory.id);
    return { saved: false, list: ok ? list : loadBookmarks(), ok };
  }
  const { ok, list } = saveBookmark(memory);
  return { saved: true, list: ok ? list : loadBookmarks(), ok };
}
