import { createGarden } from "./garden.js";
import {
  memoryCountLabel,
  memories as seedMemories,
} from "./memories.js";
import { mergeMemories, loadUserMemories } from "./memoryStore.js";
import { hasPass } from "./pass/passStore.js";
import { auraLabel } from "./pass/auras.js";
import { createOpener } from "./screens/Opener.js";
import { createHowItWorks, hasCompletedWalkthrough } from "./screens/HowItWorks.js";
import { createLocations } from "./screens/Locations.js";
import { createMakePass } from "./screens/MakePass.js";
import { createLeaveMemory } from "./screens/LeaveMemory.js";
import { createAmbience } from "./ambience.js";
import { createSydneyMap } from "./sydneyMap.js";
import {
  isBookmarked,
  toggleBookmark,
  loadBookmarks,
} from "./bookmarkStore.js";
import { normalizeEmotion } from "./emotions.js";
import gsap from "gsap";

/**
 * Flow: Opener → Sydney map → Opera House garden → How / Why / Pass / Leave
 */
let appMode = "opener";

const canvas = document.querySelector("#garden");
const memorySheet = document.querySelector("#memory-sheet");
const memoryScrim = document.querySelector("#memory-sheet-scrim");
const memoryPanel = document.querySelector("#memory-panel");
const memoryTitle = document.querySelector("#memory-title");
const memoryRelationship = document.querySelector("#memory-relationship");
const memoryBody = document.querySelector("#memory-body");
const memoryAudio = document.querySelector("#memory-audio");
const memoryDismiss = document.querySelector("#memory-dismiss");
const btnSaveMemory = document.querySelector("#btn-save-memory");
const ambienceToggle = document.querySelector("#ambience-toggle");
const ambience = createAmbience({ toggleEl: ambienceToggle });
const mapChrome = document.querySelector("#map-chrome");
const mapHover = document.querySelector("#map-hover");
const btnMapWalkthrough = document.querySelector("#btn-map-walkthrough");
const btnAppBack = document.querySelector("#btn-app-back");
const emotionFilters = document.querySelector("#emotion-filters");
const emotionFilterSelect = document.querySelector("#emotion-filter-select");
const savedPanel = document.querySelector("#saved-panel");
const savedList = document.querySelector("#saved-list");
const savedEmpty = document.querySelector("#saved-empty");
const btnSaved = document.querySelector("#btn-saved");
const btnSavedClose = document.querySelector("#btn-saved-close");
let memoryCardTween = null;
let lastMemoryOrigin = null;
let lastMemoryRing = null;
let openMemory = null;
let mapApi = null;
let mapPromise = null;
/** Bumps when leaving garden so in-flight createGarden can't steal the canvas. */
let gardenEpoch = 0;
/** Bumps when leaving map so in-flight createSydneyMap can't attach late. */
let mapEpoch = 0;
let walkthroughTimer = 0;
let mapEnterHandler = null;
let mapEnterVisible = false;

function showMapEnter(title = "Sydney Opera House", cue = "Click to enter") {
  if (!mapHover) return;
  const titleEl = mapHover.querySelector(".map-enter-title");
  const cueEl = mapHover.querySelector(".map-enter-cue");
  if (titleEl) titleEl.textContent = title;
  if (cueEl) cueEl.textContent = cue;
  if (mapEnterVisible) return;
  mapEnterVisible = true;
  mapHover.hidden = false;
  gsap.killTweensOf(mapHover);
  gsap.set(mapHover, { xPercent: -50, yPercent: -100 });
  gsap.fromTo(
    mapHover,
    { autoAlpha: 0, scale: 0.78, y: 22 },
    {
      autoAlpha: 1,
      scale: 1,
      y: -12,
      duration: 0.48,
      ease: "back.out(1.7)",
      overwrite: "auto",
    }
  );
}

function hideMapEnter() {
  if (!mapHover || !mapEnterVisible) return;
  mapEnterVisible = false;
  gsap.killTweensOf(mapHover);
  gsap.to(mapHover, {
    autoAlpha: 0,
    scale: 0.88,
    y: 8,
    duration: 0.22,
    ease: "power2.in",
    overwrite: "auto",
    onComplete() {
      if (!mapEnterVisible) mapHover.hidden = true;
    },
  });
}

function hideMapEnterImmediate() {
  if (!mapHover) return;
  mapEnterVisible = false;
  gsap.killTweensOf(mapHover);
  gsap.set(mapHover, {
    autoAlpha: 0,
    scale: 1,
    y: 0,
    xPercent: -50,
    yPercent: -100,
  });
  mapHover.hidden = true;
}

function memoryCardParts() {
  if (!memoryPanel) return [];
  return [
    ...memoryPanel.querySelectorAll(
      ".memory-panel-head, .body, .memory-audio:not([hidden]), .memory-panel-actions"
    ),
  ];
}

function originOffset(origin) {
  if (!origin || !memorySheet) return { x: 0, y: 40 };
  const rect = memorySheet.getBoundingClientRect();
  return {
    x: origin.x - rect.width * 0.5,
    y: origin.y - rect.height * 0.5,
  };
}

function bloomRingOpen(ring) {
  if (!ring) return null;
  const proxy = { scale: 1, opacity: 1 };
  ring.setScale?.(1);
  ring.setOpacity?.(1);
  return gsap
    .timeline({ defaults: { overwrite: "auto" } })
    .to(proxy, {
      scale: 4.2,
      opacity: 1,
      duration: 0.38,
      ease: "power2.out",
      onUpdate() {
        ring.setScale?.(proxy.scale);
        ring.setOpacity?.(proxy.opacity);
      },
    })
    .to(proxy, {
      scale: 1.15,
      opacity: 0.35,
      duration: 0.55,
      ease: "power2.inOut",
      onUpdate() {
        ring.setScale?.(proxy.scale);
        ring.setOpacity?.(proxy.opacity);
      },
    });
}

function bloomRingClose(ring) {
  if (!ring) return null;
  const proxy = { scale: 1.15, opacity: 0.35 };
  ring.setScale?.(proxy.scale);
  ring.setOpacity?.(proxy.opacity);
  return gsap
    .timeline({ defaults: { overwrite: "auto" } })
    .to(proxy, {
      scale: 3.6,
      opacity: 1,
      duration: 0.28,
      ease: "power2.out",
      onUpdate() {
        ring.setScale?.(proxy.scale);
        ring.setOpacity?.(proxy.opacity);
      },
    })
    .to(proxy, {
      scale: 1,
      opacity: 1,
      duration: 0.4,
      ease: "power3.out",
      onUpdate() {
        ring.setScale?.(proxy.scale);
        ring.setOpacity?.(proxy.opacity);
      },
    });
}
const lookPrompt = document.querySelector("#look-prompt");
const hint = document.querySelector("#hint");
const countEl = document.querySelector("#memory-count");
const brand = document.querySelector("#brand");
const gardenFooter = document.querySelector("#garden-footer");
const focusTitle = document.querySelector("#focus-title");
const focusTitleText = document.querySelector("#focus-title-text");
const app = document.querySelector("#app");
const shellMount = document.querySelector("#shell-mount");
const leaveMount = document.querySelector("#leave-mount");
const dock = document.querySelector("#dock");
const btnPass = document.querySelector("#btn-pass");
const btnLeave = document.querySelector("#btn-leave");
const btnHow = document.querySelector("#btn-how");

const liveMemories = mergeMemories(seedMemories, loadUserMemories());
if (countEl) countEl.textContent = memoryCountLabel(liveMemories.length);

let gardenApi = null;
let gardenPromise = null;
let leaveApp = null;
let opener = null;
let howItWorks = null;
let makePass = null;
let locations = null;
let dockReady = false;

function clearChromeInlineOpacity() {
  const els = [brand, btnAppBack, gardenFooter, dock, emotionFilters, mapChrome, btnMapWalkthrough]
    .filter(Boolean);
  gsap.killTweensOf(els);
  gsap.set(els, { clearProps: "opacity" });
}

/** Force map UI visible — clears GSAP inline opacity that can hide brand/back. */
function revealMapUi() {
  clearChromeInlineOpacity();
  mapChrome?.classList.remove("chrome-hidden");
  brand?.classList.remove("chrome-hidden");
  btnAppBack?.classList.remove("chrome-hidden");
  if (btnAppBack) btnAppBack.hidden = false;
  if (btnMapWalkthrough) btnMapWalkthrough.hidden = false;
  ambience.show();
  syncAppBack();
}

function hideMapUi() {
  mapChrome?.classList.add("chrome-hidden");
  if (btnMapWalkthrough) btnMapWalkthrough.hidden = true;
  hideMapEnterImmediate();
}

function setAppMode(mode) {
  appMode = mode;
  const overlay =
    mode === "makePass" ||
    mode === "locations" ||
    mode === "how";
  app?.classList.toggle("is-opener-mode", mode === "opener");
  app?.classList.toggle("is-map-mode", mode === "map");
  app?.classList.toggle("is-overlay-mode", overlay);
  app?.classList.toggle(
    "is-garden-mode",
    mode === "garden" || mode === "memorySheet"
  );
  app?.classList.toggle("is-leave-mode", mode === "leave");
  app?.classList.toggle("is-sheet-mode", mode === "memorySheet");
  syncDock();
  syncEmotionFilters();
  syncAppBack();
  if (mode === "map") revealMapUi();
  else if (btnMapWalkthrough && mode !== "map") {
    btnMapWalkthrough.hidden = true;
  }
}

function hideStoryLayers({ keepWalkthrough = false } = {}) {
  if (!keepWalkthrough) howItWorks?.hide?.();
  makePass?.hide?.();
  locations?.hide?.();
  hideSavedPanel();
}

function syncDock() {
  const pass = hasPass();
  const onGarden =
    (appMode === "garden" || appMode === "memorySheet") && dockReady;
  if (btnHow) btnHow.hidden = !onGarden;
  if (btnPass) {
    btnPass.hidden = !onGarden;
    btnPass.textContent = pass ? "Memory Pass" : "Make your pass";
  }
  if (btnLeave) btnLeave.hidden = !(onGarden && pass);
  if (btnSaved) btnSaved.hidden = !onGarden;
  dock?.classList.toggle("dock--single", false);
}

function syncEmotionFilters() {
  const show =
    (appMode === "garden" || appMode === "memorySheet") && dockReady;
  if (!emotionFilters) return;
  emotionFilters.hidden = !show;
  emotionFilters.classList.toggle("chrome-hidden", !show);
}

function syncAppBack() {
  if (!btnAppBack) return;
  const show =
    appMode === "map" ||
    appMode === "garden" ||
    appMode === "memorySheet" ||
    appMode === "how" ||
    appMode === "locations" ||
    appMode === "makePass" ||
    appMode === "leave";
  btnAppBack.hidden = !show;
  btnAppBack.classList.toggle("chrome-hidden", !show);
  if (show) {
    brand?.classList.remove("chrome-hidden");
  }
}

function handleAppBack() {
  if (howItWorks?.isVisible?.()) {
    howItWorks.hide();
    return;
  }
  if (appMode === "map") {
    showOpener();
    return;
  }
  if (appMode === "garden" || appMode === "memorySheet") {
    enterMap();
    return;
  }
  if (appMode === "makePass") {
    makePass?.hide?.();
    enterMap({ startWalkthrough: false });
    return;
  }
  if (appMode === "locations") {
    returnToGarden();
    return;
  }
  if (appMode === "leave") {
    if (leaveApp?.isActive?.()) leaveApp.close();
    else returnToGarden();
  }
}

function syncSaveButton() {
  if (!btnSaveMemory) return;
  const saved = openMemory?.id ? isBookmarked(openMemory.id) : false;
  btnSaveMemory.classList.toggle("is-saved", saved);
  btnSaveMemory.textContent = saved ? "Saved" : "Save";
  btnSaveMemory.setAttribute(
    "aria-pressed",
    saved ? "true" : "false"
  );
}

function renderSavedList() {
  if (!savedList || !savedEmpty) return;
  const items = loadBookmarks();
  savedEmpty.hidden = items.length > 0;
  savedList.innerHTML = items
    .map(
      (b) => `
      <li>
        <button type="button" class="saved-item" data-id="${b.id}">
          <p class="saved-item-title">${escapeHtml(b.title)}</p>
          <p class="saved-item-meta">${escapeHtml(b.emotion || "")} · ${escapeHtml(b.place)}</p>
          <p class="saved-item-snippet">${escapeHtml(b.snippet)}</p>
        </button>
      </li>`
    )
    .join("");
  savedList.querySelectorAll("[data-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      openSavedMemory(id);
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showSavedPanel() {
  renderSavedList();
  if (savedPanel) savedPanel.hidden = false;
}

function hideSavedPanel() {
  if (savedPanel) savedPanel.hidden = true;
}

async function openSavedMemory(id) {
  hideSavedPanel();
  if (appMode === "map" || appMode === "opener") {
    await enterOperaGarden();
  } else if (appMode !== "garden" && appMode !== "memorySheet") {
    await returnToGarden();
  }
  gardenApi?.focusMemoryById?.(id);
}

function refreshCount() {
  const n = gardenApi?.getMemoryCount?.() ?? liveMemories.length;
  if (countEl) countEl.textContent = memoryCountLabel(n);
  locations?.refresh?.();
}

const ui = {
  dismissButton: memoryDismiss,
  setChromeVisible(visible) {
    brand?.classList.toggle("chrome-hidden", !visible);
    gardenFooter?.classList.toggle("chrome-hidden", !visible);
    dock?.classList.toggle("chrome-hidden", !visible);
    emotionFilters?.classList.toggle("chrome-hidden", !visible);
    if (visible) {
      dockReady = true;
      syncDock();
      syncEmotionFilters();
      syncAppBack();
    } else {
      btnAppBack?.classList.add("chrome-hidden");
      if (btnAppBack) btnAppBack.hidden = true;
    }
  },
  fadeChromeIn(duration = 0.7) {
    brand?.classList.remove("chrome-hidden");
    gardenFooter?.classList.remove("chrome-hidden");
    dock?.classList.remove("chrome-hidden");
    emotionFilters?.classList.remove("chrome-hidden");
    if (emotionFilters) emotionFilters.hidden = false;
    dockReady = true;
    syncDock();
    syncEmotionFilters();
    syncAppBack();
    const els = [brand, gardenFooter, dock, emotionFilters, btnAppBack].filter(Boolean);
    gsap.killTweensOf(els);
    gsap.fromTo(
      els,
      { opacity: 0 },
      {
        opacity: 1,
        duration,
        ease: "power2.out",
        overwrite: true,
        onComplete() {
          gsap.set(els, { clearProps: "opacity" });
        },
      }
    );
  },
  setMapChromeVisible(visible) {
    if (visible) {
      revealMapUi();
    } else {
      hideMapUi();
      brand?.classList.add("chrome-hidden");
    }
  },
  showMapHover(name, status) {
    showMapEnter(name || "Sydney Opera House", status || "Click to enter");
  },
  hideMapHover() {
    hideMapEnter();
  },
  updateMapEnterPosition(x, y) {
    if (!mapHover || mapHover.hidden) return;
    gsap.set(mapHover, {
      left: x,
      top: y,
      xPercent: -50,
      yPercent: -100,
    });
  },
  onMapEnterClick(handler) {
    mapEnterHandler = handler;
  },
  showMemory({
    id = null,
    relationship,
    body,
    audioDataUrl,
    title,
    emotion,
    place = "Opera House",
    origin = null,
    ring = null,
  }) {
    if (
      appMode === "leave" ||
      appMode === "locations" ||
      appMode === "makePass" ||
      appMode === "opener" ||
      appMode === "map" ||
      appMode === "how"
    ) {
      return;
    }
    setAppMode("memorySheet");
    openMemory = {
      id,
      title,
      body,
      emotion: normalizeEmotion(emotion) || emotion || "",
      place,
    };
    if (memoryTitle) memoryTitle.textContent = title || "";
    const mood = emotion ? auraLabel(emotion) : "";
    memoryRelationship.textContent = mood
      ? `${mood}${relationship ? ` · ${relationship}` : ""}`
      : relationship || "";
    memoryBody.textContent = body;
    syncSaveButton();
    if (memoryAudio) {
      if (audioDataUrl) {
        memoryAudio.src = audioDataUrl;
        memoryAudio.hidden = false;
      } else {
        memoryAudio.removeAttribute("src");
        memoryAudio.hidden = true;
      }
    }
    if (!memorySheet || !memoryPanel) return;

    lastMemoryOrigin = origin;
    lastMemoryRing = ring;
    memoryCardTween?.kill();
    memorySheet.hidden = false;
    this.hideFocusTitle?.();

    const from = originOffset(origin);
    const parts = memoryCardParts();
    const glow = memoryPanel.querySelector(".memory-panel-glow");

    gsap.set(memoryScrim, { opacity: 0 });
    gsap.set(memoryPanel, {
      x: from.x,
      y: from.y,
      scale: 0.12,
      rotation: -4,
      opacity: 0,
      filter: "blur(14px)",
      transformOrigin: "50% 50%",
    });
    gsap.set(parts, { opacity: 0, y: 14 });
    if (glow) gsap.set(glow, { opacity: 0, scale: 0.6 });

    const tl = gsap.timeline({ defaults: { overwrite: "auto" } });
    memoryCardTween = tl;

    const ringTl = bloomRingOpen(ring);
    if (ringTl) tl.add(ringTl, 0);

    tl.to(
      memoryScrim,
      { opacity: 1, duration: 0.45, ease: "power2.out" },
      0.12
    ).to(
      memoryPanel,
      {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
        filter: "blur(0px)",
        duration: 0.78,
        ease: "power3.out",
      },
      0.18
    );

    if (glow) {
      tl.to(
        glow,
        { opacity: 1, scale: 1, duration: 0.7, ease: "power2.out" },
        0.35
      );
    }

    if (parts.length) {
      tl.to(
        parts,
        {
          opacity: 1,
          y: 0,
          duration: 0.42,
          stagger: 0.07,
          ease: "power2.out",
        },
        0.48
      );
    }
  },
  hideMemory({
    origin = lastMemoryOrigin,
    ring = lastMemoryRing,
    immediate = false,
    onComplete = null,
  } = {}) {
    const finish = () => {
      if (memorySheet) memorySheet.hidden = true;
      if (memoryPanel) {
        gsap.set(memoryPanel, {
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
          filter: "none",
        });
      }
      if (memoryAudio) {
        memoryAudio.pause?.();
        memoryAudio.removeAttribute("src");
        memoryAudio.hidden = true;
      }
      lastMemoryOrigin = null;
      lastMemoryRing = null;
      openMemory = null;
      syncSaveButton();
      if (appMode === "memorySheet") setAppMode("garden");
      onComplete?.();
    };

    if (!memorySheet || memorySheet.hidden || !memoryPanel) {
      finish();
      return;
    }

    memoryCardTween?.kill();

    if (immediate) {
      ring?.reset?.();
      finish();
      return;
    }

    const to = originOffset(origin);
    const parts = memoryCardParts();
    const glow = memoryPanel.querySelector(".memory-panel-glow");
    const tl = gsap.timeline({
      defaults: { overwrite: "auto" },
      onComplete: finish,
    });
    memoryCardTween = tl;

    if (parts.length) {
      tl.to(
        parts,
        {
          opacity: 0,
          y: 8,
          duration: 0.18,
          stagger: 0.03,
          ease: "power1.in",
        },
        0
      );
    }
    if (glow) {
      tl.to(glow, { opacity: 0, scale: 0.7, duration: 0.25, ease: "power1.in" }, 0);
    }

    tl.to(
      memoryPanel,
      {
        x: to.x,
        y: to.y,
        scale: 0.1,
        rotation: 3,
        opacity: 0,
        filter: "blur(12px)",
        duration: 0.55,
        ease: "power3.in",
      },
      0.06
    ).to(
      memoryScrim,
      { opacity: 0, duration: 0.4, ease: "power2.in" },
      0.12
    );

    const ringTl = bloomRingClose(ring);
    if (ringTl) tl.add(ringTl, 0.2);
  },
  showFocusTitle(title) {
    if (!focusTitle || !focusTitleText) return;
    if (appMode !== "garden" && appMode !== "memorySheet") return;
    focusTitleText.textContent = title;
    focusTitle.hidden = false;
    requestAnimationFrame(() => focusTitle.classList.add("visible"));
  },
  updateFocusTitlePosition(_x, _y, onScreen) {
    if (!focusTitle) return;
    if (appMode !== "garden" && appMode !== "memorySheet") return;
    if (!onScreen) {
      focusTitle.classList.remove("visible");
      return;
    }
    focusTitle.hidden = false;
    focusTitle.classList.add("visible");
  },
  hideFocusTitle() {
    if (!focusTitle) return;
    focusTitle.classList.remove("visible");
    window.setTimeout(() => {
      if (!focusTitle.classList.contains("visible")) focusTitle.hidden = true;
    }, 350);
  },
  showLookPrompt() {
    if (appMode !== "garden") return;
    lookPrompt.hidden = false;
    requestAnimationFrame(() => lookPrompt.classList.add("visible"));
    window.setTimeout(() => {
      lookPrompt.classList.remove("visible");
      window.setTimeout(() => {
        lookPrompt.hidden = true;
      }, 850);
    }, 4200);
  },
  hideHint() {
    hint?.classList.add("fade");
  },
  nudgeLeaveMemory() {
    if (!hasPass()) return;
    if (appMode !== "garden" || !btnLeave || btnLeave.hidden) return;
    btnLeave.classList.add("pill--pulse");
    window.setTimeout(() => btnLeave.classList.remove("pill--pulse"), 2400);
  },
};

ui.setChromeVisible(false);

function ensureGarden() {
  if (gardenPromise) return gardenPromise;
  const status = document.createElement("p");
  status.className = "hint status-loading";
  status.textContent = "Opening the Opera House…";
  status.hidden = appMode === "opener" || appMode === "map";
  app?.appendChild(status);

  const epoch = gardenEpoch;
  gardenPromise = createGarden(canvas, ui, { memories: liveMemories })
    .then((garden) => {
      if (epoch !== gardenEpoch || appMode === "map" || appMode === "opener") {
        garden.dispose?.();
        status.remove();
        throw new Error("Garden load cancelled");
      }
      gardenApi = garden;
      gardenApi.setEmotionFilter(emotionFilterSelect?.value || "All");
      status.remove();
      leaveApp = createLeaveMemory({
        mount: leaveMount || app,
        garden: gardenApi,
        onEnter() {
          setAppMode("leave");
          ui.hideMemory({ immediate: true });
          gardenApi.setBackgroundMode?.(true);
        },
        onExit() {
          setAppMode("garden");
          gardenApi.setBackgroundMode?.(false);
          syncDock();
        },
        onCountChange: refreshCount,
        onComplete(id) {
          if (id) gardenApi.focusMemoryById?.(id);
        },
      });
      return garden;
    })
    .catch((err) => {
      if (epoch !== gardenEpoch) {
        status.remove();
        gardenPromise = null;
        return null;
      }
      console.error(err);
      status.hidden = false;
      status.textContent =
        "Could not load the Opera House garden. Check that the .glb is in public/assets.";
      status.style.color = "#e2d8ca";
      gardenPromise = null;
      throw err;
    });
  return gardenPromise;
}

function showOpener() {
  window.clearTimeout(walkthroughTimer);
  walkthroughTimer = 0;
  hideStoryLayers();
  mapEpoch += 1;
  opener?.show?.();
  setAppMode("opener");
  mapApi?.setActive?.(false);
  gardenApi?.setBackgroundMode?.(true);
  ambience.hide();
  hideMapUi();
  brand?.classList.add("chrome-hidden");
}

async function ensureMap() {
  if (mapApi) {
    mapApi.setActive?.(true);
    return mapApi;
  }
  if (mapPromise) return mapPromise;
  const epoch = mapEpoch;
  mapPromise = createSydneyMap(canvas, ui, {
    onEnterPlace: (id) => {
      if (id === "opera-house") enterOperaGarden();
    },
  })
    .then((api) => {
      if (epoch !== mapEpoch || (appMode !== "map" && appMode !== "opener")) {
        api.dispose?.();
        throw new Error("Map load cancelled");
      }
      mapApi = api;
      ui.onMapEnterClick?.(() => {
        if (appMode === "map") enterOperaGarden();
      });
      return api;
    })
    .catch((err) => {
      if (epoch !== mapEpoch) {
        mapPromise = null;
        return null;
      }
      mapPromise = null;
      console.error(err);
      throw err;
    });
  return mapPromise;
}

/**
 * @param {{ startWalkthrough?: boolean }} [opts]
 *   true  — always launch tour after map is ready (Enter Experience)
 *   false — never auto-launch (e.g. when showHowItWorks already will)
 *   omit  — first-time only
 */
async function enterMap(opts = {}) {
  window.clearTimeout(walkthroughTimer);
  walkthroughTimer = 0;
  opener?.hide?.();
  hideStoryLayers({ keepWalkthrough: false });
  ui.hideMemory({ immediate: true });

  // Invalidate any in-flight garden so it can't steal the canvas / hide chrome
  gardenEpoch += 1;
  gardenApi?.dispose?.();
  gardenApi = null;
  gardenPromise = null;

  setAppMode("map");
  revealMapUi();
  ambience.start();

  try {
    const api = await ensureMap();
    if (!api || appMode !== "map") return;
    revealMapUi();

    const forceTour = opts.startWalkthrough === true;
    const autoTour =
      opts.startWalkthrough === undefined && !hasCompletedWalkthrough();
    if (forceTour || autoTour) {
      walkthroughTimer = window.setTimeout(() => {
        walkthroughTimer = 0;
        if (appMode === "map" && !howItWorks?.isVisible?.()) {
          showHowItWorks({ from: "map" });
        }
      }, 450);
    }
  } catch {
    if (appMode === "map") showOpener();
  }
}

async function enterOperaGarden() {
  window.clearTimeout(walkthroughTimer);
  walkthroughTimer = 0;
  opener?.hide?.();
  const tourActive = howItWorks?.isVisible?.();
  hideStoryLayers({ keepWalkthrough: tourActive });

  mapEpoch += 1;
  mapApi?.setActive?.(false);
  mapApi?.dispose?.();
  mapApi = null;
  mapPromise = null;

  ui.hideMapHover?.();
  setAppMode("garden");
  hideMapUi();
  ambience.start();
  try {
    const garden = await ensureGarden();
    if (!garden || (appMode !== "garden" && appMode !== "memorySheet")) return;
    gardenApi?.setBackgroundMode?.(false);
    if (tourActive) {
      howItWorks.notifyEnteredGarden?.();
    }
  } catch {
    await enterMap();
  }
}

function returnToGarden() {
  hideStoryLayers();
  setAppMode("garden");
  mapApi?.setActive?.(false);
  gardenApi?.setBackgroundMode?.(false);
  ui.fadeChromeIn(0.45);
  ambience.show();
  syncDock();
  syncEmotionFilters();
}

function showHowItWorks(opts = {}) {
  ui.hideMemory({ immediate: true });
  makePass?.hide?.();
  locations?.hide?.();

  const from =
    opts.from ||
    (appMode === "garden" || appMode === "memorySheet" ? "garden" : "map");

  const run = async () => {
    try {
      if (from === "map" || from === "start") {
        if (appMode !== "map") {
          await enterMap({ startWalkthrough: false });
        }
        if (appMode !== "map") return;
        revealMapUi();
        await howItWorks.show({ from: "map" });
        return;
      }
      if (appMode !== "garden" && appMode !== "memorySheet") {
        await enterOperaGarden();
      }
      gardenApi?.setBackgroundMode?.(false);
      await howItWorks.show({ from: "garden" });
    } catch (err) {
      console.error("Walkthrough failed to open:", err);
    }
  };

  return run();
}

function openMemoryPass(opts = {}) {
  ui.hideMemory({ immediate: true });
  howItWorks?.hide?.();
  locations?.hide?.();
  setAppMode("makePass");
  gardenApi?.setBackgroundMode?.(true);
  makePass?.open(opts);
}

function boot() {
  opener = createOpener({
    mount: shellMount || app,
    onEnter: () => enterMap({ startWalkthrough: true }),
  });

  howItWorks = createHowItWorks({
    mount: app,
    onNeedMap: async () => {
      if (appMode !== "map") await enterMap({ startWalkthrough: false });
    },
    getOperaAnchor: () => mapApi?.getOperaAnchor?.() ?? null,
    onFinish: () => {
      howItWorks.hide();
    },
  });

  makePass = createMakePass({
    mount: shellMount || app,
    onBackToMap: () => enterMap({ startWalkthrough: false }),
    onClose: () => {
      if (appMode === "makePass") setAppMode("map");
    },
  });

  locations = createLocations({
    mount: shellMount || app,
    overlay: true,
    getMemoryCount: () =>
      gardenApi?.getMemoryCount?.() ?? liveMemories.length,
    onOpenGarden: () => returnToGarden(),
    onEditPass: () => openMemoryPass({ mode: "edit" }),
  });

  btnLeave?.addEventListener("click", () => {
    if (appMode !== "garden" && appMode !== "memorySheet") return;
    if (!hasPass()) {
      openMemoryPass({ forceCreate: true });
      return;
    }
    leaveApp?.open?.();
  });
  btnHow?.addEventListener("click", () => showHowItWorks());
  btnMapWalkthrough?.addEventListener("click", () =>
    showHowItWorks({ from: "map" })
  );
  btnPass?.addEventListener("click", () => openMemoryPass());
  document.querySelector("#btn-map-pass")?.addEventListener("click", () =>
    openMemoryPass()
  );
  btnSaved?.addEventListener("click", () => {
    if (savedPanel && !savedPanel.hidden) hideSavedPanel();
    else showSavedPanel();
  });
  btnSavedClose?.addEventListener("click", () => hideSavedPanel());
  btnSaveMemory?.addEventListener("click", () => {
    if (!openMemory?.id) return;
    const { ok } = toggleBookmark(openMemory);
    if (!ok) return;
    syncSaveButton();
    if (savedPanel && !savedPanel.hidden) renderSavedList();
  });
  btnAppBack?.addEventListener("click", () => handleAppBack());
  mapHover?.addEventListener("click", (e) => {
    e.stopPropagation();
    mapEnterHandler?.();
  });
  mapHover?.addEventListener("pointerleave", (e) => {
    if (e.relatedTarget === canvas) return;
    hideMapEnter();
  });
  memoryScrim?.addEventListener("click", () => memoryDismiss?.click());

  emotionFilterSelect?.addEventListener("change", () => {
    const value = emotionFilterSelect.value || "All";
    gardenApi?.setEmotionFilter?.(value);
  });

  setAppMode("opener");
}

boot();
