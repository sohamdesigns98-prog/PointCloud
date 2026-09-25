/** Memory Pass artworks. */

export const MAX_PASS_NAME = 18;

export const PASS_ART = [
  { id: "pass-01", src: "/assets/pass/pass-01.jpg" },
  { id: "pass-02", src: "/assets/pass/pass-02.jpg" },
  { id: "pass-03", src: "/assets/pass/pass-03.jpg" },
  { id: "pass-04", src: "/assets/pass/pass-04.jpg" },
  { id: "pass-05", src: "/assets/pass/pass-05.jpg" },
];

export const PASS_ART_IDS = new Set(PASS_ART.map((a) => a.id));

export function getPassArt(id) {
  return PASS_ART.find((a) => a.id === id) || PASS_ART[0];
}

export function formatPassId(id) {
  return String(id || "").toUpperCase();
}

/** ISSUED 25.09.26 */
export function formatIssuedDate(issuedAt) {
  const d = new Date(Number(issuedAt) || Date.now());
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

export function formatPassMeta(pass) {
  if (!pass?.id) return "";
  const issued = formatIssuedDate(pass.issuedAt);
  return `PASS ${formatPassId(pass.id)}${issued ? ` · ISSUED ${issued}` : ""}`;
}
