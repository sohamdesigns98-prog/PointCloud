import gsap from "gsap";
import {
  MAX_PASS_NAME,
  PASS_ART,
} from "../pass/passArt.js";
import { renderPassCard, updatePassCardEl } from "../pass/PassCard.js";
import { createPass, getPass, updatePass } from "../pass/passStore.js";
import { playPassReady } from "../pass/passReady.js";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const HOLD_MS = 1500;

/**
 * Make your pass — intro → name → art → bind → finished.
 * @param {{
 *   mount: HTMLElement,
 *   onBackToMap?: () => void,
 *   onClose?: () => void,
 * }} opts
 */
export function createMakePass({ mount, onBackToMap, onClose } = {}) {
  const root = document.createElement("div");
  root.id = "make-pass";
  root.className = "make-pass screen-layer screen-layer--overlay";
  root.hidden = true;
  mount.appendChild(root);

  /** @type {'intro'|'name'|'art'|'bind'|'ready'|'finished'|'edit'} */
  let step = "intro";
  let draft = { name: "", art: PASS_ART[0].id };
  let holding = false;
  let holdRaf = 0;
  let holdStart = 0;
  let readyAnim = null;
  let tiltCleanup = null;

  function open(opts = {}) {
    const existing = getPass();
    if (opts.mode === "edit" && existing) {
      draft = { name: existing.name, art: existing.art };
      showEdit(existing);
      reveal();
      return;
    }
    if (existing && !opts.forceCreate) {
      showFinished(existing);
      reveal();
      return;
    }
    draft = { name: "", art: PASS_ART[0].id };
    showIntro();
    reveal();
  }

  function reveal() {
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("is-visible"));
  }

  function hide() {
    readyAnim?.kill?.();
    readyAnim = null;
    tiltCleanup?.();
    tiltCleanup = null;
    window.cancelAnimationFrame(holdRaf);
    holding = false;
    root.classList.remove("is-visible");
    root.hidden = true;
    root.innerHTML = "";
    onClose?.();
  }

  function chrome(stepIndex, total = 4) {
    const label =
      stepIndex > 0
        ? `<p class="make-pass-step">${String(stepIndex).padStart(2, "0")} / ${String(total).padStart(2, "0")}</p>`
        : `<p class="make-pass-step make-pass-step--quiet">Memory Pass</p>`;
    return `
      <header class="make-pass-top">
        ${label}
        <button type="button" class="make-pass-back" data-back aria-label="Back">←</button>
      </header>
    `;
  }

  function previewHtml(card, { showMeta = false } = {}) {
    return `
      <div class="make-pass-preview" data-preview>
        ${renderPassCard(card, { showMeta, showPlus: true })}
      </div>
    `;
  }

  function wireBack(handler) {
    root.querySelector("[data-back]")?.addEventListener("click", handler);
  }

  function showIntro() {
    step = "intro";
    root.innerHTML = `
      <section class="make-pass-screen make-pass-screen--intro">
        ${chrome(1)}
        <div class="make-pass-body">
          <h1 class="make-pass-hero">A pass for the places you hold.</h1>
          <p class="make-pass-lede">Carry it to a place. Tap it there. The place opens to you.</p>
          <button type="button" class="pill pill--primary" data-start>Make your pass</button>
        </div>
      </section>
    `;
    wireBack(() => {
      hide();
      onBackToMap?.();
    });
    root.querySelector("[data-start]")?.addEventListener("click", showName);
  }

  function showName() {
    step = "name";
    root.innerHTML = `
      <section class="make-pass-screen make-pass-screen--split">
        ${chrome(2)}
        <div class="make-pass-split">
          <div class="make-pass-controls">
            <p class="make-pass-label">What should your pass say?</p>
            <label class="make-pass-field">
              <input type="text" maxlength="${MAX_PASS_NAME}" data-name
                autocomplete="nickname" placeholder="Your name" />
              <span class="make-pass-count" data-count>0/${MAX_PASS_NAME}</span>
            </label>
            <button type="button" class="pill pill--primary" data-next>Next</button>
          </div>
          ${previewHtml({ name: draft.name, art: draft.art })}
        </div>
      </section>
    `;
    wireBack(() => showIntro());
    const input = root.querySelector("[data-name]");
    const count = root.querySelector("[data-count]");
    const cardEl = root.querySelector("[data-pass-card]");
    if (input) {
      input.value = draft.name;
      input.focus();
    }
    const sync = () => {
      draft.name = (input?.value || "").slice(0, MAX_PASS_NAME);
      if (input && input.value !== draft.name) input.value = draft.name;
      if (count) count.textContent = `${draft.name.length}/${MAX_PASS_NAME}`;
      updatePassCardEl(cardEl, draft);
    };
    input?.addEventListener("input", sync);
    sync();
    root.querySelector("[data-next]")?.addEventListener("click", showArt);
  }

  function showArt() {
    step = "art";
    root.innerHTML = `
      <section class="make-pass-screen make-pass-screen--split">
        ${chrome(3)}
        <div class="make-pass-split">
          <div class="make-pass-controls">
            <p class="make-pass-label">Choose your card.</p>
            <div class="make-pass-thumbs" data-thumbs>
              ${PASS_ART.map(
                (a) => `
                <button type="button" class="make-pass-thumb${
                  a.id === draft.art ? " is-selected" : ""
                }" data-art="${a.id}" aria-label="Artwork ${a.id}">
                  <img src="${a.src}" alt="" draggable="false" />
                </button>`
              ).join("")}
            </div>
            <button type="button" class="pill pill--primary" data-next>Next</button>
          </div>
          ${previewHtml({ name: draft.name, art: draft.art })}
        </div>
      </section>
    `;
    wireBack(() => showName());
    const cardEl = root.querySelector("[data-pass-card]");
    root.querySelectorAll("[data-art]").forEach((btn) => {
      btn.addEventListener("click", () => {
        draft.art = btn.getAttribute("data-art");
        root.querySelectorAll("[data-art]").forEach((b) => {
          b.classList.toggle("is-selected", b === btn);
        });
        updatePassCardEl(cardEl, draft, { crossfade: true });
      });
    });
    root.querySelector("[data-next]")?.addEventListener("click", showBind);
  }

  function showBind() {
    step = "bind";
    root.innerHTML = `
      <section class="make-pass-screen make-pass-screen--bind">
        ${chrome(4)}
        <div class="make-pass-bind">
          ${previewHtml({ name: draft.name, art: draft.art })}
          <p class="make-pass-hold-hint">Hold to bind your pass.</p>
          <button type="button" class="make-pass-hold" data-hold aria-label="Tap to connect">
            <span class="make-pass-hold-ring" data-ring></span>
            <span class="make-pass-hold-label">Tap to connect</span>
          </button>
        </div>
      </section>
    `;
    wireBack(() => showArt());
    const holdBtn = root.querySelector("[data-hold]");
    const ring = root.querySelector("[data-ring]");
    const cardEl = root.querySelector("[data-pass-card]");

    const setProgress = (p) => {
      const t = Math.max(0, Math.min(1, p));
      if (ring) ring.style.setProperty("--hold", String(t));
      if (cardEl) {
        cardEl.style.filter = `brightness(${1 + t * 0.22})`;
      }
    };

    const stopHold = (complete) => {
      holding = false;
      window.cancelAnimationFrame(holdRaf);
      if (complete) {
        setProgress(1);
        finishBind(cardEl);
        return;
      }
      gsap.to(
        { v: Number(ring?.style.getPropertyValue("--hold") || 0) },
        {
          v: 0,
          duration: 0.35,
          ease: EASE,
          onUpdate() {
            setProgress(this.targets()[0].v);
          },
        }
      );
    };

    const tick = (now) => {
      if (!holding) return;
      const p = (now - holdStart) / HOLD_MS;
      setProgress(p);
      if (p >= 1) {
        stopHold(true);
        return;
      }
      holdRaf = requestAnimationFrame(tick);
    };

    const startHold = (e) => {
      e.preventDefault();
      if (holding || step !== "bind") return;
      holding = true;
      holdStart = performance.now();
      gsap.killTweensOf({});
      holdRaf = requestAnimationFrame(tick);
    };

    holdBtn?.addEventListener("pointerdown", startHold);
    holdBtn?.addEventListener("pointerup", () => stopHold(false));
    holdBtn?.addEventListener("pointerleave", () => {
      if (holding) stopHold(false);
    });
    holdBtn?.addEventListener("pointercancel", () => stopHold(false));
  }

  function finishBind(cardEl) {
    step = "ready";
    const pass = createPass({
      name: draft.name.trim() || "VISITOR",
      art: draft.art,
    });
    if (!pass) {
      const status = root.querySelector(".make-pass-hold-hint");
      if (status) {
        status.textContent =
          "Couldn't save on this device — try again.";
      }
      step = "bind";
      return;
    }
    updatePassCardEl(cardEl, pass);
    const holdBtn = root.querySelector("[data-hold]");
    if (holdBtn) holdBtn.disabled = true;
    const hint = root.querySelector(".make-pass-hold-hint");
    if (hint) hint.textContent = "Binding…";

    readyAnim = playPassReady({
      cardEl,
      pass,
      onComplete: () => {
        showFinished(pass, { fromReady: true });
      },
    });
  }

  function showFinished(pass, { fromReady = false } = {}) {
    step = "finished";
    tiltCleanup?.();
    root.innerHTML = `
      <section class="make-pass-screen make-pass-screen--finished">
        ${chrome(0)}
        <div class="make-pass-finished">
          <div class="make-pass-preview make-pass-preview--large" data-preview>
            ${renderPassCard(pass, { showMeta: true })}
          </div>
          <p class="make-pass-ready-line">Your pass is ready. Take it somewhere.</p>
          <div class="make-pass-actions">
            <button type="button" class="pill pill--primary" data-map>Back to the map</button>
            <button type="button" class="pill pill--ghost" data-edit>Edit pass</button>
          </div>
        </div>
      </section>
    `;
    wireBack(() => {
      hide();
      onBackToMap?.();
    });
    root.querySelector("[data-map]")?.addEventListener("click", () => {
      hide();
      onBackToMap?.();
    });
    root.querySelector("[data-edit]")?.addEventListener("click", () => {
      showEdit(pass);
    });

    const cardEl = root.querySelector("[data-pass-card]");
    if (fromReady) {
      gsap.fromTo(
        cardEl,
        { opacity: 0.85 },
        { opacity: 1, duration: 0.35, ease: EASE }
      );
    }
    tiltCleanup = enableTilt(cardEl);
  }

  function showEdit(pass) {
    step = "edit";
    draft = { name: pass.name, art: pass.art };
    root.innerHTML = `
      <section class="make-pass-screen make-pass-screen--split">
        ${chrome(0)}
        <div class="make-pass-split">
          <div class="make-pass-controls">
            <p class="make-pass-label">Edit your pass</p>
            <label class="make-pass-field">
              <input type="text" maxlength="${MAX_PASS_NAME}" data-name
                autocomplete="nickname" value="${escapeAttr(draft.name)}" />
              <span class="make-pass-count" data-count>${draft.name.length}/${MAX_PASS_NAME}</span>
            </label>
            <div class="make-pass-thumbs" data-thumbs>
              ${PASS_ART.map(
                (a) => `
                <button type="button" class="make-pass-thumb${
                  a.id === draft.art ? " is-selected" : ""
                }" data-art="${a.id}" aria-label="Artwork ${a.id}">
                  <img src="${a.src}" alt="" draggable="false" />
                </button>`
              ).join("")}
            </div>
            <button type="button" class="pill pill--primary" data-save>Save</button>
          </div>
          ${previewHtml(pass, { showMeta: true })}
        </div>
      </section>
    `;
    wireBack(() => showFinished(getPass() || pass));
    const input = root.querySelector("[data-name]");
    const count = root.querySelector("[data-count]");
    const cardEl = root.querySelector("[data-pass-card]");
    input?.focus();

    const sync = () => {
      draft.name = (input?.value || "").slice(0, MAX_PASS_NAME);
      if (count) count.textContent = `${draft.name.length}/${MAX_PASS_NAME}`;
      updatePassCardEl(cardEl, { ...pass, ...draft }, { crossfade: false });
    };
    input?.addEventListener("input", sync);
    root.querySelectorAll("[data-art]").forEach((btn) => {
      btn.addEventListener("click", () => {
        draft.art = btn.getAttribute("data-art");
        root.querySelectorAll("[data-art]").forEach((b) => {
          b.classList.toggle("is-selected", b === btn);
        });
        updatePassCardEl(cardEl, { ...pass, ...draft }, { crossfade: true });
      });
    });
    root.querySelector("[data-save]")?.addEventListener("click", () => {
      const next = updatePass({
        name: draft.name.trim() || "VISITOR",
        art: draft.art,
      });
      if (!next) return;
      gsap.fromTo(
        cardEl,
        { opacity: 0.5 },
        {
          opacity: 1,
          duration: 0.35,
          ease: EASE,
          onComplete: () => showFinished(next),
        }
      );
    });
  }

  return {
    open,
    hide,
    isOpen: () => !root.hidden,
    destroy() {
      hide();
      root.remove();
    },
  };
}

function enableTilt(cardEl) {
  if (!cardEl) return () => {};
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return () => {};
  }

  const media = cardEl.querySelector(".pass-card-media");
  const sheen = cardEl.querySelector("[data-pass-sheen]");
  let raf = 0;
  let tx = 0;
  let ty = 0;
  let cx = 0;
  let cy = 0;

  const apply = () => {
    raf = 0;
    cx += (tx - cx) * 0.12;
    cy += (ty - cy) * 0.12;
    cardEl.style.transform = `perspective(900px) rotateY(${cx * 8}deg) rotateX(${-cy * 8}deg)`;
    if (sheen) {
      sheen.style.background = `linear-gradient(${120 + cx * 40}deg, transparent 40%, rgba(255,255,255,${0.08 + Math.abs(cx) * 0.1}) 50%, transparent 60%)`;
    }
    if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) {
      raf = requestAnimationFrame(apply);
    }
  };

  const onMove = (e) => {
    const r = cardEl.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (!raf) raf = requestAnimationFrame(apply);
  };

  const onLeave = () => {
    tx = 0;
    ty = 0;
    if (!raf) raf = requestAnimationFrame(apply);
  };

  const onOrient = (e) => {
    const b = e.beta ?? 0;
    const g = e.gamma ?? 0;
    tx = Math.max(-1, Math.min(1, g / 30));
    ty = Math.max(-1, Math.min(1, b / 40));
    if (!raf) raf = requestAnimationFrame(apply);
  };

  window.addEventListener("pointermove", onMove);
  cardEl.addEventListener("pointerleave", onLeave);
  window.addEventListener("deviceorientation", onOrient);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onMove);
    cardEl.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("deviceorientation", onOrient);
    cardEl.style.transform = "";
    if (sheen) sheen.style.background = "";
    void media;
  };
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
