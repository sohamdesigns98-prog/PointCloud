import { renderPassCard } from "../pass/PassCard.js";
import { loadPass } from "../pass/passStore.js";
import { memoryCountLabel } from "../memories.js";

const PLACES = [
  {
    id: "opera-house",
    name: "Sydney Opera House",
    unlocked: true,
    blurb: "Sails, steps, harbour light",
  },
  {
    id: "harbour-bridge",
    name: "Harbour Bridge",
    unlocked: false,
    blurb: "Coming soon",
  },
  {
    id: "royal-botanic",
    name: "Royal Botanic Garden",
    unlocked: false,
    blurb: "Coming soon",
  },
];

/**
 * Locations — places list + compact pass (tap to edit).
 */
export function createLocations({
  mount,
  getMemoryCount,
  onOpenGarden,
  onEditPass,
  overlay = false,
}) {
  const root = document.createElement("div");
  root.className = `screen-layer screen-layer--locations${
    overlay ? " screen-layer--overlay" : ""
  }`;
  root.id = "locations";
  root.hidden = true;
  mount.appendChild(root);

  function render() {
    const pass = loadPass();
    const count = getMemoryCount?.() ?? 0;
    root.innerHTML = `
      <section class="screen screen--locations">
        <header class="locations-header">
          <p class="screen-kicker">Places</p>
          <h1 class="screen-title">Places</h1>
        </header>

        ${
          pass
            ? `<div class="locations-pass" data-edit-wrap>
                ${renderPassCard(pass, { compact: true, interactive: true })}
              </div>`
            : ""
        }

        <ul class="place-list">
          ${PLACES.map(
            (p) => `
            <li>
              <button type="button" class="pill pill--row${
                p.unlocked ? "" : " is-locked"
              }" data-place="${p.id}" ${p.unlocked ? "" : "disabled"}>
                <span class="place-row-main">
                  <span class="place-row-name">${p.name}</span>
                  <span class="place-row-blurb">${
                    p.unlocked
                      ? memoryCountLabel(count)
                      : p.blurb
                  }</span>
                </span>
                <span class="place-row-meta">${
                  p.unlocked ? "Enter →" : "Locked"
                }</span>
              </button>
            </li>`
          ).join("")}
        </ul>
      </section>
    `;

    root.querySelector("[data-pass-card]")?.addEventListener("click", () => {
      onEditPass?.();
    });
    root.querySelector('[data-place="opera-house"]')?.addEventListener(
      "click",
      () => onOpenGarden?.()
    );
  }

  return {
    show() {
      render();
      root.hidden = false;
      requestAnimationFrame(() => root.classList.add("is-visible"));
    },
    hide() {
      root.classList.remove("is-visible");
      root.hidden = true;
    },
    refresh() {
      if (!root.hidden) render();
    },
    destroy() {
      root.remove();
    },
  };
}
