/**
 * Lightweight instruction tips over map → garden.
 * Never blocks canvas interaction — only the tip card captures clicks.
 * Card placement is contextual and avoids overlapping chrome text.
 */

import { readFlag, writeFlag } from "../core/storage.js";

const STORAGE_KEY = "still-here-walkthrough-v2";

const EDGE = 14;
const GAP = 12;

/** Selectors that must not be covered by the tip card when visible. */
const AVOID_SELECTORS = [
  "#brand",
  "#btn-app-back",
  "#chrome-tr",
  "#btn-map-walkthrough",
  "#ambience-toggle",
  "#dock",
  "#emotion-filters",
  "#garden-footer",
  "#focus-title",
  ".map-enter-wrap",
];

const STEPS = [
  {
    id: "map-overview",
    scene: "map",
    body: "Explore Sydney as points of light. One place is open for you now — the golden Opera House.",
    prefer: ["bottom-left", "mid-left", "bottom-right"],
  },
  {
    id: "map-opera",
    scene: "map",
    body: "Click the golden Opera House when you’re ready to step inside.",
    target: "opera-anchor",
    prefer: ["below", "above", "left", "right", "bottom-left"],
    pauseUntilGarden: true,
  },
  {
    id: "garden-home",
    scene: "garden",
    body: "Every bright point is a memory someone left here.",
    prefer: ["bottom-left", "mid-left", "top-left"],
  },
  {
    id: "garden-access",
    scene: "garden",
    body: "Brush the sails with your cursor, then tap a glowing point to read it.",
    prefer: ["bottom-left", "mid-left", "bottom-right"],
  },
  {
    id: "garden-filter",
    scene: "garden",
    body: "Filter by feeling in the corner — matching memories stay bright.",
    target: "#emotion-filters",
    prefer: ["above", "left", "top-left", "bottom-left"],
  },
  {
    id: "garden-leave",
    scene: "garden",
    body: "Leave a memory of your own when you’re ready — tap Add your memory.",
    target: "#btn-add-memory",
    fallbackTarget: "#btn-pass",
    prefer: ["above", "left", "bottom-left", "top-left"],
  },
  {
    id: "done",
    scene: "garden",
    body: "That’s it. Explore, save what stays with you, and come back anytime.",
    prefer: ["bottom-left", "mid-left", "top-left"],
    final: true,
  },
];

export function hasCompletedWalkthrough() {
  return readFlag(STORAGE_KEY);
}

export function markWalkthroughComplete() {
  writeFlag(STORAGE_KEY, true);
}

/**
 * @param {{
 *   mount: HTMLElement,
 *   onFinish?: () => void,
 *   onNeedMap?: () => void | Promise<void>,
 *   getOperaAnchor?: () => { x: number, y: number, width?: number, height?: number } | null,
 * }} opts
 */
export function createHowItWorks({
  mount,
  onFinish,
  onNeedMap,
  getOperaAnchor,
}) {
  const root = document.createElement("div");
  root.id = "how-it-works";
  root.className = "walkthrough";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Tips");
  mount.appendChild(root);

  let stepIndex = 0;
  let visible = false;
  let pendingGarden = false;
  let resizeObs = null;
  let anchorTimer = 0;

  function currentStep() {
    return STEPS[stepIndex];
  }

  function isUsable(el) {
    if (!el || el.hidden) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    if (Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  }

  function resolveTargetEl(step) {
    if (!step?.target || step.target === "opera-anchor") return null;
    const primary = document.querySelector(step.target);
    if (primary && isUsable(primary)) return primary;
    if (step.fallbackTarget) {
      const fb = document.querySelector(step.fallbackTarget);
      if (fb && isUsable(fb)) return fb;
    }
    return null;
  }

  function targetRect(step) {
    if (!step) return null;
    if (step.target === "opera-anchor") {
      const a = getOperaAnchor?.();
      if (!a) return null;
      const w = a.width ?? 120;
      const h = a.height ?? 90;
      return {
        left: a.x - w / 2,
        top: a.y - h / 2,
        width: w,
        height: h,
        right: a.x + w / 2,
        bottom: a.y + h / 2,
      };
    }
    const el = resolveTargetEl(step);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      right: r.right,
      bottom: r.bottom,
    };
  }

  function collectAvoidRects(extra) {
    /** @type {Array<{left:number,top:number,right:number,bottom:number}>} */
    const rects = [];
    for (const sel of AVOID_SELECTORS) {
      document.querySelectorAll(sel).forEach((el) => {
        if (!isUsable(el)) return;
        // Tips button is hidden while tour is open — skip if not painted
        if (el.id === "btn-map-walkthrough" && el.hidden) return;
        const r = el.getBoundingClientRect();
        rects.push({
          left: r.left - 6,
          top: r.top - 6,
          right: r.right + 6,
          bottom: r.bottom + 6,
        });
      });
    }
    if (extra) {
      rects.push({
        left: extra.left - 8,
        top: extra.top - 8,
        right: extra.right + 8,
        bottom: extra.bottom + 8,
      });
    }
    return rects;
  }

  function overlaps(a, b) {
    return !(
      a.right < b.left ||
      a.left > b.right ||
      a.bottom < b.top ||
      a.top > b.bottom
    );
  }

  function scoreCandidate(box, avoid) {
    let hits = 0;
    for (const r of avoid) {
      if (overlaps(box, r)) hits += 1;
    }
    // Prefer staying on-screen with margin
    const offX = Math.max(0, EDGE - box.left) + Math.max(0, box.right - (window.innerWidth - EDGE));
    const offY = Math.max(0, EDGE - box.top) + Math.max(0, box.bottom - (window.innerHeight - EDGE));
    return hits * 1000 + offX + offY;
  }

  function clampBox(left, top, cw, ch) {
    const maxL = window.innerWidth - cw - EDGE;
    const maxT = window.innerHeight - ch - EDGE;
    return {
      left: Math.max(EDGE, Math.min(left, maxL)),
      top: Math.max(EDGE, Math.min(top, maxT)),
      right: 0,
      bottom: 0,
      width: cw,
      height: ch,
    };
  }

  function finalize(box) {
    box.right = box.left + box.width;
    box.bottom = box.top + box.height;
    return box;
  }

  /**
   * Build candidate positions from preference keys + target rect.
   * @param {string[]} prefer
   * @param {{left:number,top:number,width:number,height:number,right:number,bottom:number}|null} anchor
   * @param {number} cw
   * @param {number} ch
   */
  function candidates(prefer, anchor, cw, ch) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const list = [];

    const push = (key, left, top) => {
      list.push({ key, ...finalize(clampBox(left, top, cw, ch)) });
    };

    const midX = (vw - cw) / 2;
    const midY = (vh - ch) / 2;

    const addDock = (key) => {
      if (key === "bottom-left") push(key, EDGE, vh - ch - EDGE);
      else if (key === "bottom-right") push(key, vw - cw - EDGE, vh - ch - EDGE);
      else if (key === "bottom-center") push(key, midX, vh - ch - EDGE);
      else if (key === "top-left") push(key, EDGE, EDGE + 52);
      else if (key === "top-right") push(key, vw - cw - EDGE, EDGE + 52);
      else if (key === "mid-left") push(key, EDGE, midY);
      else if (key === "mid-right") push(key, vw - cw - EDGE, midY);
      else if (key === "center") push(key, midX, midY);
    };

    const addNear = (key) => {
      if (!anchor) return;
      if (key === "above") {
        push(key, anchor.left + anchor.width / 2 - cw / 2, anchor.top - ch - GAP);
      } else if (key === "below") {
        push(key, anchor.left + anchor.width / 2 - cw / 2, anchor.bottom + GAP);
      } else if (key === "left") {
        push(key, anchor.left - cw - GAP, anchor.top + anchor.height / 2 - ch / 2);
      } else if (key === "right") {
        push(key, anchor.right + GAP, anchor.top + anchor.height / 2 - ch / 2);
      }
    };

    for (const key of prefer) {
      if (
        key === "above" ||
        key === "below" ||
        key === "left" ||
        key === "right"
      ) {
        addNear(key);
      } else {
        addDock(key);
      }
    }

    // Fallbacks always available
    for (const key of ["bottom-left", "mid-left", "top-left", "bottom-right", "mid-right"]) {
      if (!prefer.includes(key)) addDock(key);
    }

    return list;
  }

  function placeCard() {
    const card = root.querySelector("[data-card]");
    if (!card) return;

    const step = currentStep();
    const cw = Math.max(card.offsetWidth || 280, 200);
    const ch = Math.max(card.offsetHeight || 110, 72);
    const anchor = targetRect(step);
    const avoid = collectAvoidRects(anchor);
    const prefer = step.prefer || ["bottom-left", "mid-left"];

    const options = candidates(prefer, anchor, cw, ch);
    let best = options[0];
    let bestScore = Infinity;
    for (const opt of options) {
      const s = scoreCandidate(opt, avoid);
      if (s < bestScore) {
        bestScore = s;
        best = opt;
      }
      if (s === 0) break;
    }

    card.style.left = `${best.left}px`;
    card.style.top = `${best.top}px`;
    card.style.right = "auto";
    card.style.bottom = "auto";
    card.style.transform = "none";
  }

  function clearTargetHighlights() {
    document
      .querySelectorAll(".walkthrough-target")
      .forEach((n) => n.classList.remove("walkthrough-target"));
    const canvas = document.querySelector("#garden");
    if (canvas) {
      canvas.classList.remove("walkthrough-target");
      canvas.style.zIndex = "";
    }
  }

  function highlightChrome() {
    clearTargetHighlights();
    const step = currentStep();
    const el = resolveTargetEl(step);
    if (el && el.id !== "garden" && el.tagName !== "CANVAS") {
      el.classList.add("walkthrough-target");
    }
  }

  function layout() {
    highlightChrome();
    placeCard();
  }

  function syncAnchorLoop() {
    window.clearInterval(anchorTimer);
    if (!visible) return;
    if (currentStep()?.target === "opera-anchor") {
      anchorTimer = window.setInterval(() => {
        if (!visible) return;
        placeCard();
      }, 160);
    }
  }

  function renderStep() {
    const step = currentStep();
    const isFirst = stepIndex === 0;
    const isLast = Boolean(step.final);
    const pauseGarden = Boolean(step.pauseUntilGarden);

    root.innerHTML = `
      <div class="walkthrough-card" data-card>
        <p class="walkthrough-body">${step.body}</p>
        <div class="walkthrough-actions">
          ${
            isFirst
              ? `<button type="button" class="walkthrough-ghost" data-skip>Skip</button>`
              : `<button type="button" class="walkthrough-ghost" data-prev>Back</button>
                 <button type="button" class="walkthrough-ghost" data-skip>Skip</button>`
          }
          ${
            isLast
              ? `<button type="button" class="walkthrough-primary" data-finish>Done</button>`
              : pauseGarden
                ? `<button type="button" class="walkthrough-primary" data-next>Got it</button>`
                : `<button type="button" class="walkthrough-primary" data-next>Next</button>`
          }
        </div>
      </div>
    `;

    root.querySelector("[data-skip]")?.addEventListener("click", () => complete());
    root.querySelector("[data-prev]")?.addEventListener("click", () => {
      goTo(Math.max(0, stepIndex - 1));
    });
    root.querySelector("[data-next]")?.addEventListener("click", () => {
      if (currentStep()?.pauseUntilGarden) {
        parkForGarden();
        return;
      }
      goTo(Math.min(STEPS.length - 1, stepIndex + 1));
    });
    root.querySelector("[data-finish]")?.addEventListener("click", () => complete());

    requestAnimationFrame(() => {
      layout();
      syncAnchorLoop();
    });
  }

  function onResize() {
    if (visible) layout();
  }

  function goTo(index) {
    stepIndex = index;
    renderStep();
  }

  function parkForGarden() {
    pendingGarden = true;
    visible = false;
    root.classList.remove("is-visible");
    root.hidden = true;
    root.innerHTML = "";
    window.clearInterval(anchorTimer);
    anchorTimer = 0;
    clearTargetHighlights();
  }

  function complete() {
    pendingGarden = false;
    markWalkthroughComplete();
    hide();
    onFinish?.();
  }

  /**
   * @param {{ from?: 'map' | 'garden' | 'start' }} [opts]
   */
  async function show(opts = {}) {
    pendingGarden = false;
    const from = opts.from || "start";
    if (from === "garden") {
      stepIndex = STEPS.findIndex((s) => s.id === "garden-home");
      if (stepIndex < 0) stepIndex = 0;
    } else {
      stepIndex = 0;
      await onNeedMap?.();
    }

    visible = true;
    root.hidden = false;
    root.classList.add("is-visible");
    renderStep();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    if (typeof ResizeObserver !== "undefined") {
      resizeObs?.disconnect?.();
      resizeObs = new ResizeObserver(onResize);
      resizeObs.observe(document.body);
    }
  }

  function hide() {
    visible = false;
    pendingGarden = false;
    root.classList.remove("is-visible");
    root.hidden = true;
    root.innerHTML = "";
    window.clearInterval(anchorTimer);
    anchorTimer = 0;
    clearTargetHighlights();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onResize, true);
    resizeObs?.disconnect();
    resizeObs = null;
  }

  function notifyEnteredGarden() {
    const gardenIdx = STEPS.findIndex((s) => s.id === "garden-home");
    if (gardenIdx < 0) return;

    if (pendingGarden || visible) {
      pendingGarden = false;
      stepIndex = gardenIdx;
      visible = true;
      root.hidden = false;
      root.classList.add("is-visible");
      renderStep();
    }
  }

  return {
    show,
    hide,
    isVisible: () => visible || pendingGarden,
    notifyEnteredGarden,
    destroy() {
      hide();
      root.remove();
    },
  };
}
