/** Memory Pass auras — mood colour + label. */

import { normalizeEmotion } from "../emotions.js";

export const AURAS = [
  {
    id: "nostalgia",
    label: "Nostalgia",
    hue: "#c4a882",
    soft: "rgba(196, 168, 130, 0.35)",
  },
  {
    id: "joy",
    label: "Joy",
    hue: "#e8c56a",
    soft: "rgba(232, 197, 106, 0.35)",
  },
  {
    id: "pain",
    label: "Pain",
    hue: "#8aa4c4",
    soft: "rgba(138, 164, 196, 0.35)",
  },
  {
    id: "love",
    label: "Love",
    hue: "#d4a0a8",
    soft: "rgba(212, 160, 168, 0.35)",
  },
  {
    id: "wonder",
    label: "Wonder",
    hue: "#a8c4b8",
    soft: "rgba(168, 196, 184, 0.35)",
  },
];

export const AURA_IDS = new Set(AURAS.map((a) => a.id));

export const MAX_PASS_NAME = 18;

export function getAura(id) {
  if (!id) return null;
  const key = String(id).toLowerCase();
  const mapped = key === "sadness" ? "pain" : key;
  return AURAS.find((a) => a.id === mapped) || null;
}

export function auraLabel(id) {
  const canon = normalizeEmotion(id);
  if (canon) return canon;
  return getAura(id)?.label || "";
}
