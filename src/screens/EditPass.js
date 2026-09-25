import { AURAS, MAX_PASS_NAME } from "../pass/auras.js";
import { loadPass, savePass } from "../pass/passStore.js";
import { renderPassCard, updatePassCardEl } from "../pass/PassCard.js";

/**
 * Edit Pass — pre-filled name + aura; Save changes (no ripple).
 * Edits apply to future memories only.
 */
export function createEditPass({ mount, onSave, overlay = false }) {
  const root = document.createElement("div");
  root.className = `screen-layer screen-layer--edit-pass${
    overlay ? " screen-layer--overlay" : ""
  }`;
  root.id = "edit-pass";
  root.hidden = true;
  mount.appendChild(root);

  let draft = { name: "", aura: "nostalgia" };

  function render() {
    const existing = loadPass();
    draft = {
      name: existing?.name || "",
      aura: existing?.aura || "nostalgia",
    };

    root.innerHTML = `
      <section class="screen screen--customise">
        <p class="screen-kicker">Memory Pass</p>
        <h1 class="screen-title">Edit your pass</h1>
        <p class="screen-hint">Changes apply to memories you leave from now on.</p>
        <div class="pass-preview" data-preview>
          ${renderPassCard(draft)}
        </div>
        <label class="screen-field">
          <span class="screen-label">Name</span>
          <input
            type="text"
            maxlength="${MAX_PASS_NAME}"
            data-name
            autocomplete="nickname"
            value="${escapeAttr(draft.name)}"
          />
          <span class="screen-count" data-count>${draft.name.length}/${MAX_PASS_NAME}</span>
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
        <button type="button" class="pill pill--primary" data-save>
          Save changes
        </button>
      </section>
    `;

    const nameInput = root.querySelector("[data-name]");
    const count = root.querySelector("[data-count]");
    const saveBtn = root.querySelector("[data-save]");
    const cardEl = root.querySelector("[data-pass-card]");

    function refresh() {
      draft.name = (nameInput?.value || "").slice(0, MAX_PASS_NAME);
      if (nameInput && nameInput.value !== draft.name) nameInput.value = draft.name;
      if (count) count.textContent = `${draft.name.length}/${MAX_PASS_NAME}`;
      updatePassCardEl(cardEl, draft);
      if (saveBtn) saveBtn.disabled = draft.name.trim().length === 0;
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
    saveBtn?.addEventListener("click", () => {
      const saved = savePass({ name: draft.name.trim(), aura: draft.aura });
      if (saved) onSave?.(saved);
    });
    refresh();
  }

  return {
    show() {
      render();
      root.hidden = false;
      requestAnimationFrame(() => root.classList.add("is-visible"));
      root.querySelector("[data-name]")?.focus();
    },
    hide() {
      root.classList.remove("is-visible");
      root.hidden = true;
    },
    destroy() {
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
