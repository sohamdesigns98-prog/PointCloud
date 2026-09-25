import gsap from "gsap";

/** Tunables for the opening assemble — smoother, less “lerp demo.” */
export const INTRO = {
  assembleDuration: 4.1,
  cameraDuration: 4.4,
  chromeFadeDuration: 0.85,
  chromeFadeDelay: 3.1,
  disperseRadius: 6.2,
};

/**
 * Soft unresolved cloud around rest — denser near silhouette so form ghosts in early.
 */
export function fillDispersedStarts(rest, outStart, radius = INTRO.disperseRadius) {
  for (let i = 0; i < rest.length; i += 3) {
    const rx = rest[i];
    const ry = rest[i + 1];
    const rz = rest[i + 2];
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    // Bias toward rest so assemble feels like mist clarifying, not debris flying in
    const r = Math.pow(Math.random(), 0.72) * radius;
    outStart[i] = rx + r * Math.sin(phi) * Math.cos(theta);
    outStart[i + 1] = ry + r * Math.cos(phi) * 0.55;
    outStart[i + 2] = rz + r * Math.sin(phi) * Math.sin(theta);
  }
  return outStart;
}

/**
 * Mix start → rest with a soft ease (smoothstep²) so motion isn’t linear.
 * `u` is timeline progress 0–1; we re-curve it here.
 */
export function mixPositions(start, rest, out, u) {
  // Double smoothstep — slow start, soft settle
  let t = Math.min(1, Math.max(0, u));
  t = t * t * (3 - 2 * t);
  t = t * t * (3 - 2 * t);
  const inv = 1 - t;
  for (let i = 0; i < rest.length; i++) {
    out[i] = start[i] * inv + rest[i] * t;
  }
}

/**
 * Run assemble + camera settle. Resolves when intro completes (or is skipped).
 */
export function runIntro({
  camera,
  controls,
  fitCenter,
  endCameraPos,
  onProgress,
  onChromeFade,
  onComplete,
  canvas,
}) {
  const state = {
    progress: 0,
    done: false,
    skipped: false,
  };

  controls.enabled = false;

  const startCam = {
    x: endCameraPos.x + 5.5,
    y: endCameraPos.y + 6.2,
    z: endCameraPos.z + 9.5,
  };
  camera.position.set(startCam.x, startCam.y, startCam.z);
  controls.target.copy(fitCenter);
  camera.lookAt(fitCenter);

  const tl = gsap.timeline({
    defaults: { ease: "power3.inOut" },
    onComplete: finish,
  });

  tl.to(
    state,
    {
      progress: 1,
      duration: INTRO.assembleDuration,
      ease: "power4.inOut",
      onUpdate: () => onProgress?.(state.progress),
    },
    0
  );

  tl.to(
    camera.position,
    {
      x: endCameraPos.x,
      y: endCameraPos.y,
      z: endCameraPos.z,
      duration: INTRO.cameraDuration,
      ease: "power3.inOut",
      onUpdate: () => camera.lookAt(fitCenter),
    },
    0
  );

  tl.call(
    () => {
      onChromeFade?.(INTRO.chromeFadeDuration);
    },
    null,
    INTRO.chromeFadeDelay
  );

  function finish() {
    if (state.done) return;
    state.done = true;
    state.progress = 1;
    onProgress?.(1);
    camera.position.copy(endCameraPos);
    controls.target.copy(fitCenter);
    controls.enabled = true;
    controls.update();
    detachSkip();
    onComplete?.({ skipped: state.skipped });
  }

  function skip(event) {
    if (state.done) return;
    if (event?.target?.closest?.(".memory-sheet, .memory-panel, .dismiss, .leave-mode, .dock, .screen-layer, .pill, .ambience-toggle, .bookmark-toggle, .app-back-btn, .emotion-select, .emotion-filters")) return;
    state.skipped = true;
    if (tl.progress() < 1) tl.progress(1);
    else finish();
  }

  function onKey(e) {
    if (e.key === "Escape") skip(e);
  }

  function detachSkip() {
    canvas?.removeEventListener("pointerdown", skipEarly);
    window.removeEventListener("keydown", onKey);
  }

  function skipEarly(e) {
    skip(e);
  }

  canvas?.addEventListener("pointerdown", skipEarly, { once: false });
  window.addEventListener("keydown", onKey);

  return {
    get progress() {
      return state.progress;
    },
    get done() {
      return state.done;
    },
    skip: () => skip(),
    kill() {
      tl.kill();
      detachSkip();
    },
  };
}
