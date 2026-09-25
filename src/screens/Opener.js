import { grainMarkup } from "../chrome/markup.js";
import { mountSparkleEnterButton } from "../sparkleEnterButton.js";

/**
 * Concept opener — idea first, before the garden.
 * Opera Neon charcoal + living gold / rose-gold grain.
 */
export function createOpener({ mount, onEnter }) {
  const root = document.createElement("div");
  root.id = "opener";
  root.className = "screen-layer screen-layer--opener is-visible";
  root.innerHTML = `
    <div class="on-frame opener-frame">
      ${grainMarkup()}
      <main class="opener-main">
        <p class="opener-brand">Garden of Memories</p>
        <div class="opener-copy">
          <p>
            Cities are full of people who share places without sharing lives.
            At the Sydney Opera House, a first visit and a hundredth visit can
            happen on the same steps.
          </p>
          <p>
            Those versions of the place usually stay invisible. You stand where
            someone stood before you, and never know what it meant to them.
          </p>
          <p>
            Garden of Memories makes that layer visible. Brush the Opera House. Open a
            memory someone left. When you’re ready, leave one of your own —
            without needing to meet.
          </p>
        </div>
        <button type="button" class="opener-enter sparkle-enter" data-enter>
          <span>Enter experience</span>
        </button>
      </main>
    </div>
  `;
  mount.appendChild(root);

  const enterBtn = root.querySelector("[data-enter]");
  let sparkle = null;

  // Mount sparkle after layout so button size is correct
  requestAnimationFrame(() => {
    sparkle = mountSparkleEnterButton(enterBtn);
  });

  enterBtn?.addEventListener("click", () => onEnter?.());

  return {
    show() {
      root.hidden = false;
      requestAnimationFrame(() => root.classList.add("is-visible"));
    },
    hide() {
      root.classList.remove("is-visible");
      root.hidden = true;
    },
    destroy() {
      sparkle?.destroy?.();
      root.remove();
    },
  };
}
