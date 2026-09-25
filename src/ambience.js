import { readFlag, writeFlag } from "./core/storage.js";

const STORAGE_KEY = "still-here-ambience-muted";
const TRACK_URL = "/assets/audio/bittersweet-symphony.mp3";
const MASTER_VOLUME = 0.16;

/**
 * Soft looping score — low, muffled, lightly reverbed.
 * Starts on first user gesture (Enter experience).
 */
export function createAmbience({ toggleEl } = {}) {
  let ctx = null;
  let audio = null;
  let masterGain = null;
  let started = false;
  let muted = readFlag(STORAGE_KEY);

  function syncToggle() {
    if (!toggleEl) return;
    toggleEl.setAttribute("aria-pressed", muted ? "true" : "false");
    toggleEl.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");
    toggleEl.classList.toggle("is-muted", muted);
  }

  function applyMute() {
    if (!masterGain || !ctx) return;
    const target = muted ? 0 : MASTER_VOLUME;
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
  }

  function makeImpulse(context, seconds = 2.4, decay = 2.8) {
    const rate = context.sampleRate;
    const length = Math.floor(rate * seconds);
    const impulse = context.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  async function ensureGraph() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();

    audio = new Audio(TRACK_URL);
    audio.loop = true;
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";

    const source = ctx.createMediaElementSource(audio);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1100;
    lowpass.Q.value = 0.7;

    const highshelf = ctx.createBiquadFilter();
    highshelf.type = "highshelf";
    highshelf.frequency.value = 2400;
    highshelf.gain.value = -10;

    const dry = ctx.createGain();
    dry.gain.value = 0.55;

    const wet = ctx.createGain();
    wet.gain.value = 0.5;

    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx);

    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : MASTER_VOLUME;

    source.connect(lowpass);
    lowpass.connect(highshelf);
    highshelf.connect(dry);
    highshelf.connect(convolver);
    convolver.connect(wet);
    dry.connect(masterGain);
    wet.connect(masterGain);
    masterGain.connect(ctx.destination);
  }

  async function start() {
    try {
      await ensureGraph();
      if (ctx.state === "suspended") await ctx.resume();
      if (!started) {
        await audio.play();
        started = true;
      }
      applyMute();
      syncToggle();
      show();
    } catch (err) {
      console.warn("Ambience could not start:", err);
    }
  }

  function setMuted(next) {
    muted = Boolean(next);
    writeFlag(STORAGE_KEY, muted);
    applyMute();
    syncToggle();
  }

  function toggle() {
    setMuted(!muted);
  }

  function show() {
    const wrap = toggleEl?.closest?.(".chrome-tr");
    wrap?.classList.remove("chrome-hidden");
    toggleEl?.classList.remove("chrome-hidden");
    toggleEl?.classList.add("is-visible");
  }

  function hide() {
    const wrap = toggleEl?.closest?.(".chrome-tr");
    wrap?.classList.add("chrome-hidden");
    toggleEl?.classList.add("chrome-hidden");
    toggleEl?.classList.remove("is-visible");
  }

  toggleEl?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggle();
  });

  syncToggle();

  return {
    start,
    toggle,
    setMuted,
    isMuted: () => muted,
    show,
    hide,
  };
}
