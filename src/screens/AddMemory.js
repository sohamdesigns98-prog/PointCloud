import gsap from "gsap";
import { EMOTIONS } from "../emotions.js";
import {
  autoTitleFromBody,
  LEAVE_PROMPT,
  MAX_BODY_CHARS,
  MIN_BODY_CHARS,
  REGION_LABELS,
  RELATIONSHIP_LABELS,
} from "../memories.js";
import { addMemory as persistMemory } from "../memoryStore.js";
import { getPass } from "../pass/passStore.js";

const HOLD_MS = 1200;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const REGION_IDS = Object.keys(REGION_LABELS);
const RELATIONSHIP_IDS = Object.keys(RELATIONSHIP_LABELS);

/**
 * Four-step Add your memory composer + hold + arrival handoff.
 */
export function createAddMemory({
  mount,
  garden,
  onEnter,
  onExit,
  onCountChange,
  onComplete,
  onOpenPass,
  onArrivalNote,
} = {}) {
  const root = document.createElement("div");
  root.id = "leave-mode";
  root.className = "leave-mode add-memory";
  root.hidden = true;
  mount.appendChild(root);

  let active = false;
  let casting = false;
  let holding = false;
  let holdRaf = 0;
  let holdStart = 0;
  /** @type {{ title: string, body: string, emotion: string, relationship: string, region: string }} */
  let draft = emptyDraft();

  function emptyDraft() {
    return {
      title: "",
      body: "",
      emotion: "",
      relationship: "",
      region: "",
    };
  }

  function open() {
    if (active || casting) return;
    active = true;
    casting = false;
    draft = emptyDraft();
    draft.region = garden?.suggestRegion?.() || "forecourt";
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("is-active"));
    onEnter?.();
    garden?.setComposeMode?.(true);
    showStep(1);
  }

  function showStep(n) {
    if (n === 1) renderWrite();
    else if (n === 2) renderFeel();
    else if (n === 3) renderWhere();
    else renderLeave();
  }

  function authorLine() {
    const pass = getPass();
    if (pass?.name) {
      return `<p class="add-memory-author">Leaving as <strong>${escapeHtml(
        pass.name
      )}</strong></p>`;
    }
    return `<p class="add-memory-author">Leaving as a visitor · <button type="button" class="add-memory-pass-link" data-pass>Make your pass</button></p>`;
  }

  function chrome(stepIndex) {
    return `
      <header class="add-memory-top">
        <p class="add-memory-step">${String(stepIndex).padStart(2, "0")} / 04</p>
        <button type="button" class="leave-top-close" data-close aria-label="Close">Close</button>
      </header>
      ${authorLine()}
    `;
  }

  function wireChrome() {
    root.querySelector("[data-close]")?.addEventListener("click", () =>
      close({ cancel: true })
    );
    root.querySelector("[data-pass]")?.addEventListener("click", () => {
      onOpenPass?.();
    });
  }

  function renderWrite() {
    root.innerHTML = `
      <section class="leave-screen leave-screen--compose add-memory-screen">
        ${chrome(1)}
        <div class="leave-screen-inner">
          <p class="leave-kicker">Add your memory</p>
          <h1 class="leave-hero">${escapeHtml(LEAVE_PROMPT)}</h1>
          <label class="add-memory-field">
            <span class="visually-hidden">Title (optional)</span>
            <input type="text" data-title maxlength="48" placeholder="Title (optional)"
              value="${escapeAttr(draft.title)}" />
          </label>
          <div class="leave-type-wrap">
            <textarea data-body rows="5" maxlength="${MAX_BODY_CHARS}"
              placeholder="A few ordinary words are enough.">${escapeHtml(
                draft.body
              )}</textarea>
            <p class="leave-type-count" data-count>0/${MAX_BODY_CHARS}</p>
          </div>
          <p class="leave-status" data-status></p>
          <button type="button" class="pill pill--primary" data-next disabled>Next</button>
        </div>
      </section>
    `;
    wireChrome();
    const body = root.querySelector("[data-body]");
    const title = root.querySelector("[data-title]");
    const count = root.querySelector("[data-count]");
    const next = root.querySelector("[data-next]");
    const status = root.querySelector("[data-status]");

    const sync = () => {
      draft.body = (body?.value || "").slice(0, MAX_BODY_CHARS);
      draft.title = (title?.value || "").slice(0, 48);
      if (count) count.textContent = `${draft.body.length}/${MAX_BODY_CHARS}`;
      const len = draft.body.trim().length;
      const ok = len >= MIN_BODY_CHARS && len <= MAX_BODY_CHARS;
      if (next) next.disabled = !ok;
      if (status) {
        status.textContent =
          len > 0 && len < MIN_BODY_CHARS
            ? `${MIN_BODY_CHARS - len} more characters…`
            : "";
      }
    };
    body?.addEventListener("input", sync);
    title?.addEventListener("input", sync);
    sync();
    requestAnimationFrame(() => body?.focus());
    next?.addEventListener("click", () => {
      if (next.disabled) return;
      showStep(2);
    });
  }

  function renderFeel() {
    root.innerHTML = `
      <section class="leave-screen leave-screen--compose add-memory-screen">
        ${chrome(2)}
        <div class="leave-screen-inner">
          <p class="leave-kicker">How did it feel?</p>
          <h1 class="leave-hero">Pick a feeling and a relationship.</h1>
          <p class="add-memory-label">Feeling</p>
          <div class="add-memory-chips" data-emotions>
            ${EMOTIONS.map(
              (e) => `
              <button type="button" class="add-memory-chip${
                draft.emotion === e ? " is-selected" : ""
              }" data-emotion="${e}">${e}</button>`
            ).join("")}
          </div>
          <p class="add-memory-label">Relationship</p>
          <div class="add-memory-chips" data-rels>
            ${RELATIONSHIP_IDS.map(
              (id) => `
              <button type="button" class="add-memory-chip${
                draft.relationship === id ? " is-selected" : ""
              }" data-rel="${id}">${RELATIONSHIP_LABELS[id]}</button>`
            ).join("")}
          </div>
          <div class="add-memory-nav">
            <button type="button" class="pill pill--ghost" data-back>Back</button>
            <button type="button" class="pill pill--primary" data-next disabled>Next</button>
          </div>
        </div>
      </section>
    `;
    wireChrome();
    const next = root.querySelector("[data-next]");
    const sync = () => {
      if (next) next.disabled = !(draft.emotion && draft.relationship);
    };
    root.querySelectorAll("[data-emotion]").forEach((btn) => {
      btn.addEventListener("click", () => {
        draft.emotion = btn.getAttribute("data-emotion") || "";
        root.querySelectorAll("[data-emotion]").forEach((b) => {
          b.classList.toggle("is-selected", b === btn);
        });
        sync();
      });
    });
    root.querySelectorAll("[data-rel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        draft.relationship = btn.getAttribute("data-rel") || "";
        root.querySelectorAll("[data-rel]").forEach((b) => {
          b.classList.toggle("is-selected", b === btn);
        });
        sync();
      });
    });
    sync();
    root.querySelector("[data-back]")?.addEventListener("click", () => showStep(1));
    next?.addEventListener("click", () => {
      if (next.disabled) return;
      showStep(3);
    });
  }

  function renderWhere() {
    root.innerHTML = `
      <section class="leave-screen leave-screen--compose add-memory-screen">
        ${chrome(3)}
        <div class="leave-screen-inner">
          <p class="leave-kicker">Where does it live?</p>
          <h1 class="leave-hero">Choose a place on the Opera House.</h1>
          <div class="add-memory-chips" data-regions>
            ${REGION_IDS.map(
              (id) => `
              <button type="button" class="add-memory-chip${
                draft.region === id ? " is-selected" : ""
              }" data-region="${id}">${REGION_LABELS[id]}</button>`
            ).join("")}
          </div>
          <div class="add-memory-nav">
            <button type="button" class="pill pill--ghost" data-back>Back</button>
            <button type="button" class="pill pill--primary" data-next>Next</button>
          </div>
        </div>
      </section>
    `;
    wireChrome();
    garden?.highlightRegion?.(draft.region);
    root.querySelectorAll("[data-region]").forEach((btn) => {
      const id = btn.getAttribute("data-region");
      btn.addEventListener("pointerenter", () => garden?.highlightRegion?.(id));
      btn.addEventListener("pointerleave", () =>
        garden?.highlightRegion?.(draft.region)
      );
      btn.addEventListener("click", () => {
        draft.region = id || draft.region;
        garden?.highlightRegion?.(draft.region);
        root.querySelectorAll("[data-region]").forEach((b) => {
          b.classList.toggle("is-selected", b === btn);
        });
      });
    });
    root.querySelector("[data-back]")?.addEventListener("click", () => {
      garden?.highlightRegion?.(null);
      showStep(2);
    });
    root.querySelector("[data-next]")?.addEventListener("click", () => showStep(4));
  }

  function renderLeave() {
    const preview =
      draft.body.trim().length > 160
        ? `${draft.body.trim().slice(0, 157)}…`
        : draft.body.trim();
    root.innerHTML = `
      <section class="leave-screen leave-screen--compose add-memory-screen add-memory-screen--leave">
        ${chrome(4)}
        <div class="leave-screen-inner">
          <p class="leave-kicker">Ready</p>
          <h1 class="leave-hero">Leave it here.</h1>
          <blockquote class="add-memory-review">${escapeHtml(preview)}</blockquote>
          <p class="add-memory-review-meta">
            ${escapeHtml(draft.emotion)} · ${escapeHtml(
              RELATIONSHIP_LABELS[draft.relationship] || ""
            )} · ${escapeHtml(REGION_LABELS[draft.region] || "")}
          </p>
          <p class="leave-status" data-status></p>
          <button type="button" class="make-pass-hold add-memory-hold" data-hold aria-label="Hold to leave">
            <span class="make-pass-hold-ring" data-ring></span>
            <span class="make-pass-hold-label">Hold to leave it here</span>
          </button>
          <button type="button" class="pill pill--ghost" data-back>Back</button>
        </div>
      </section>
    `;
    wireChrome();
    garden?.highlightRegion?.(draft.region);
    root.querySelector("[data-back]")?.addEventListener("click", () => showStep(3));
    wireHold();
  }

  function wireHold() {
    const holdBtn = root.querySelector("[data-hold]");
    const ring = root.querySelector("[data-ring]");
    const status = root.querySelector("[data-status]");

    const setProgress = (p) => {
      if (ring) ring.style.setProperty("--hold", String(Math.max(0, Math.min(1, p))));
    };

    const stopHold = (complete) => {
      holding = false;
      window.cancelAnimationFrame(holdRaf);
      if (complete) {
        setProgress(1);
        void finishLeave(status, holdBtn);
        return;
      }
      gsap.to(
        { v: Number(ring?.style.getPropertyValue("--hold") || 0) },
        {
          v: 0,
          duration: 0.3,
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
      if (holding || casting) return;
      holding = true;
      holdStart = performance.now();
      holdRaf = requestAnimationFrame(tick);
    };

    holdBtn?.addEventListener("pointerdown", startHold);
    holdBtn?.addEventListener("pointerup", () => stopHold(false));
    holdBtn?.addEventListener("pointerleave", () => {
      if (holding) stopHold(false);
    });
    holdBtn?.addEventListener("pointercancel", () => stopHold(false));
  }

  async function finishLeave(status, holdBtn) {
    if (casting) return;
    casting = true;
    if (holdBtn) holdBtn.disabled = true;
    if (status) status.textContent = "Leaving…";

    const body = draft.body.trim().slice(0, MAX_BODY_CHARS);
    const title = (draft.title.trim() || autoTitleFromBody(body)).slice(0, 48);
    const pass = getPass();
    const landing = garden?.resolveLandingPosition?.(draft.region) || null;
    const id = `u${Date.now().toString(36)}`;
    const memory = {
      id,
      title,
      body,
      relationship: draft.relationship,
      region: draft.region,
      place: "Opera House",
      emotion: draft.emotion,
      local: true,
      createdAt: Date.now(),
      author: pass?.name || "",
      authorName: pass?.name || "",
      landingPulseMs: 10000,
    };
    if (landing) memory.position = landing;

    const { ok, memory: saved } = persistMemory(memory);
    if (!ok) {
      casting = false;
      if (holdBtn) holdBtn.disabled = false;
      if (status) {
        status.textContent =
          "Couldn't save on this device — try again.";
      }
      return;
    }

    garden?.highlightRegion?.(null);
    root.classList.remove("is-active");
    root.hidden = true;
    root.innerHTML = "";
    active = false;
    onExit?.();

    const targetPosition = landing || [0, 2, 0];
    try {
      await garden?.runArrival?.({
        text: body,
        emotion: draft.emotion,
        targetPosition,
        onLand: () => {
          try {
            garden?.addMemory?.({
              ...saved,
              position: targetPosition,
              landingPulseMs: 10000,
            });
          } catch (err) {
            console.error(err);
          }
          onCountChange?.();
        },
      });
    } catch (err) {
      console.error(err);
      try {
        garden?.addMemory?.(saved);
      } catch (e) {
        console.error(e);
      }
      onCountChange?.();
    }

    garden?.setComposeMode?.(false);
    casting = false;
    onComplete?.(id);
    onArrivalNote?.(id);
  }

  function close({ cancel = true, castId = null } = {}) {
    if (!active && !casting) return;
    window.cancelAnimationFrame(holdRaf);
    holding = false;
    active = false;
    casting = false;
    garden?.highlightRegion?.(null);
    garden?.setComposeMode?.(false);
    root.classList.remove("is-active");
    root.hidden = true;
    root.innerHTML = "";
    onExit?.();
    if (!cancel && castId) onComplete?.(castId);
  }

  return {
    open,
    close: () => close({ cancel: true }),
    isActive: () => active,
    destroy() {
      close({ cancel: true });
      root.remove();
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
