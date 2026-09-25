import { AURAS, MAX_PASS_NAME } from "../pass/auras.js";
import { savePass } from "../pass/passStore.js";
import { renderPassCard, updatePassCardEl } from "../pass/PassCard.js";

/**
 * Create pass: Customise → Ripple → Locations
 * When overlay: sits over the live garden (dimmed).
 */
export function createOnboarding({
  mount,
  onComplete,
  overlay = false,
} = {}) {
  const root = document.createElement("div");
  root.className = `screen-layer screen-layer--onboarding${
    overlay ? " screen-layer--overlay" : ""
  }`;
  root.id = "onboarding";
  mount.appendChild(root);

  let draft = { name: "", aura: "nostalgia" };
  let rippleTimer = 0;

  function showCustomise() {
    root.innerHTML = `
      <section class="screen screen--customise">
        <p class="screen-kicker">Memory Pass</p>
        <h1 class="screen-title">Make it yours</h1>
        <div class="pass-preview" data-preview>
          ${renderPassCard(draft)}
        </div>
        <label class="screen-field">
          <span class="screen-label">Name</span>
          <input
            type="text"
            maxlength="${MAX_PASS_NAME}"
            placeholder="Up to ${MAX_PASS_NAME} characters"
            data-name
            autocomplete="nickname"
            value="${escapeAttr(draft.name)}"
          />
          <span class="screen-count" data-count>0/${MAX_PASS_NAME}</span>
        </label>
        <p class="screen-label">Aura</p>
        <div class="aura-row" data-auras>
          ${AURAS.map(
            (a) => `
            <button type="button" class="pill pill--chip${
              a.id === draft.aura ? " is-selected" : ""
            }" data-aura="${a.id}" style="--chip-hue: ${a.hue}">
              ${a.label}
            </button>`
          ).join("")}
        </div>
        <button type="button" class="pill pill--primary" data-connect disabled>
          Tap to connect
        </button>
      </section>
    `;

    const nameInput = root.querySelector("[data-name]");
    const count = root.querySelector("[data-count]");
    const connect = root.querySelector("[data-connect]");
    const cardEl = root.querySelector("[data-pass-card]");

    function refresh() {
      draft.name = (nameInput?.value || "").slice(0, MAX_PASS_NAME);
      if (nameInput && nameInput.value !== draft.name) nameInput.value = draft.name;
      if (count) count.textContent = `${draft.name.length}/${MAX_PASS_NAME}`;
      updatePassCardEl(cardEl, draft);
      if (connect) connect.disabled = draft.name.trim().length === 0;
    }

    nameInput?.addEventListener("input", refresh);
    root.querySelectorAll("[data-aura]").forEach((btn) => {
      btn.addEventListener("click", () => {
        draft.aura = btn.getAttribute("data-aura");
        root.querySelectorAll("[data-aura]").forEach((b) => {
          b.classList.toggle("is-selected", b === btn);
        });
        updatePassCardEl(cardEl, draft);
      });
    });
    connect?.addEventListener("click", () => {
      if (!draft.name.trim()) return;
      const saved = savePass({ name: draft.name.trim(), aura: draft.aura });
      if (saved) showRipple(saved);
    });
    refresh();
    nameInput?.focus();
  }

  function showRipple(card) {
    root.innerHTML = `
      <section class="screen screen--center screen--ripple">
        <div class="pass-ripple" aria-hidden="true"></div>
        <div class="pass-preview pass-preview--ripple">
          ${renderPassCard(card)}
        </div>
        <h1 class="screen-hero">Pass created.</h1>
        <p class="screen-lede">Opera House unlocked.</p>
      </section>
    `;
    window.clearTimeout(rippleTimer);
    rippleTimer = window.setTimeout(() => {
      rippleTimer = 0;
      onComplete?.(card);
    }, 2200);
  }

  showCustomise();

  return {
    destroy() {
      window.clearTimeout(rippleTimer);
      rippleTimer = 0;
      root.remove();
    },
  };
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
