/**
 * Six-beat grand arrival: words → particles → orb → trail → land → settle.
 * Entry: playArrival({ text, emotion, targetPosition, scene, camera, renderer, … })
 */

import gsap from "gsap";
import * as THREE from "three";
import { getAura } from "../pass/auras.js";

const HOLD_LABELS = [
  "wordsLift",
  "toParticles",
  "condense",
  "swirl",
  "arrive",
  "settle",
];

/**
 * @param {{
 *   text: string,
 *   emotion?: string,
 *   targetPosition: THREE.Vector3 | number[],
 *   scene: THREE.Scene,
 *   camera: THREE.PerspectiveCamera,
 *   renderer: THREE.WebGLRenderer,
 *   controls?: { target: THREE.Vector3, update?: () => void },
 *   bloomPass?: { strength: number },
 *   fitCenter?: THREE.Vector3,
 *   onLand?: () => void,
 *   reducedMotion?: boolean,
 *   mount?: HTMLElement,
 * }} opts
 * @returns {Promise<void>}
 */
export function playArrival(opts) {
  const reduced =
    opts.reducedMotion === true ||
    (typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

  if (reduced) {
    return playReduced(opts);
  }
  return playFull(opts);
}

function playReduced(opts) {
  const mount = opts.mount || document.body;
  const overlay = document.createElement("div");
  overlay.className = "arrival-overlay arrival-overlay--reduced";
  overlay.innerHTML = `<p class="arrival-words">${escapeHtml(opts.text)}</p>`;
  mount.appendChild(overlay);

  return new Promise((resolve) => {
    gsap.fromTo(
      overlay,
      { opacity: 0 },
      {
        opacity: 1,
        duration: 0.2,
        onComplete() {
          opts.onLand?.();
          gsap.to(overlay, {
            opacity: 0,
            duration: 0.2,
            delay: 0.05,
            onComplete() {
              overlay.remove();
              resolve();
            },
          });
        },
      }
    );
  });
}

function playFull(opts) {
  const {
    text,
    emotion,
    scene,
    camera,
    renderer,
    controls,
    bloomPass,
    fitCenter,
    onLand,
  } = opts;
  const target = toVec3(opts.targetPosition);
  const mount = opts.mount || document.body;
  const aura = getAura(emotion) || getAura("nostalgia");
  const tint = new THREE.Color(aura?.hue || "#c4a882");

  const overlay = document.createElement("div");
  overlay.className = "arrival-overlay";
  overlay.innerHTML = `<p class="arrival-words" data-words>${escapeHtml(
    clipText(text, 120)
  )}</p>`;
  mount.appendChild(overlay);
  const wordsEl = overlay.querySelector("[data-words]");

  const disposables = [];
  const bloomBase = bloomPass ? bloomPass.strength : 0;
  const camStart = camera.position.clone();
  const targetStart = controls?.target?.clone?.() || fitCenter?.clone();

  const count = particleBudget();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    seeds[i] = Math.random();
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.09,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  disposables.push(() => {
    scene.remove(points);
    geo.dispose();
    mat.dispose();
  });

  // Trail ring buffer
  const trailLen = Math.min(700, Math.max(400, Math.floor(count * 0.15)));
  const trailPos = new Float32Array(trailLen * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  const trailMat = new THREE.PointsMaterial({
    size: 0.055,
    color: tint,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const trail = new THREE.Points(trailGeo, trailMat);
  trail.frustumCulled = false;
  scene.add(trail);
  disposables.push(() => {
    scene.remove(trail);
    trailGeo.dispose();
    trailMat.dispose();
  });

  // Orb core
  const orbGeo = new THREE.SphereGeometry(0.18, 16, 16);
  const orbMat = new THREE.MeshBasicMaterial({
    color: tint,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const orb = new THREE.Mesh(orbGeo, orbMat);
  scene.add(orb);
  disposables.push(() => {
    scene.remove(orb);
    orbGeo.dispose();
    orbMat.dispose();
  });

  const state = {
    phase: 0,
    curl: 0,
    trailHead: 0,
    landed: false,
  };

  const center = fitCenter?.clone?.() || new THREE.Vector3(0, 2, 0);
  const path = buildSailPath(center, target);
  const pathPoint = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  // Sample letter positions in NDC from overlay canvas
  const letterSamples = sampleLetterPoints(wordsEl, count);

  return new Promise((resolve) => {
    const tl = gsap.timeline({
      onComplete() {
        cleanup();
        resolve();
      },
    });

    // Beat 1 — wordsLift
    tl.addLabel(HOLD_LABELS[0], 0);
    tl.fromTo(
      wordsEl,
      { opacity: 0, y: 18, filter: "blur(6px)" },
      {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.7,
        ease: "power2.out",
      },
      0
    );
    tl.to(
      wordsEl,
      {
        textShadow: `0 0 28px ${aura?.soft || "rgba(196,168,130,0.5)"}`,
        duration: 0.5,
      },
      0.35
    );

    // Beat 2 — toParticles: handoff DOM → GPU points
    tl.addLabel(HOLD_LABELS[1], 0.9);
    tl.call(
      () => {
        placeFromLetters(letterSamples, positions, camera, renderer);
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 0.95;
        mat.size = 0.07;
      },
      null,
      0.95
    );
    tl.to(wordsEl, { opacity: 0, duration: 0.55, ease: "power1.in" }, 1.0);
    tl.to(
      { curl: 0 },
      {
        curl: 1,
        duration: 1.1,
        ease: "power2.inOut",
        onUpdate() {
          state.curl = this.targets()[0].curl;
          dissolveCurl(positions, letterSamples, state.curl, camera, renderer);
          geo.attributes.position.needsUpdate = true;
        },
      },
      1.05
    );

    // Beat 3 — condense to orb
    tl.addLabel(HOLD_LABELS[2], 2.1);
    const orbHome = center.clone().add(new THREE.Vector3(0, 1.4, 1.2));
    tl.to(
      { u: 0 },
      {
        u: 1,
        duration: 1.15,
        ease: "power3.inOut",
        onUpdate() {
          const u = this.targets()[0].u;
          condenseTo(positions, orbHome, u, seeds);
          geo.attributes.position.needsUpdate = true;
          orb.position.copy(orbHome);
          orbMat.opacity = u * 0.85;
          mat.size = 0.07 * (1 - u * 0.55) + 0.04;
          if (bloomPass) {
            bloomPass.strength = bloomBase + u * 0.55;
          }
        },
      },
      2.15
    );
    tl.to(mat, { opacity: 0.55, duration: 0.6 }, 2.4);

    // Beat 4 — swirl along sails
    tl.addLabel(HOLD_LABELS[3], 3.3);
    tl.to(trailMat, { opacity: 0.7, duration: 0.35 }, 3.35);
    tl.to(
      { t: 0 },
      {
        t: 0.78,
        duration: 2.2,
        ease: "none",
        onUpdate() {
          const t = this.targets()[0].t;
          path.getPoint(t, pathPoint);
          orb.position.copy(pathPoint);
          packAround(positions, pathPoint, 0.55, seeds);
          geo.attributes.position.needsUpdate = true;
          pushTrail(trailPos, state, pathPoint, trailLen);
          trailGeo.attributes.position.needsUpdate = true;
          if (controls?.target && fitCenter) {
            tmp.copy(fitCenter).lerp(pathPoint, 0.35);
            controls.target.lerp(tmp, 0.08);
            camera.position.lerp(
              pathPoint.clone().add(new THREE.Vector3(2.8, 2.2, 4.5)),
              0.04
            );
            camera.lookAt(controls.target);
          }
        },
      },
      3.4
    );

    // Beat 5 — arrive / dive
    tl.addLabel(HOLD_LABELS[4], 5.5);
    tl.to(
      { t: 0.78 },
      {
        t: 1,
        duration: 0.85,
        ease: "power2.in",
        onUpdate() {
          const t = this.targets()[0].t;
          path.getPoint(t, pathPoint);
          orb.position.copy(pathPoint);
          packAround(positions, pathPoint, 0.35 * (1 - (t - 0.78) / 0.22), seeds);
          geo.attributes.position.needsUpdate = true;
          pushTrail(trailPos, state, pathPoint, trailLen);
          trailGeo.attributes.position.needsUpdate = true;
          if (controls?.target) {
            controls.target.lerp(target, 0.12);
            camera.position.lerp(
              target.clone().add(new THREE.Vector3(1.6, 1.4, 3.2)),
              0.08
            );
            camera.lookAt(controls.target);
          }
        },
      },
      5.55
    );

    // Beat 6 — settle
    tl.addLabel(HOLD_LABELS[5], 6.35);
    tl.call(
      () => {
        if (!state.landed) {
          state.landed = true;
          onLand?.();
        }
      },
      null,
      6.4
    );
    tl.to(orbMat, { opacity: 0, duration: 0.4 }, 6.45);
    tl.to(mat, { opacity: 0, duration: 0.45 }, 6.45);
    tl.to(trailMat, { opacity: 0, duration: 0.5 }, 6.5);
    if (bloomPass) {
      tl.to(bloomPass, { strength: bloomBase, duration: 0.6 }, 6.5);
    }
    if (controls?.target && targetStart) {
      tl.to(
        controls.target,
        {
          x: targetStart.x,
          y: targetStart.y,
          z: targetStart.z,
          duration: 0.9,
          ease: "power2.out",
        },
        6.55
      );
      tl.to(
        camera.position,
        {
          x: camStart.x,
          y: camStart.y,
          z: camStart.z,
          duration: 0.9,
          ease: "power2.out",
          onUpdate() {
            camera.lookAt(controls.target);
          },
        },
        6.55
      );
    }
    tl.to(overlay, { opacity: 0, duration: 0.3 }, 6.6);

    function cleanup() {
      if (!state.landed) {
        state.landed = true;
        onLand?.();
      }
      if (bloomPass) bloomPass.strength = bloomBase;
      for (const d of disposables) d();
      overlay.remove();
    }
  });
}

function particleBudget() {
  const w = typeof window !== "undefined" ? window.innerWidth : 1200;
  if (w < 640) return 1800;
  if (w < 1024) return 3200;
  return 4500;
}

function toVec3(v) {
  if (v instanceof THREE.Vector3) return v.clone();
  if (Array.isArray(v)) return new THREE.Vector3(v[0], v[1], v[2]);
  return new THREE.Vector3(0, 2, 0);
}

function clipText(text, max) {
  const t = String(text || "").trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildSailPath(center, target) {
  const c = center.clone();
  const pts = [
    c.clone().add(new THREE.Vector3(0, 1.4, 1.2)),
    c.clone().add(new THREE.Vector3(2.4, 2.6, 0.4)),
    c.clone().add(new THREE.Vector3(0.6, 3.4, -2.2)),
    c.clone().add(new THREE.Vector3(-2.2, 2.8, -0.8)),
    c.clone().add(new THREE.Vector3(-1.0, 1.8, 1.6)),
    target.clone().add(new THREE.Vector3(0.4, 0.8, 0.6)),
    target.clone(),
  ];
  return new THREE.CatmullRomCurve3(pts);
}

function sampleLetterPoints(el, count) {
  const samples = new Float32Array(count * 2);
  if (!el) {
    for (let i = 0; i < count; i++) {
      samples[i * 2] = (Math.random() - 0.5) * 0.6;
      samples[i * 2 + 1] = (Math.random() - 0.5) * 0.25;
    }
    return samples;
  }
  const canvas = document.createElement("canvas");
  const w = Math.min(720, Math.max(320, Math.floor(window.innerWidth * 0.7)));
  const h = 140;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return samples;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = "600 36px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = el.textContent || "";
  wrapFillText(ctx, text, w / 2, h / 2, w * 0.9, 40);
  const data = ctx.getImageData(0, 0, w, h).data;
  const hits = [];
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (data[(y * w + x) * 4] > 40) hits.push(x, y);
    }
  }
  for (let i = 0; i < count; i++) {
    if (hits.length >= 2) {
      const hi = (Math.floor(Math.random() * (hits.length / 2)) * 2) | 0;
      samples[i * 2] = (hits[hi] / w) * 2 - 1;
      samples[i * 2 + 1] = -((hits[hi + 1] / h) * 2 - 1) * 0.35;
    } else {
      samples[i * 2] = (Math.random() - 0.5) * 0.8;
      samples[i * 2 + 1] = (Math.random() - 0.5) * 0.3;
    }
  }
  return samples;
}

function wrapFillText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lineH) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineH));
}

function placeFromLetters(samples, positions, camera, renderer) {
  const ndc = new THREE.Vector3();
  for (let i = 0; i < samples.length / 2; i++) {
    ndc.set(samples[i * 2], samples[i * 2 + 1], 0.35);
    ndc.unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const p = camera.position.clone().addScaledVector(dir, 8);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }
  void renderer;
}

function dissolveCurl(positions, samples, curl, camera, renderer) {
  const ndc = new THREE.Vector3();
  const n = samples.length / 2;
  for (let i = 0; i < n; i++) {
    const reveal = i / n;
    const local = Math.max(0, Math.min(1, (curl - reveal * 0.55) / 0.45));
    if (local <= 0) continue;
    ndc.set(samples[i * 2], samples[i * 2 + 1], 0.35);
    ndc.unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const base = camera.position.clone().addScaledVector(dir, 8);
    const angle = local * Math.PI * 1.6 + i * 0.01;
    const r = local * 1.8;
    positions[i * 3] = base.x + Math.cos(angle) * r;
    positions[i * 3 + 1] = base.y + Math.sin(angle * 0.7) * r * 0.6 + local * 0.8;
    positions[i * 3 + 2] = base.z + Math.sin(angle) * r;
  }
  void renderer;
}

function condenseTo(positions, home, u, seeds) {
  const n = positions.length / 3;
  for (let i = 0; i < n; i++) {
    const ix = i * 3;
    const spiral = seeds[i] * Math.PI * 2 + u * Math.PI * 4;
    const r = (1 - u) * (0.8 + seeds[i] * 2.2);
    const tx = home.x + Math.cos(spiral) * r;
    const ty = home.y + Math.sin(spiral * 1.3) * r * 0.55;
    const tz = home.z + Math.sin(spiral) * r;
    positions[ix] += (tx - positions[ix]) * (0.12 + u * 0.35);
    positions[ix + 1] += (ty - positions[ix + 1]) * (0.12 + u * 0.35);
    positions[ix + 2] += (tz - positions[ix + 2]) * (0.12 + u * 0.35);
  }
}

function packAround(positions, center, radius, seeds) {
  const n = positions.length / 3;
  for (let i = 0; i < n; i++) {
    const ix = i * 3;
    const a = seeds[i] * Math.PI * 2;
    const r = radius * (0.2 + seeds[(i + 3) % n] * 0.8);
    const tx = center.x + Math.cos(a) * r;
    const ty = center.y + Math.sin(a * 1.7) * r * 0.5;
    const tz = center.z + Math.sin(a) * r;
    positions[ix] += (tx - positions[ix]) * 0.28;
    positions[ix + 1] += (ty - positions[ix + 1]) * 0.28;
    positions[ix + 2] += (tz - positions[ix + 2]) * 0.28;
  }
}

function pushTrail(trailPos, state, point, trailLen) {
  const i = state.trailHead % trailLen;
  trailPos[i * 3] = point.x;
  trailPos[i * 3 + 1] = point.y;
  trailPos[i * 3 + 2] = point.z;
  state.trailHead += 1;
}
