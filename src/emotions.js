/** Emotion helpers — Love | Nostalgia | Joy | Wonder | Pain */

export const EMOTIONS = ["Love", "Nostalgia", "Joy", "Wonder", "Pain"];

const ALIASES = {
  love: "Love",
  nostalgia: "Nostalgia",
  joy: "Joy",
  wonder: "Wonder",
  pain: "Pain",
  sadness: "Pain",
};

/** Canonical Title-Case emotion, or null. */
export function normalizeEmotion(value) {
  if (value == null || value === "") return null;
  const key = String(value).trim().toLowerCase();
  return ALIASES[key] || null;
}

export function emotionMatchesFilter(emotion, filter) {
  if (!filter || filter === "All") return true;
  return normalizeEmotion(emotion) === normalizeEmotion(filter);
}
