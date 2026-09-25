import {
  formatPassMeta,
  getPassArt,
  MAX_PASS_NAME,
} from "./passArt.js";

/**
 * Render Memory Pass card markup (preview or finished).
 * @param {{ name?: string, art?: string, id?: string, issuedAt?: number }} card
 * @param {{
 *   compact?: boolean,
 *   interactive?: boolean,
 *   showMeta?: boolean,
 *   showPlus?: boolean,
 * }} [opts]
 */
export function renderPassCard(card, opts = {}) {
  const {
    compact = false,
    interactive = false,
    showMeta = Boolean(card?.id),
    showPlus = true,
  } = opts;
  const name = displayName(card?.name);
  const art = getPassArt(card?.art);
  const tag = interactive ? "button" : "div";
  const typeAttr = interactive ? ' type="button"' : "";
  const compactClass = compact ? " pass-card--compact" : "";
  const interactiveClass = interactive ? " pass-card--interactive" : "";
  const meta = showMeta ? formatPassMeta(card) : "";

  return `
    <${tag}${typeAttr} class="pass-card${compactClass}${interactiveClass}" data-pass-card
      data-art="${art.id}">
      <div class="pass-card-media" aria-hidden="true">
        <img class="pass-card-art" data-pass-art src="${art.src}" alt="" draggable="false" />
        <div class="pass-card-grain"></div>
        <div class="pass-card-shade"></div>
        <div class="pass-card-sheen" data-pass-sheen></div>
      </div>
      <div class="pass-card-chrome">
        <p class="pass-card-brand">Garden of Memories</p>
        ${showPlus ? `<span class="pass-card-plus" aria-hidden="true">+</span>` : ""}
      </div>
      <div class="pass-card-footer">
        <p class="pass-card-name" data-pass-name>${escapeHtml(name)}</p>
        ${
          meta
            ? `<p class="pass-card-meta" data-pass-meta>${escapeHtml(meta)}</p>`
            : `<p class="pass-card-meta" data-pass-meta hidden></p>`
        }
      </div>
      ${compact ? `<p class="pass-card-hint">Tap to edit</p>` : ""}
    </${tag}>
  `;
}

/**
 * Live-update preview fields on an existing card root.
 * @param {HTMLElement | null} el
 * @param {{ name?: string, art?: string, id?: string, issuedAt?: number }} card
 * @param {{ crossfade?: boolean }} [opts]
 */
export function updatePassCardEl(el, card, opts = {}) {
  if (!el) return;
  const name = displayName(card?.name);
  const art = getPassArt(card?.art);
  const nameEl = el.querySelector("[data-pass-name]");
  const metaEl = el.querySelector("[data-pass-meta]");
  const img = el.querySelector("[data-pass-art]");

  if (nameEl) nameEl.textContent = name;

  if (metaEl) {
    const meta = card?.id ? formatPassMeta(card) : "";
    if (meta) {
      metaEl.hidden = false;
      metaEl.textContent = meta;
    } else {
      metaEl.hidden = true;
      metaEl.textContent = "";
    }
  }

  if (img && art.src !== img.getAttribute("src")) {
    el.setAttribute("data-art", art.id);
    if (opts.crossfade) {
      img.classList.add("is-fading");
      window.setTimeout(() => {
        img.setAttribute("src", art.src);
        img.classList.remove("is-fading");
      }, 200);
    } else {
      img.setAttribute("src", art.src);
    }
  }
}

function displayName(name) {
  const n = String(name || "")
    .trim()
    .slice(0, MAX_PASS_NAME)
    .toUpperCase();
  return n || "VISITOR";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
