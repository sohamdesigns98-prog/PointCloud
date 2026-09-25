import gsap from "gsap";
import { getPassArt } from "./passArt.js";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const PARTICLE_COUNT = 4800;

/**
 * Run the ~3.5s pass-ready sequence on a card element.
 * @param {{
 *   cardEl: HTMLElement,
 *   pass: { id: string, name: string, art: string, issuedAt: number },
 *   reducedMotion?: boolean,
 *   onComplete?: () => void,
 * }} opts
 */
export function playPassReady({
  cardEl,
  pass,
  reducedMotion = false,
  onComplete,
}) {
  if (!cardEl) {
    onComplete?.();
    return { kill() {} };
  }

  if (reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return playReduced(cardEl, pass, onComplete);
  }

  const wrap = cardEl.parentElement || cardEl;
  const canvas = document.createElement("canvas");
  canvas.className = "pass-ready-canvas";
  wrap.appendChild(canvas);

  const rect = cardEl.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(wrapRect.width * dpr));
  canvas.height = Math.max(1, Math.floor(wrapRect.height * dpr));
  canvas.style.width = `${wrapRect.width}px`;
  canvas.style.height = `${wrapRect.height}px`;
  const ctx = canvas.getContext("2d", { alpha: true });

  const local = {
    x: rect.left - wrapRect.left,
    y: rect.top - wrapRect.top,
    w: rect.width,
    h: rect.height,
  };

  const colors = sampleArtColors(getPassArt(pass.art).src, 64);
  const particles = buildParticles(PARTICLE_COUNT, local, colors);

  const state = {
    dissolve: 0,
    gather: 0,
    sweep: -0.2,
    meta: 0,
    pulse: 0,
    settle: 0,
    nameFlash: 0,
  };

  let raf = 0;
  let killed = false;
  const metaEl = cardEl.querySelector("[data-pass-meta]");
  const nameEl = cardEl.querySelector("[data-pass-name]");
  const finalMeta = metaEl?.textContent || "";
  if (metaEl) {
    metaEl.hidden = false;
    metaEl.textContent = scramble(finalMeta);
  }

  cardEl.classList.add("is-ready-animating");

  const tl = gsap.timeline({
    onUpdate: () => {
      /* drawn in raf */
    },
    onComplete: () => {
      cleanup();
      onComplete?.();
    },
  });

  gsap.set(cardEl, { opacity: 1 });

  tl.to(state, { dissolve: 1, duration: 0.6, ease: "power2.out" }, 0);
  tl.set(cardEl, { opacity: 0 }, 0.15);
  tl.to(state, { gather: 1, duration: 1.0, ease: "power3.inOut" }, 0.6);
  tl.set(cardEl, { opacity: 1 }, 1.45);
  tl.to(state, { dissolve: 0, duration: 0.2 }, 1.4);
  tl.to(state, { sweep: 1.2, duration: 0.6, ease: "none" }, 1.6);
  tl.to(
    state,
    {
      meta: 1,
      duration: 0.8,
      ease: "none",
      onUpdate() {
        if (!metaEl) return;
        metaEl.textContent = resolveScramble(finalMeta, state.meta);
      },
    },
    1.8
  );
  tl.to(
    state,
    {
      nameFlash: 1,
      duration: 0.35,
      yoyo: true,
      repeat: 1,
      onUpdate() {
        if (nameEl) {
          nameEl.style.filter = `brightness(${1 + state.nameFlash * 0.55})`;
        }
      },
      onComplete() {
        if (nameEl) nameEl.style.filter = "";
      },
    },
    2.0
  );
  tl.to(state, { pulse: 1, duration: 0.6, ease: "power2.out" }, 2.6);
  tl.add(() => {
    try {
      navigator.vibrate?.(30);
    } catch {
      /* ignore */
    }
  }, 2.65);
  tl.fromTo(
    cardEl,
    { y: 0, rotateX: 0, rotateY: 0 },
    {
      y: -6,
      rotateX: 4,
      rotateY: -3,
      duration: 0.2,
      ease: "power2.out",
      yoyo: true,
      repeat: 1,
    },
    3.2
  );

  function draw() {
    if (killed || !ctx) return;
    raf = requestAnimationFrame(draw);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const tDissolve = state.dissolve;
    const tGather = state.gather;
    const mix = tGather > 0 ? 1 - tGather : tDissolve;

    if (mix > 0.02) {
      for (const p of particles) {
        const ox = p.x + p.vx * mix * 28;
        const oy = p.y + p.vy * mix * 28;
        const x = gsap.utils.interpolate(ox, p.x, tGather);
        const y = gsap.utils.interpolate(oy, p.y, tGather);
        const a = Math.min(1, mix * 1.2) * (1 - tGather * 0.85);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, p.s, p.s);
      }
    }

    if (state.sweep > 0 && state.sweep < 1.15) {
      const g = ctx.createLinearGradient(
        local.x,
        local.y,
        local.x + local.w,
        local.y + local.h
      );
      const u = state.sweep;
      g.addColorStop(Math.max(0, u - 0.15), "rgba(255,255,255,0)");
      g.addColorStop(u, "rgba(255,255,255,0.35)");
      g.addColorStop(Math.min(1, u + 0.15), "rgba(255,255,255,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      roundRect(ctx, local.x, local.y, local.w, local.h, 14);
      ctx.fill();
    }

    if (state.pulse > 0) {
      const r = state.pulse * Math.max(local.w, local.h) * 0.55;
      ctx.globalAlpha = (1 - state.pulse) * 0.55;
      ctx.strokeStyle = "rgba(224,196,154,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(
        local.x + local.w / 2,
        local.y + local.h / 2,
        local.w / 2 + r,
        local.h / 2 + r * 0.7,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

    ctx.restore();
  }
  draw();

  function cleanup() {
    if (killed) return;
    killed = true;
    cancelAnimationFrame(raf);
    canvas.remove();
    cardEl.classList.remove("is-ready-animating");
    gsap.set(cardEl, { clearProps: "opacity,y,rotateX,rotateY" });
    if (nameEl) nameEl.style.filter = "";
    if (metaEl && finalMeta) {
      metaEl.hidden = false;
      metaEl.textContent = finalMeta;
    }
  }

  return {
    kill() {
      tl.kill();
      cleanup();
    },
  };
}

function playReduced(cardEl, pass, onComplete) {
  const metaEl = cardEl.querySelector("[data-pass-meta]");
  gsap.fromTo(
    cardEl,
    { opacity: 0.3 },
    {
      opacity: 1,
      duration: 0.4,
      ease: EASE,
      onComplete: () => {
        if (metaEl) metaEl.hidden = false;
        gsap.fromTo(
          cardEl,
          { filter: "brightness(1)" },
          {
            filter: "brightness(1.15)",
            duration: 0.25,
            yoyo: true,
            repeat: 1,
            onComplete: () => {
              gsap.set(cardEl, { clearProps: "filter" });
              onComplete?.();
            },
          }
        );
      },
    }
  );
  return { kill() { gsap.killTweensOf(cardEl); } };
}

function buildParticles(count, box, colors) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    list.push({
      x: box.x + u * box.w,
      y: box.y + v * box.h,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2 - 0.3,
      s: 0.8 + Math.random() * 1.6,
      color: colors[(Math.random() * colors.length) | 0],
    });
  }
  return list;
}

function sampleArtColors(src, n) {
  const fallback = ["#e0c49a", "#c88880", "#8aa4c4", "#1a2030", "#f5e6d0"];
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    // Sync path unavailable; use warm defaults + enqueue async refill via canvas when loaded
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;
        const out = [];
        for (let i = 0; i < data.length; i += 16) {
          out.push(`rgb(${data[i]},${data[i + 1]},${data[i + 2]})`);
        }
        if (out.length) fallback.splice(0, fallback.length, ...out);
      } catch {
        /* ignore */
      }
    };
    img.src = src;
  } catch {
    /* ignore */
  }
  const colors = [];
  for (let i = 0; i < n; i++) colors.push(fallback[i % fallback.length]);
  return colors;
}

function scramble(text) {
  const glyphs = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789· ";
  return String(text)
    .split("")
    .map((ch) => (ch === " " || ch === "·" ? ch : glyphs[(Math.random() * 36) | 0]))
    .join("");
}

function resolveScramble(finalText, t) {
  const glyphs = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  const n = Math.floor(finalText.length * Math.min(1, Math.max(0, t)));
  return finalText
    .split("")
    .map((ch, i) => {
      if (i < n) return ch;
      if (ch === " " || ch === "·") return ch;
      return glyphs[(Math.random() * glyphs.length) | 0];
    })
    .join("");
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
