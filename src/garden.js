import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  sampleMeshSurface,
  pickMemorySites,
  computeRegionCenters,
  LAYER,
} from "./sampleMesh.js";
import { memories, RELATIONSHIP_LABELS } from "./memories.js";
import {
  createParticleMaterial,
  createSoftDiscTexture,
} from "./particleMaterial.js";
import {
  INTRO,
  fillDispersedStarts,
  mixPositions,
  runIntro,
} from "./intro.js";
import {
  createSeaField,
  applySeaHover,
  integrateSea,
  resetSeaColors,
  seaRadiusToScreenEdge,
  SEA,
} from "./sea.js";
import { createMemoryMarker, projectToCanvas } from "./memoryMarker.js";
import { emotionMatchesFilter, normalizeEmotion } from "./emotions.js";
import { getAura } from "./pass/auras.js";

/** Perf target for sails + podium (ground filtered out). */
const STRUCTURE_TARGET = 45000;

/** Soft wide wash around the brush. */
const GLOW_RADIUS = 7.2;
/** Brighter core inside the mist hand. */
const INNER_GLOW_RADIUS = 3.1;
/** Fluid wake — slow lift + soft curl, then settle. */
const SCATTER_RADIUS = 4.6;
const STRUCTURE_SCATTER = 0.038;
const MEMORY_SCATTER = 0.042;
const STRUCTURE_GLOW = 0.42;
const STRUCTURE_INNER_GLOW = 0.7;
const MEMORY_GLOW = 0.55;
/** Soft spring — mist drifts home slowly. */
const SPRING = 0.016;
const DAMPING = 0.955;
const PICK_THRESHOLD = 0.55;
const HOVER_THRESHOLD = 0.72;
const SWAY_AMP_STRUCTURE = 0.095;
const SWAY_AMP_HOTSPOT = 0.11;
const PULSE_RADIUS = 1.45;
const PULSE_DURATION = 0.7;
/** Local enlarge / glow around hovered or selected memory. */
const FOCUS_RADIUS = 1.7;
const FOCUS_SIZE_BOOST = 0.95;
const FOCUS_GLOW = 0.58;
/** Ambient living breath around each memory (readable at a glance). */
const BREATH_RADIUS = 1.55;
const BREATH_NEIGHBOR_CAP = 110;
/** Size stays subtle; glow does the breathing. */
const BREATH_FIELD_SIZE = 0.12;
const BREATH_FIELD_GLOW = 0.72;
/** Emotion filter: structure near matching memories stays lit; rest at half opacity. */
const FILTER_AURA_RADIUS = 2.15;
const FILTER_STRUCTURE_OPACITY = 0.5;
const FILTER_STRUCTURE_SIZE = 0.72;
const HOTSPOT_BASE_SIZE = 1.75;
const HOTSPOT_BREATH_SIZE = 0.22;
const HOTSPOT_BREATH_GLOW = 0.78;

function softFalloffStatic(d, radius) {
  const x = 1 - d / radius;
  if (x <= 0) return 0;
  const s = x * x * (3 - 2 * x);
  return s * s;
}

/**
 * STILL HERE on pure black — building only: sails + podium.
 * Harbour water is a separate particle field.
 */
const PART_COLORS = {
  sails: new THREE.Color(0xffd89a), // soft gold — main structure only
};

const LAYER_SIZE = {
  [LAYER.PODIUM]: 0.92,
  [LAYER.SAILS]: 1.62,
};

const DEBUG_MESH_HUES = [
  0xff4466, 0x44dd88, 0x4488ff, 0xffcc33, 0xcc66ff, 0x33ccee, 0xff8844, 0xaadd22,
];

const STRUCTURE_GLOW_COLOR = new THREE.Color(0xffe4b0);
const HOTSPOT_BASE = new THREE.Color(0xf0d4a8);
const HOTSPOT_WARM = new THREE.Color(0xffd89a);
const MEMORY_GLOW_COLOR = new THREE.Color(0xffefd0);
const MEMORY_SELECT = new THREE.Color(0xffffff);

function debugPartsEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("debugParts");
}

export async function createGarden(canvas, ui, options = {}) {
  const liveMemories = [...(options.memories || memories)];
  let hotspotCount = liveMemories.length;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  // Keep fog off — black void; particles carry the place.

  const camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 10;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.rotateSpeed = 0.5;
  controls.enabled = false;

  const gltf = await new GLTFLoader().loadAsync(
    "/assets/sydney_opera_house.glb"
  );
  const model = gltf.scene;

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 20 / maxDim;
  model.position.sub(center);
  model.scale.setScalar(scale);
  model.updateWorldMatrix(true, true);

  const rawSample = sampleMeshSurface(model, Math.floor(STRUCTURE_TARGET * 1.55), {
    sailBias: 2.9,
    groundWeight: 0.06,
  });
  const packed = packBuildingOnly(rawSample, STRUCTURE_TARGET);
  const structureCount = packed.count;
  const structureRest = packed.positions;
  const structureLayers = packed.layers;
  const structureMeshIndices = packed.meshIndices;
  const debugParts = debugPartsEnabled();

  let hotspotRest = pickMemorySites(structureRest, hotspotCount);
  const regionCenters = computeRegionCenters(structureRest);
  // One memory per hotspot, in memories order (stable pick targets)
  let memoryIds = liveMemories.map((m) => m.id);
  // Spread across the sails with region bias — avoid stacked picks
  placeHotspotsSpread(hotspotRest, structureRest, liveMemories, regionCenters);
  let memoryById = Object.fromEntries(liveMemories.map((m) => [m.id, m]));

  const softDisc = createSoftDiscTexture();

  // —— Structure (sails only; white base is the sea field) ——
  const structureStart = new Float32Array(structureRest.length);
  fillDispersedStarts(structureRest, structureStart, INTRO.disperseRadius);
  const structurePositions = new Float32Array(structureStart);
  const structureVelocities = new Float32Array(structureCount * 3);
  const structureColors = new Float32Array(structureCount * 3);
  const structureBaseColors = new Float32Array(structureCount * 3);
  const structureSeeds = new Float32Array(structureCount);
  const structureSizes = new Float32Array(structureCount);
  const structureLayerAttr = new Float32Array(structureCount);

  const tmpLayerColor = new THREE.Color();
  for (let i = 0; i < structureCount; i++) {
    const layer = structureLayers[i];
    structureLayerAttr[i] = layer;

    if (debugParts) {
      tmpLayerColor.setHex(
        DEBUG_MESH_HUES[structureMeshIndices[i] % DEBUG_MESH_HUES.length]
      );
    } else {
      tmpLayerColor.copy(PART_COLORS.sails);
    }

    // Quiet per-particle luminance noise (±6–9%)
    const shade = 0.92 + (Math.random() - 0.5) * 0.14;
    structureBaseColors[i * 3] = tmpLayerColor.r * shade;
    structureBaseColors[i * 3 + 1] = tmpLayerColor.g * shade;
    structureBaseColors[i * 3 + 2] = tmpLayerColor.b * shade;
    structureColors[i * 3] = structureBaseColors[i * 3];
    structureColors[i * 3 + 1] = structureBaseColors[i * 3 + 1];
    structureColors[i * 3 + 2] = structureBaseColors[i * 3 + 2];
    structureSeeds[i] = Math.random();
    const sizeBase = LAYER_SIZE[LAYER.SAILS];
    structureSizes[i] = sizeBase * (0.92 + Math.random() * 0.22);
  }
  const structureBaseSizes = new Float32Array(structureSizes);
  /** Per-particle multipliers from emotion filter (1 = full; 0.5 opacity elsewhere). */
  const structureFilterOpacity = new Float32Array(structureCount);
  const structureFilterSize = new Float32Array(structureCount);
  const structureOpacities = new Float32Array(structureCount);
  structureFilterOpacity.fill(1);
  structureFilterSize.fill(1);
  structureOpacities.fill(1);

  const structureGeo = new THREE.BufferGeometry();
  structureGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(structurePositions, 3)
  );
  structureGeo.setAttribute(
    "color",
    new THREE.BufferAttribute(structureColors, 3)
  );
  structureGeo.setAttribute("aSeed", new THREE.BufferAttribute(structureSeeds, 1));
  structureGeo.setAttribute("aSize", new THREE.BufferAttribute(structureSizes, 1));
  structureGeo.setAttribute(
    "aOpacity",
    new THREE.BufferAttribute(structureOpacities, 1)
  );
  structureGeo.setAttribute(
    "aLayer",
    new THREE.BufferAttribute(structureLayerAttr, 1)
  );
  structureGeo.computeBoundingSphere();

  const structureMat = createParticleMaterial({
    map: softDisc,
    pointSize: 0.095,
    swayAmp: SWAY_AMP_STRUCTURE,
    opacity: 0.97,
    additive: false,
    breathAmp: 0.07,
    breathSpeed: 0.68,
    softEdge: 0.62,
  });
  // Sails read sharper via LAYER_SIZE + colour; sea stays softer / smaller
  const structurePoints = new THREE.Points(structureGeo, structureMat);
  scene.add(structurePoints);

  // Soft golden ghost — sails shells only (no flat podium grid from the GLB)
  const GHOST_OPACITY = 0.04;
  const sailYs = [];
  for (let i = 0; i < structureCount; i++) {
    if (structureLayers[i] === LAYER.SAILS) {
      sailYs.push(structureRest[i * 3 + 1]);
    }
  }
  sailYs.sort((a, b) => a - b);
  const sailFloor =
    sailYs.length > 0
      ? sailYs[Math.floor(sailYs.length * 0.12)]
      : (() => {
          let minY = Infinity;
          for (let i = 1; i < structureRest.length; i += 3) {
            minY = Math.min(minY, structureRest[i]);
          }
          return Number.isFinite(minY) ? minY : 0;
        })();

  const ghostMats = [];
  const ghost = model.clone(true);
  ghost.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.raycast = () => {};
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: PART_COLORS.sails.clone() },
        uOpacity: { value: 0 },
        uSailFloor: { value: sailFloor },
      },
      vertexShader: /* glsl */ `
        varying float vWorldY;
        varying float vNy;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldY = world.y;
          vNy = normalize(mat3(modelMatrix) * normal).y;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uSailFloor;
        varying float vWorldY;
        varying float vNy;
        void main() {
          // Sails only — elevated + tilted shells; kill flat decks / grid slabs
          float steep = 1.0 - abs(vNy);
          if (vWorldY < uSailFloor - 0.2) discard;
          if (steep < 0.16) discard;
          if (vNy > 0.82) discard;
          gl_FragColor = vec4(uColor, uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    obj.material = mat;
    obj.renderOrder = -2;
    ghostMats.push(mat);
  });
  scene.add(ghost);

  function setGhostOpacity(amount) {
    const a = Math.max(0, Math.min(1, amount)) * GHOST_OPACITY;
    for (const m of ghostMats) m.uniforms.uOpacity.value = a;
  }

  const fitBoxEarly = new THREE.Box3().setFromBufferAttribute(
    new THREE.BufferAttribute(structureRest, 3)
  );
  const fitBox = fitBoxEarly;
  const fitSize = fitBox.getSize(new THREE.Vector3());
  const fitCenter = fitBox.getCenter(new THREE.Vector3());
  controls.target.copy(fitCenter);
  const endCameraPos = new THREE.Vector3(
    fitCenter.x + fitSize.x * 0.75,
    fitCenter.y + Math.max(fitSize.y * 0.85, 6.5),
    fitCenter.z + Math.max(fitSize.x, fitSize.z) * 1.2
  );

  // Size harbour so water reaches past the screen corners (and orbit extremes)
  const seaY = fitBox.min.y + SEA.yOffset;
  camera.position.copy(endCameraPos);
  camera.lookAt(fitCenter);
  camera.updateMatrixWorld(true);
  const seaOuterR = seaRadiusToScreenEdge({
    camera,
    center: fitCenter,
    seaY,
    maxDistance: controls.maxDistance,
    bleed: 1.18,
  });
  const sea = createSeaField(fitBoxEarly, softDisc, { outerRadius: seaOuterR });
  const seaStart = new Float32Array(sea.rest.length);
  fillDispersedStarts(sea.rest, seaStart, INTRO.disperseRadius * 1.15);
  sea.positions.set(seaStart);
  sea.geo.attributes.position.needsUpdate = true;
  scene.add(sea.points);

  // —— Memory hotspots (one per seeded memory) ——
  const hotspotStart = new Float32Array(hotspotRest.length);
  fillDispersedStarts(hotspotRest, hotspotStart, INTRO.disperseRadius * 0.85);
  let hotspotPositions = new Float32Array(hotspotStart);
  let hotspotVelocities = new Float32Array(hotspotCount * 3);
  let hotspotColors = new Float32Array(hotspotCount * 3);
  let hotspotBaseColors = new Float32Array(hotspotCount * 3);
  let hotspotSeeds = new Float32Array(hotspotCount);
  let hotspotSizes = new Float32Array(hotspotCount);

  let emotionFilter = "All";
  let hotspotMatch = new Uint8Array(hotspotCount);
  hotspotMatch.fill(1);

  function emotionTintFor(memory) {
    const aura = getAura(normalizeEmotion(memory?.emotion) || "");
    if (aura?.hue) return new THREE.Color(aura.hue);
    return HOTSPOT_WARM.clone();
  }

  function refreshHotspotEmotionBases() {
    const tintScratch = new THREE.Color();
    for (let i = 0; i < hotspotCount; i++) {
      const memory = memoryById[memoryIds[i]];
      const tint = emotionTintFor(memory);
      // Blend muted aura into warm gold — readable, not rainbow
      tintScratch.copy(HOTSPOT_WARM).lerp(tint, 0.45);
      hotspotBaseColors[i * 3] = tintScratch.r;
      hotspotBaseColors[i * 3 + 1] = tintScratch.g;
      hotspotBaseColors[i * 3 + 2] = tintScratch.b;
      const matched = emotionMatchesFilter(memory?.emotion, emotionFilter);
      hotspotMatch[i] = matched ? 1 : 0;
      const dim = matched ? 1 : 0.28;
      hotspotColors[i * 3] = tintScratch.r * dim;
      hotspotColors[i * 3 + 1] = tintScratch.g * dim;
      hotspotColors[i * 3 + 2] = tintScratch.b * dim;
      hotspotSizes[i] = HOTSPOT_BASE_SIZE * (matched ? 1 : 0.55);
    }
    if (hotspotGeo?.attributes?.color) {
      hotspotGeo.attributes.color.needsUpdate = true;
      hotspotGeo.attributes.aSize.needsUpdate = true;
    }
    refreshStructureFilter();
  }

  /** Gold near matching memories; rest of structure at half opacity when filtered. */
  function refreshStructureFilter() {
    if (emotionFilter === "All") {
      structureFilterOpacity.fill(1);
      structureFilterSize.fill(1);
      setGhostOpacity(1);
      for (let i = 0; i < structureCount; i++) {
        structureOpacities[i] = 1;
        structureSizes[i] = structureBaseSizes[i];
      }
      if (structureGeo?.attributes?.aOpacity) {
        structureGeo.attributes.aOpacity.needsUpdate = true;
        structureGeo.attributes.aSize.needsUpdate = true;
      }
      return;
    }
    structureFilterOpacity.fill(FILTER_STRUCTURE_OPACITY);
    structureFilterSize.fill(FILTER_STRUCTURE_SIZE);
    const r = FILTER_AURA_RADIUS;
    const r2 = r * r;
    for (let h = 0; h < hotspotCount; h++) {
      if (!hotspotMatch[h]) continue;
      const hx = hotspotRest[h * 3];
      const hy = hotspotRest[h * 3 + 1];
      const hz = hotspotRest[h * 3 + 2];
      for (let i = 0; i < structureCount; i++) {
        const ix = i * 3;
        const dx = structureRest[ix] - hx;
        const dy = structureRest[ix + 1] - hy;
        const dz = structureRest[ix + 2] - hz;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq > r2) continue;
        const w = softFalloffStatic(Math.sqrt(dSq), r);
        structureFilterOpacity[i] = Math.max(
          structureFilterOpacity[i],
          FILTER_STRUCTURE_OPACITY + (1 - FILTER_STRUCTURE_OPACITY) * w
        );
        structureFilterSize[i] = Math.max(
          structureFilterSize[i],
          FILTER_STRUCTURE_SIZE + (1 - FILTER_STRUCTURE_SIZE) * w
        );
      }
    }
    // Ghost shell follows the same half-opacity disabled state
    setGhostOpacity(FILTER_STRUCTURE_OPACITY);
    // Apply immediately (don't wait for the next interaction frame)
    for (let i = 0; i < structureCount; i++) {
      structureOpacities[i] = structureFilterOpacity[i];
      structureSizes[i] = structureBaseSizes[i] * structureFilterSize[i];
    }
    if (structureGeo?.attributes?.aOpacity) {
      structureGeo.attributes.aOpacity.needsUpdate = true;
      structureGeo.attributes.aSize.needsUpdate = true;
    }
  }

  for (let i = 0; i < hotspotCount; i++) {
    hotspotBaseColors[i * 3] = HOTSPOT_WARM.r;
    hotspotBaseColors[i * 3 + 1] = HOTSPOT_WARM.g;
    hotspotBaseColors[i * 3 + 2] = HOTSPOT_WARM.b;
    hotspotColors[i * 3] = HOTSPOT_BASE.r;
    hotspotColors[i * 3 + 1] = HOTSPOT_BASE.g;
    hotspotColors[i * 3 + 2] = HOTSPOT_BASE.b;
    hotspotSeeds[i] = Math.random();
    hotspotSizes[i] = HOTSPOT_BASE_SIZE;
  }

  // Precompute local structure neighbors so breath stays cheap every frame
  const breathR2 = BREATH_RADIUS * BREATH_RADIUS;
  let hotspotNeighbors = new Array(hotspotCount);
  {
    const scored = [];
    for (let h = 0; h < hotspotCount; h++) {
      const hx = hotspotRest[h * 3];
      const hy = hotspotRest[h * 3 + 1];
      const hz = hotspotRest[h * 3 + 2];
      scored.length = 0;
      for (let i = 0; i < structureCount; i++) {
        const ix = i * 3;
        const dx = structureRest[ix] - hx;
        const dy = structureRest[ix + 1] - hy;
        const dz = structureRest[ix + 2] - hz;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq > breathR2) continue;
        scored.push(i, dSq);
      }
      // Keep nearest neighbors only
      const pairs = [];
      for (let k = 0; k < scored.length; k += 2) {
        pairs.push({ i: scored[k], dSq: scored[k + 1] });
      }
      pairs.sort((a, b) => a.dSq - b.dSq);
      const n = Math.min(BREATH_NEIGHBOR_CAP, pairs.length);
      const ids = new Uint32Array(n);
      const falloffs = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        ids[k] = pairs[k].i;
        falloffs[k] = softFalloffStatic(
          Math.sqrt(pairs[k].dSq),
          BREATH_RADIUS
        );
      }
      hotspotNeighbors[h] = { ids, falloffs };
    }
  }

  const hotspotGeo = new THREE.BufferGeometry();
  hotspotGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(hotspotPositions, 3)
  );
  hotspotGeo.setAttribute("color", new THREE.BufferAttribute(hotspotColors, 3));
  hotspotGeo.setAttribute("aSeed", new THREE.BufferAttribute(hotspotSeeds, 1));
  hotspotGeo.setAttribute("aSize", new THREE.BufferAttribute(hotspotSizes, 1));
  let hotspotOpacities = new Float32Array(hotspotCount);
  hotspotOpacities.fill(1);
  hotspotGeo.setAttribute(
    "aOpacity",
    new THREE.BufferAttribute(hotspotOpacities, 1)
  );
  hotspotGeo.computeBoundingSphere();
  refreshHotspotEmotionBases();

  const hotspotMat = createParticleMaterial({
    map: softDisc,
    pointSize: 0.3,
    swayAmp: SWAY_AMP_HOTSPOT,
    opacity: 0.98,
    additive: true,
    breathAmp: 0.22,
    breathSpeed: 0.72,
    softEdge: 0.7,
  });
  const hotspotPoints = new THREE.Points(hotspotGeo, hotspotMat);
  scene.add(hotspotPoints);

  const memoryMarker = createMemoryMarker({ radius: 0.32 });
  scene.add(memoryMarker.group);

  // Soft bloom — luminous mist without a heavy glow stack
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.addPass(new RenderPass(scene, camera));
  // Light bloom on bright cores only — keeps sail gold from washing white
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.18,
    0.55,
    0.88
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const pointer = new THREE.Vector2(9999, 9999);
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: PICK_THRESHOLD };
  const brushHit = new THREE.Vector3();
  const plane = new THREE.Plane();
  const worldPoint = new THREE.Vector3();
  const scatterDir = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const tmpColor = new THREE.Color();

  let selectedIndex = -1;
  let hoveredIndex = -1;
  let focusTitleActive = false;
  let focusTitleKey = "";
  let pointerDown = null;
  let suppressClick = false;
  let sawFirstMemory = false;
  let hasPointer = false;
  let interactionEnabled = false;
  let backgroundOnly = false;
  let suppressPickUntilUp = false;
  let pulseUntil = 0;
  let pulseCenter = new THREE.Vector3();
  const focusWorld = new THREE.Vector3();
  let clock = new THREE.Clock();
  let lookPromptTimer = 0;
  let nudgeLeaveTimer = 0;
  let pendingFocusId = null;

  ui.setChromeVisible?.(false);

  const intro = runIntro({
    camera,
    controls,
    fitCenter,
    endCameraPos,
    canvas,
    onProgress(u) {
      mixPositions(structureStart, structureRest, structurePositions, u);
      mixPositions(hotspotStart, hotspotRest, hotspotPositions, u);
      mixPositions(seaStart, sea.rest, sea.positions, u);
      structureGeo.attributes.position.needsUpdate = true;
      hotspotGeo.attributes.position.needsUpdate = true;
      sea.geo.attributes.position.needsUpdate = true;
      structureMat.uniforms.uOpacity.value = 0.35 + u * 0.61;
      hotspotMat.uniforms.uOpacity.value = 0.2 + u * 0.75;
      sea.mat.uniforms.uOpacity.value = 0.15 + u * 0.63;
      setGhostOpacity(u);
    },
    onChromeFade(duration) {
      ui.fadeChromeIn?.(duration);
    },
    onComplete({ skipped }) {
      mixPositions(structureStart, structureRest, structurePositions, 1);
      mixPositions(hotspotStart, hotspotRest, hotspotPositions, 1);
      mixPositions(seaStart, sea.rest, sea.positions, 1);
      structureGeo.attributes.position.needsUpdate = true;
      hotspotGeo.attributes.position.needsUpdate = true;
      sea.geo.attributes.position.needsUpdate = true;
      structureMat.uniforms.uOpacity.value = 0.96;
      hotspotMat.uniforms.uOpacity.value = 0.95;
      sea.mat.uniforms.uOpacity.value = 0.78;
      setGhostOpacity(1);
      structureVelocities.fill(0);
      hotspotVelocities.fill(0);
      sea.velocities.fill(0);
      interactionEnabled = true;
      if (skipped) suppressPickUntilUp = true;
      ui.fadeChromeIn?.(0.35);
      if (pendingFocusId) {
        const id = pendingFocusId;
        pendingFocusId = null;
        focusMemoryById(id);
      }
    },
  });

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    hasPointer = true;

    if (pointerDown) {
      const dx = event.clientX - pointerDown.x;
      const dy = event.clientY - pointerDown.y;
      if (dx * dx + dy * dy > 36) suppressClick = true;
    }
  }

  function onPointerLeave() {
    pointer.set(9999, 9999);
    hasPointer = false;
    pointerDown = null;
    hoveredIndex = -1;
  }

  function activeFocusIndex() {
    return selectedIndex >= 0 ? selectedIndex : hoveredIndex;
  }

  function updateHotspotHover() {
    if (!interactionEnabled || !hasPointer || pointer.x > 2) {
      hoveredIndex = -1;
      return;
    }
    raycaster.setFromCamera(pointer, camera);
    raycaster.params.Points = { threshold: HOVER_THRESHOLD };
    const hits = raycaster.intersectObject(hotspotPoints, false);
    const hit = hits.find((h) => hotspotMatch[h.index]);
    hoveredIndex = hit ? hit.index : -1;
    raycaster.params.Points = { threshold: PICK_THRESHOLD };
  }

  function syncFocusMarker() {
    const idx = activeFocusIndex();
    if (idx < 0) {
      memoryMarker.hide();
      if (focusTitleActive) {
        ui.hideFocusTitle?.();
        focusTitleActive = false;
        focusTitleKey = "";
      }
      return;
    }

    const ix = idx * 3;
    // Pin to rest site so title/ring stay stable while particles sway
    focusWorld.set(
      hotspotRest[ix],
      hotspotRest[ix + 1],
      hotspotRest[ix + 2]
    );
    memoryMarker.setPosition(focusWorld.x, focusWorld.y, focusWorld.z);
    memoryMarker.lookAtCamera(camera);
    memoryMarker.show();

    const memory = memoryById[memoryIds[idx]];
    const title =
      memory?.title ||
      RELATIONSHIP_LABELS[memory?.relationship] ||
      "Memory";
    if (!focusTitleActive || focusTitleKey !== title) {
      ui.showFocusTitle?.(title);
      focusTitleActive = true;
      focusTitleKey = title;
    }
    const projected = projectToCanvas(focusWorld, camera, canvas);
    ui.updateFocusTitlePosition?.(
      projected.x,
      projected.y,
      projected.visible
    );
  }

  function applyFocusAura() {
    const idx = activeFocusIndex();
    if (idx < 0) return;

    focusWorld.set(
      hotspotRest[idx * 3],
      hotspotRest[idx * 3 + 1],
      hotspotRest[idx * 3 + 2]
    );
    const fr2 = FOCUS_RADIUS * FOCUS_RADIUS;

    for (let i = 0; i < structureCount; i++) {
      const ix = i * 3;
      worldPoint.set(
        structureRest[ix],
        structureRest[ix + 1],
        structureRest[ix + 2]
      );
      const dSq = worldPoint.distanceToSquared(focusWorld);
      if (dSq > fr2) continue;
      const d = Math.sqrt(dSq);
      const falloff = softFalloff(d, FOCUS_RADIUS);
      const sizeMul = structureFilterSize[i];
      structureSizes[i] =
        structureBaseSizes[i] * sizeMul * (1 + falloff * FOCUS_SIZE_BOOST);
      tmpColor.setRGB(
        structureColors[ix],
        structureColors[ix + 1],
        structureColors[ix + 2]
      );
      tmpColor.lerp(STRUCTURE_GLOW_COLOR, falloff * FOCUS_GLOW);
      structureColors[ix] = tmpColor.r;
      structureColors[ix + 1] = tmpColor.g;
      structureColors[ix + 2] = tmpColor.b;
    }

    const hix = idx * 3;
    if (idx === selectedIndex) {
      hotspotColors[hix] = MEMORY_SELECT.r;
      hotspotColors[hix + 1] = MEMORY_SELECT.g;
      hotspotColors[hix + 2] = MEMORY_SELECT.b;
      hotspotSizes[idx] = 2.2;
    } else {
      tmpColor.setRGB(
        hotspotBaseColors[hix],
        hotspotBaseColors[hix + 1],
        hotspotBaseColors[hix + 2]
      );
      tmpColor.lerp(MEMORY_GLOW_COLOR, 0.55);
      hotspotColors[hix] = tmpColor.r;
      hotspotColors[hix + 1] = tmpColor.g;
      hotspotColors[hix + 2] = tmpColor.b;
      hotspotSizes[idx] = 1.95;
    }
  }

  function onPointerDown(event) {
    if (!interactionEnabled || backgroundOnly) return;
    pointerDown = { x: event.clientX, y: event.clientY };
    suppressClick = false;
    onPointerMove(event);
  }

  function onPointerUp(event) {
    if (!interactionEnabled || backgroundOnly) return;
    onPointerMove(event);
    if (suppressPickUntilUp) {
      suppressPickUntilUp = false;
      pointerDown = null;
      return;
    }
    if (!suppressClick) pickMemory();
    pointerDown = null;
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointercancel", onPointerLeave);

  function updateBrushPlane() {
    raycaster.setFromCamera(pointer, camera);
    // Horizontal plane through the place — sails, podium, and sea share one XZ footprint
    plane.set(new THREE.Vector3(0, 1, 0), -controls.target.y);
    return raycaster.ray.intersectPlane(plane, brushHit);
  }

  function softFalloff(d, radius) {
    return softFalloffStatic(d, radius);
  }

  /** Ambient living breath — glow fades out and returns; size barely moves. */
  function applyMemoryBreath(now) {
    for (let h = 0; h < hotspotCount; h++) {
      const seed = hotspotSeeds[h];
      const rate = 0.65 + seed * 0.45;
      const phase = seed * Math.PI * 2;
      // Soft organic inhale 0..1
      let breath = Math.sin(now * rate + phase);
      breath =
        breath * 0.75 + Math.sin(now * rate * 0.5 + phase * 1.15) * 0.25;
      const inhale = breath * 0.5 + 0.5;
      // Ease so exhale goes near-dark before brightening again
      const glowAmount = inhale * inhale * (3 - 2 * inhale);

      if (h !== selectedIndex) {
        const ix = h * 3;
        const matchScale = hotspotMatch[h] ? 1 : 0.55;
        const matchDim = hotspotMatch[h] ? 1 : 0.32;
        hotspotSizes[h] =
          HOTSPOT_BASE_SIZE *
          matchScale *
          (1 + glowAmount * HOTSPOT_BREATH_SIZE * (hotspotMatch[h] ? 1 : 0.25));
        // Dim base on exhale → warm glow on inhale
        const dim = (0.55 + glowAmount * 0.35) * matchDim;
        tmpColor.setRGB(
          hotspotBaseColors[ix] * dim,
          hotspotBaseColors[ix + 1] * dim,
          hotspotBaseColors[ix + 2] * dim
        );
        if (hotspotMatch[h]) {
          tmpColor.lerp(MEMORY_GLOW_COLOR, glowAmount * HOTSPOT_BREATH_GLOW);
        }
        hotspotColors[ix] = tmpColor.r;
        hotspotColors[ix + 1] = tmpColor.g;
        hotspotColors[ix + 2] = tmpColor.b;
      }

      const neighbors = hotspotNeighbors[h];
      if (!neighbors) continue;
      // Only matching memories light the structure when a filter is on
      if (!hotspotMatch[h]) continue;
      const { ids, falloffs } = neighbors;
      for (let k = 0; k < ids.length; k++) {
        const i = ids[k];
        const spatial = falloffs[k];
        const f = spatial * glowAmount;
        if (f < 0.004) continue;
        const ix = i * 3;
        const sizeMul = structureFilterSize[i];
        const opMul = structureFilterOpacity[i];
        structureSizes[i] = Math.max(
          structureSizes[i],
          structureBaseSizes[i] * sizeMul * (1 + f * BREATH_FIELD_SIZE)
        );
        // Rebuild from base each contribution so glow can fully fade
        tmpColor.setRGB(
          structureBaseColors[ix],
          structureBaseColors[ix + 1],
          structureBaseColors[ix + 2]
        );
        tmpColor.lerp(STRUCTURE_GLOW_COLOR, f * BREATH_FIELD_GLOW * opMul);
        // If multiple memories overlap, keep the brighter breath
        structureColors[ix] = Math.max(structureColors[ix], tmpColor.r);
        structureColors[ix + 1] = Math.max(structureColors[ix + 1], tmpColor.g);
        structureColors[ix + 2] = Math.max(structureColors[ix + 2], tmpColor.b);
      }
    }
  }

  function applyHoverGlowAndScatter() {
    if (!interactionEnabled || backgroundOnly) {
      return;
    }

    updateHotspotHover();

    for (let i = 0; i < structureCount; i++) {
      const ix = i * 3;
      const sizeMul = structureFilterSize[i];
      structureColors[ix] = structureBaseColors[ix];
      structureColors[ix + 1] = structureBaseColors[ix + 1];
      structureColors[ix + 2] = structureBaseColors[ix + 2];
      structureSizes[i] = structureBaseSizes[i] * sizeMul;
      structureOpacities[i] = structureFilterOpacity[i];
    }

    for (let i = 0; i < hotspotCount; i++) {
      if (i === selectedIndex) continue;
      const ix = i * 3;
      const dim = hotspotMatch[i] ? 0.92 : 0.28;
      hotspotColors[ix] = hotspotBaseColors[ix] * dim;
      hotspotColors[ix + 1] = hotspotBaseColors[ix + 1] * dim;
      hotspotColors[ix + 2] = hotspotBaseColors[ix + 2] * dim;
      hotspotSizes[i] = HOTSPOT_BASE_SIZE * (hotspotMatch[i] ? 1 : 0.55);
    }

    resetSeaColors(sea);

    const now = performance.now() / 1000;
    applyMemoryBreath(now);

    const pulsing = now < pulseUntil;
    if (pulsing) {
      const pulseT = 1 - (pulseUntil - now) / PULSE_DURATION;
      const pulseStrength = Math.sin(Math.min(1, pulseT) * Math.PI) * 0.35;
      const pr2 = PULSE_RADIUS * PULSE_RADIUS;
      for (let i = 0; i < structureCount; i++) {
        const ix = i * 3;
        worldPoint.set(
          structurePositions[ix],
          structurePositions[ix + 1],
          structurePositions[ix + 2]
        );
        const dSq = worldPoint.distanceToSquared(pulseCenter);
        if (dSq > pr2) continue;
        const f = softFalloff(Math.sqrt(dSq), PULSE_RADIUS) * pulseStrength;
        tmpColor.setRGB(
          structureBaseColors[ix],
          structureBaseColors[ix + 1],
          structureBaseColors[ix + 2]
        );
        tmpColor.lerp(STRUCTURE_GLOW_COLOR, f * structureFilterOpacity[i]);
        structureColors[ix] = tmpColor.r;
        structureColors[ix + 1] = tmpColor.g;
        structureColors[ix + 2] = tmpColor.b;
      }
    }

    const hasBrush =
      hasPointer && pointer.x <= 2 && updateBrushPlane();

    if (hasBrush) {
      applySeaHover(sea, brushHit, softFalloff, tmpColor);

      const glowR2 = GLOW_RADIUS * GLOW_RADIUS;
      const scatterR2 = SCATTER_RADIUS * SCATTER_RADIUS;

      for (let i = 0; i < structureCount; i++) {
        const ix = i * 3;
        worldPoint.set(
          structurePositions[ix],
          structurePositions[ix + 1],
          structurePositions[ix + 2]
        );
        // Horizontal distance so podium responds like sails under the same cursor
        const dSq =
          (worldPoint.x - brushHit.x) ** 2 + (worldPoint.z - brushHit.z) ** 2;
        if (dSq > glowR2 && dSq > scatterR2) continue;

        const d = Math.sqrt(dSq);
        const dx = structurePositions[ix] - structureRest[ix];
        const dy = structurePositions[ix + 1] - structureRest[ix + 1];
        const dz = structurePositions[ix + 2] - structureRest[ix + 2];
        const displace = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const displaceBoost = Math.min(1, displace * 1.2);

        if (dSq <= glowR2) {
          const falloff = softFalloff(d, GLOW_RADIUS);
          const inner =
            dSq <= INNER_GLOW_RADIUS * INNER_GLOW_RADIUS
              ? softFalloff(d, INNER_GLOW_RADIUS)
              : 0;
          const outerT = Math.min(
            1,
            falloff * STRUCTURE_GLOW * (0.5 + displaceBoost * 0.35)
          );
          const innerT = Math.min(1, inner * STRUCTURE_INNER_GLOW);
          const t = Math.max(outerT, innerT);
          tmpColor.setRGB(
            structureColors[ix],
            structureColors[ix + 1],
            structureColors[ix + 2]
          );
          tmpColor.lerp(STRUCTURE_GLOW_COLOR, t);
          structureColors[ix] = tmpColor.r;
          structureColors[ix + 1] = tmpColor.g;
          structureColors[ix + 2] = tmpColor.b;
          if (innerT > 0.02) {
            structureSizes[i] =
              structureBaseSizes[i] *
              structureFilterSize[i] *
              (1 + innerT * 0.4);
          }
        }

        if (dSq <= scatterR2 && dSq > 1e-6) {
          const falloff = softFalloff(d, SCATTER_RADIUS);
          // Slow hand through mist — soft part, gentle lift, quiet curl
          scatterDir.set(
            worldPoint.x - brushHit.x,
            0,
            worldPoint.z - brushHit.z
          ).normalize();
          tangent.set(-scatterDir.z, 0, scatterDir.x);
          const seed = structureSeeds[i];
          const swirl =
            Math.sin(now * 0.7 + seed * 9.0) * 0.22 +
            Math.sin(now * 0.35 + seed * 4.2) * 0.1;
          const lift = 0.28 + seed * 0.14;
          const radial = 0.26 + seed * 0.1;
          const force = falloff * STRUCTURE_SCATTER;
          structureVelocities[ix] +=
            (scatterDir.x * radial + tangent.x * swirl) * force;
          structureVelocities[ix + 1] += lift * force;
          structureVelocities[ix + 2] +=
            (scatterDir.z * radial + tangent.z * swirl) * force;
        }
      }

      for (let i = 0; i < hotspotCount; i++) {
        const ix = i * 3;
        worldPoint.set(
          hotspotPositions[ix],
          hotspotPositions[ix + 1],
          hotspotPositions[ix + 2]
        );
        const dSq =
          (worldPoint.x - brushHit.x) ** 2 + (worldPoint.z - brushHit.z) ** 2;
        const d = Math.sqrt(dSq);

        if (dSq <= glowR2 && i !== selectedIndex) {
          const falloff = softFalloff(d, GLOW_RADIUS);
          const t = falloff * MEMORY_GLOW;
          tmpColor.setRGB(
            hotspotBaseColors[ix],
            hotspotBaseColors[ix + 1],
            hotspotBaseColors[ix + 2]
          );
          tmpColor.lerp(MEMORY_GLOW_COLOR, t);
          hotspotColors[ix] = tmpColor.r;
          hotspotColors[ix + 1] = tmpColor.g;
          hotspotColors[ix + 2] = tmpColor.b;
          hotspotSizes[i] = hotspotSizes[i] + t * 0.22;
        }

        if (dSq <= scatterR2 && dSq > 1e-6 && i !== selectedIndex) {
          const falloff = softFalloff(d, SCATTER_RADIUS);
          scatterDir.set(
            worldPoint.x - brushHit.x,
            0,
            worldPoint.z - brushHit.z
          ).normalize();
          tangent.set(-scatterDir.z, 0, scatterDir.x);
          const seed = hotspotSeeds[i];
          const swirl = Math.sin(now * 0.75 + seed * 8.0) * 0.2;
          const force = falloff * MEMORY_SCATTER;
          hotspotVelocities[ix] +=
            (scatterDir.x * 0.24 + tangent.x * swirl) * force;
          hotspotVelocities[ix + 1] += (0.22 + seed * 0.12) * force;
          hotspotVelocities[ix + 2] +=
            (scatterDir.z * 0.24 + tangent.z * swirl) * force;
        }
      }
    }

    if (selectedIndex >= 0) {
      const ix = selectedIndex * 3;
      hotspotColors[ix] = MEMORY_SELECT.r;
      hotspotColors[ix + 1] = MEMORY_SELECT.g;
      hotspotColors[ix + 2] = MEMORY_SELECT.b;
      hotspotSizes[selectedIndex] = 2.1;
    }

    applyFocusAura();

    structureGeo.attributes.color.needsUpdate = true;
    structureGeo.attributes.aSize.needsUpdate = true;
    structureGeo.attributes.aOpacity.needsUpdate = true;
    hotspotGeo.attributes.color.needsUpdate = true;
    hotspotGeo.attributes.aSize.needsUpdate = true;
  }

  function integrateStructure() {
    if (!interactionEnabled) return;
    for (let i = 0; i < structureCount; i++) {
      const ix = i * 3;
      const rx = structureRest[ix];
      const ry = structureRest[ix + 1];
      const rz = structureRest[ix + 2];

      structureVelocities[ix] += (rx - structurePositions[ix]) * SPRING;
      structureVelocities[ix + 1] += (ry - structurePositions[ix + 1]) * SPRING;
      structureVelocities[ix + 2] += (rz - structurePositions[ix + 2]) * SPRING;

      structureVelocities[ix] *= DAMPING;
      structureVelocities[ix + 1] *= DAMPING;
      structureVelocities[ix + 2] *= DAMPING;

      structurePositions[ix] += structureVelocities[ix];
      structurePositions[ix + 1] += structureVelocities[ix + 1];
      structurePositions[ix + 2] += structureVelocities[ix + 2];
    }
    structureGeo.attributes.position.needsUpdate = true;
  }

  function integrateHotspots() {
    if (!interactionEnabled) return;
    for (let i = 0; i < hotspotCount; i++) {
      const ix = i * 3;
      const rx = hotspotRest[ix];
      const ry = hotspotRest[ix + 1];
      const rz = hotspotRest[ix + 2];

      hotspotVelocities[ix] += (rx - hotspotPositions[ix]) * SPRING;
      hotspotVelocities[ix + 1] += (ry - hotspotPositions[ix + 1]) * SPRING;
      hotspotVelocities[ix + 2] += (rz - hotspotPositions[ix + 2]) * SPRING;

      hotspotVelocities[ix] *= DAMPING;
      hotspotVelocities[ix + 1] *= DAMPING;
      hotspotVelocities[ix + 2] *= DAMPING;

      if (i === selectedIndex) {
        hotspotPositions[ix] = THREE.MathUtils.lerp(hotspotPositions[ix], rx, 0.45);
        hotspotPositions[ix + 1] = THREE.MathUtils.lerp(
          hotspotPositions[ix + 1],
          ry,
          0.45
        );
        hotspotPositions[ix + 2] = THREE.MathUtils.lerp(
          hotspotPositions[ix + 2],
          rz,
          0.45
        );
        hotspotVelocities[ix] = 0;
        hotspotVelocities[ix + 1] = 0;
        hotspotVelocities[ix + 2] = 0;
        continue;
      }

      hotspotPositions[ix] += hotspotVelocities[ix];
      hotspotPositions[ix + 1] += hotspotVelocities[ix + 1];
      hotspotPositions[ix + 2] += hotspotVelocities[ix + 2];
    }
    hotspotGeo.attributes.position.needsUpdate = true;
  }

  function pickMemory() {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(hotspotPoints, false);
    if (!hits.length) {
      clearSelection();
      return;
    }
    const index = hits.find((h) => hotspotMatch[h.index])?.index;
    if (index == null) {
      clearSelection();
      return;
    }
    selectParticle(index);
  }

  function getMemoryScreenOrigin() {
    if (selectedIndex < 0) return null;
    const ix = selectedIndex * 3;
    focusWorld.set(
      hotspotRest[ix],
      hotspotRest[ix + 1],
      hotspotRest[ix + 2]
    );
    const projected = projectToCanvas(focusWorld, camera, canvas);
    if (!projected.visible) return null;
    return { x: projected.x, y: projected.y };
  }

  function makeRingApi() {
    return {
      setScale(s) {
        memoryMarker.setScale(s);
      },
      setOpacity(o) {
        memoryMarker.setOpacity(o);
      },
      reset() {
        memoryMarker.setScale(1);
        memoryMarker.setOpacity(1);
      },
    };
  }

  function selectParticle(index) {
    if (!interactionEnabled) return;
    if (index < 0 || index >= hotspotCount) return;
    if (!hotspotMatch[index]) return;
    selectedIndex = index;
    const memory = memoryById[memoryIds[index]];
    if (!memory) return;

    pulseCenter.set(
      hotspotRest[index * 3],
      hotspotRest[index * 3 + 1],
      hotspotRest[index * 3 + 2]
    );
    pulseUntil = performance.now() / 1000 + PULSE_DURATION;

    focusWorld.set(
      hotspotRest[index * 3],
      hotspotRest[index * 3 + 1],
      hotspotRest[index * 3 + 2]
    );
    memoryMarker.setPosition(focusWorld.x, focusWorld.y, focusWorld.z);
    memoryMarker.lookAtCamera(camera);
    memoryMarker.setScale(1);
    memoryMarker.setOpacity(1);
    memoryMarker.show();

    const projected = projectToCanvas(focusWorld, camera, canvas);
    const origin = projected.visible
      ? { x: projected.x, y: projected.y }
      : null;

    ui.showMemory({
      id: memory.id,
      relationship: RELATIONSHIP_LABELS[memory.relationship],
      body: memory.body,
      audioDataUrl: memory.audioDataUrl || null,
      title: memory.title,
      emotion: memory.emotion || null,
      place: memory.place || "Opera House",
      origin,
      ring: makeRingApi(),
    });
    ui.hideHint();

    if (!sawFirstMemory) {
      sawFirstMemory = true;
      lookPromptTimer = window.setTimeout(() => ui.showLookPrompt(), 700);
      nudgeLeaveTimer = window.setTimeout(() => ui.nudgeLeaveMemory?.(), 2200);
    }
  }

  function clearSelection({ immediate = false } = {}) {
    if (selectedIndex < 0) {
      ui.hideMemory?.({ immediate: true });
      return;
    }
    const closingIndex = selectedIndex;
    const origin = getMemoryScreenOrigin();
    const ring = makeRingApi();
    if (immediate) {
      selectedIndex = -1;
      ring.reset();
      ui.hideMemory?.({ immediate: true });
      return;
    }
    ui.hideMemory?.({
      origin,
      ring,
      onComplete() {
        if (selectedIndex === closingIndex) {
          selectedIndex = -1;
          ring.reset();
        }
      },
    });
  }

  const onDismiss = () => clearSelection();
  ui.dismissButton?.addEventListener("click", onDismiss);

  function buildNeighborsFor(h) {
    const hx = hotspotRest[h * 3];
    const hy = hotspotRest[h * 3 + 1];
    const hz = hotspotRest[h * 3 + 2];
    const scored = [];
    for (let i = 0; i < structureCount; i++) {
      const ix = i * 3;
      const dx = structureRest[ix] - hx;
      const dy = structureRest[ix + 1] - hy;
      const dz = structureRest[ix + 2] - hz;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq > breathR2) continue;
      scored.push({ i, dSq });
    }
    scored.sort((a, b) => a.dSq - b.dSq);
    const n = Math.min(BREATH_NEIGHBOR_CAP, scored.length);
    const ids = new Uint32Array(n);
    const falloffs = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      ids[k] = scored[k].i;
      falloffs[k] = softFalloffStatic(Math.sqrt(scored[k].dSq), BREATH_RADIUS);
    }
    hotspotNeighbors[h] = { ids, falloffs };
  }

  function growF32(src, add) {
    const next = new Float32Array(src.length + add);
    next.set(src);
    return next;
  }

  function syncHotspotGeometry() {
    hotspotGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(hotspotPositions, 3)
    );
    hotspotGeo.setAttribute(
      "color",
      new THREE.BufferAttribute(hotspotColors, 3)
    );
    hotspotGeo.setAttribute(
      "aSeed",
      new THREE.BufferAttribute(hotspotSeeds, 1)
    );
    hotspotGeo.setAttribute(
      "aSize",
      new THREE.BufferAttribute(hotspotSizes, 1)
    );
    hotspotGeo.setAttribute(
      "aOpacity",
      new THREE.BufferAttribute(hotspotOpacities, 1)
    );
    hotspotGeo.computeBoundingSphere();
  }

  function placeOneByRegion(region, index) {
    const center = regionCenters[region] || regionCenters.forecourt;
    const n = structureRest.length / 3;
    const stride = Math.max(1, Math.floor(n / 1200));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 200))) {
      minX = Math.min(minX, structureRest[i * 3]);
      maxX = Math.max(maxX, structureRest[i * 3]);
      minY = Math.min(minY, structureRest[i * 3 + 1]);
      maxY = Math.max(maxY, structureRest[i * 3 + 1]);
      minZ = Math.min(minZ, structureRest[i * 3 + 2]);
      maxZ = Math.max(maxZ, structureRest[i * 3 + 2]);
    }
    const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const minDist = (diag / Math.sqrt(Math.max(4, hotspotCount + 1))) * 0.72;
    const minDistSq = minDist * minDist;

    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < n; i += stride) {
      const x = structureRest[i * 3];
      const y = structureRest[i * 3 + 1];
      const z = structureRest[i * 3 + 2];
      let nearest = Infinity;
      for (let h = 0; h < hotspotCount; h++) {
        if (h === index) continue;
        const dx = x - hotspotRest[h * 3];
        const dy = y - hotspotRest[h * 3 + 1];
        const dz = z - hotspotRest[h * 3 + 2];
        nearest = Math.min(nearest, dx * dx + dy * dy + dz * dz);
      }
      if (hotspotCount > 0 && nearest < minDistSq * 0.55) continue;
      const cx = x - center.x;
      const cy = y - center.y;
      const cz = z - center.z;
      const toRegion = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const sep = hotspotCount === 0 ? minDist : Math.sqrt(nearest);
      const score = sep * 2.4 - toRegion * 0.4 + Math.random() * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    hotspotRest[index * 3] = structureRest[bestIdx * 3];
    hotspotRest[index * 3 + 1] = structureRest[bestIdx * 3 + 1];
    hotspotRest[index * 3 + 2] = structureRest[bestIdx * 3 + 2];
  }

  function suggestRegion() {
    const keys = ["steps", "sails", "harbour", "forecourt"];
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const aim = camera.position
      .clone()
      .addScaledVector(dir, camera.position.distanceTo(controls.target) * 0.85);
    let best = "forecourt";
    let bestScore = Infinity;
    for (const key of keys) {
      const c = regionCenters[key];
      if (!c) continue;
      const dAim = c.distanceToSquared(aim);
      const dCam =
        (c.x - camera.position.x) ** 2 + (c.z - camera.position.z) ** 2;
      const score = dAim * 0.6 + dCam * 0.4;
      if (score < bestScore) {
        bestScore = score;
        best = key;
      }
    }
    return best;
  }

  function addMemory(memory) {
    const index = hotspotCount;
    liveMemories.push(memory);
    memoryIds.push(memory.id);
    memoryById[memory.id] = memory;

    hotspotRest = growF32(hotspotRest, 3);
    hotspotPositions = growF32(hotspotPositions, 3);
    hotspotVelocities = growF32(hotspotVelocities, 3);
    hotspotColors = growF32(hotspotColors, 3);
    hotspotBaseColors = growF32(hotspotBaseColors, 3);
    hotspotSeeds = growF32(hotspotSeeds, 1);
    hotspotSizes = growF32(hotspotSizes, 1);
    hotspotOpacities = growF32(hotspotOpacities, 1);
    hotspotOpacities[index] = 1;
    const nextMatch = new Uint8Array(hotspotCount + 1);
    nextMatch.set(hotspotMatch);
    nextMatch[hotspotCount] = 1;
    hotspotMatch = nextMatch;
    hotspotCount += 1;

    placeOneByRegion(memory.region || "forecourt", index);
    const ix = index * 3;
    hotspotPositions[ix] = hotspotRest[ix];
    hotspotPositions[ix + 1] = hotspotRest[ix + 1];
    hotspotPositions[ix + 2] = hotspotRest[ix + 2];
    hotspotVelocities[ix] = 0;
    hotspotVelocities[ix + 1] = 0;
    hotspotVelocities[ix + 2] = 0;
    hotspotSeeds[index] = Math.random();
    hotspotNeighbors.length = hotspotCount;
    buildNeighborsFor(index);
    syncHotspotGeometry();
    refreshHotspotEmotionBases();

    pulseCenter.set(
      hotspotRest[ix],
      hotspotRest[ix + 1],
      hotspotRest[ix + 2]
    );
    pulseUntil = performance.now() / 1000 + PULSE_DURATION * 1.4;

    return index;
  }

  function focusMemoryById(id) {
    if (!interactionEnabled) {
      pendingFocusId = id;
      return;
    }
    const index = memoryIds.indexOf(id);
    if (index < 0) return;
    selectParticle(index);
  }

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio, 2);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    composer.setPixelRatio(pr);
    bloomPass.resolution.set(w, h);
    structureMat.uniforms.uPixelRatio.value = pr;
    hotspotMat.uniforms.uPixelRatio.value = pr;
    sea.mat.uniforms.uPixelRatio.value = pr;
    structureMat.uniforms.uHeight.value = h;
    hotspotMat.uniforms.uHeight.value = h;
    sea.mat.uniforms.uHeight.value = h;
  }
  window.addEventListener("resize", onResize);

  let frame = 0;
  function tick() {
    frame = requestAnimationFrame(tick);
    // Slow the field clock while leave screens are open
    const t = backgroundOnly
      ? clock.getElapsedTime() * 0.45
      : clock.getElapsedTime();
    structureMat.uniforms.uTime.value = t;
    hotspotMat.uniforms.uTime.value = t;
    sea.mat.uniforms.uTime.value = t;

    if (interactionEnabled && !backgroundOnly) {
      applyHoverGlowAndScatter();
      integrateStructure();
      integrateHotspots();
      integrateSea(sea, SPRING, DAMPING);
      controls.update();
      syncFocusMarker();
    } else if (interactionEnabled && backgroundOnly) {
      // Particles keep shader breath via uTime; no brush / orbit
    } else {
      controls.target.copy(fitCenter);
    }

    composer.render();
  }
  tick();

  function setBackgroundMode(active) {
    backgroundOnly = Boolean(active);
    if (backgroundOnly) {
      controls.enabled = false;
      clearSelection({ immediate: true });
      hasPointer = false;
      pointer.set(9999, 9999);
      hoveredIndex = -1;
      memoryMarker.hide();
      memoryMarker.setScale(1);
      memoryMarker.setOpacity(1);
      ui.hideFocusTitle?.();
    } else if (interactionEnabled) {
      controls.enabled = true;
    }
  }

  return {
    addMemory,
    suggestRegion,
    focusMemoryById,
    setBackgroundMode,
    setEmotionFilter(next) {
      const value = !next || next === "All" ? "All" : normalizeEmotion(next) || "All";
      emotionFilter = value === "All" ? "All" : value;
      refreshHotspotEmotionBases();
      if (selectedIndex >= 0 && !hotspotMatch[selectedIndex]) {
        clearSelection({ immediate: true });
      }
    },
    getEmotionFilter: () => emotionFilter,
    getMemoryCount: () => hotspotCount,
    dispose() {
      cancelAnimationFrame(frame);
      intro.kill();
      window.clearTimeout(lookPromptTimer);
      window.clearTimeout(nudgeLeaveTimer);
      lookPromptTimer = 0;
      nudgeLeaveTimer = 0;
      pendingFocusId = null;
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointercancel", onPointerLeave);
      ui.dismissButton?.removeEventListener("click", onDismiss);
      controls.dispose();
      structureGeo.dispose();
      structureMat.dispose();
      for (const m of ghostMats) m.dispose();
      hotspotGeo.dispose();
      hotspotMat.dispose();
      sea.geo.dispose();
      sea.mat.dispose();
      softDisc.dispose();
      memoryMarker.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}

/**
 * Spread hotspots across the structure with a minimum gap.
 * Soft bias toward each memory's region — never stack on the same point.
 */
function placeHotspotsSpread(
  hotspotRest,
  structureRest,
  memoriesList,
  centers
) {
  const n = structureRest.length / 3;
  if (n < 1 || memoriesList.length < 1) return;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = structureRest[i * 3];
    const y = structureRest[i * 3 + 1];
    const z = structureRest[i * 3 + 2];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  // Target spacing so ~50 memories cover the sails without overlapping picks
  const minDist = (diag / Math.sqrt(Math.max(4, memoriesList.length))) * 0.72;
  const minDistSq = minDist * minDist;

  const placed = [];
  const stride = Math.max(1, Math.floor(n / 1200));

  // Place region-by-region so each zone fills evenly
  const order = memoriesList.map((_, i) => i);
  order.sort((a, b) => {
    const ra = memoriesList[a].region || "";
    const rb = memoriesList[b].region || "";
    if (ra !== rb) return ra < rb ? -1 : 1;
    return a - b;
  });

  for (const m of order) {
    const region = memoriesList[m].region;
    const center = centers[region] || centers.forecourt || centers.sails;
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < n; i += stride) {
      const x = structureRest[i * 3];
      const y = structureRest[i * 3 + 1];
      const z = structureRest[i * 3 + 2];

      let nearestPlaced = Infinity;
      for (let p = 0; p < placed.length; p++) {
        const dx = x - placed[p].x;
        const dy = y - placed[p].y;
        const dz = z - placed[p].z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < nearestPlaced) nearestPlaced = d2;
      }
      if (placed.length > 0 && nearestPlaced < minDistSq * 0.55) continue;

      const cx = x - center.x;
      const cy = y - center.y;
      const cz = z - center.z;
      const toRegion = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const separation = placed.length === 0 ? minDist : Math.sqrt(nearestPlaced);
      // Separation first, then soft region pull
      const score =
        separation * 2.4 - toRegion * 0.4 + Math.random() * minDist * 0.15;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    // If nothing cleared the gap, take the farthest from all placed
    if (placed.length > 0 && bestScore < 0) {
      let farIdx = 0;
      let farMin = -1;
      for (let i = 0; i < n; i += stride) {
        const x = structureRest[i * 3];
        const y = structureRest[i * 3 + 1];
        const z = structureRest[i * 3 + 2];
        let nearest = Infinity;
        for (let p = 0; p < placed.length; p++) {
          const dx = x - placed[p].x;
          const dy = y - placed[p].y;
          const dz = z - placed[p].z;
          nearest = Math.min(nearest, dx * dx + dy * dy + dz * dz);
        }
        if (nearest > farMin) {
          farMin = nearest;
          farIdx = i;
        }
      }
      bestIdx = farIdx;
    }

    const x = structureRest[bestIdx * 3];
    const y = structureRest[bestIdx * 3 + 1];
    const z = structureRest[bestIdx * 3 + 2];
    placed.push({ x, y, z });
    hotspotRest[m * 3] = x;
    hotspotRest[m * 3 + 1] = y;
    hotspotRest[m * 3 + 2] = z;
  }
}

/**
 * Keep only sail particles — white harbour base is the continuous sea field.
 */
function packBuildingOnly(sample, maxCount) {
  const sails = [];
  for (let i = 0; i < sample.layers.length; i++) {
    if (sample.layers[i] === LAYER.SAILS) sails.push(i);
  }

  const keep = [];
  const sailBudget = Math.min(sails.length, maxCount);
  for (let i = 0; i < sailBudget; i++) keep.push(sails[i]);

  const count = keep.length;
  const positions = new Float32Array(count * 3);
  const layers = new Uint8Array(count);
  const meshIndices = new Uint16Array(count);
  for (let k = 0; k < count; k++) {
    const i = keep[k];
    positions[k * 3] = sample.positions[i * 3];
    positions[k * 3 + 1] = sample.positions[i * 3 + 1];
    positions[k * 3 + 2] = sample.positions[i * 3 + 2];
    layers[k] = LAYER.SAILS;
    meshIndices[k] = sample.meshIndices[i];
  }
  return { count, positions, layers, meshIndices };
}
