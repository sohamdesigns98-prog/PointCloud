/**
 * Sydney harbour point-cloud map — Opera House landmark opens the garden.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { sampleMeshSurface, LAYER } from "./sampleMesh.js";
import {
  createParticleMaterial,
  createSoftDiscTexture,
} from "./particleMaterial.js";
import {
  MAP_PLACES,
  MAP_COLORS,
  OPERA_PLACE,
  worldToUnit,
  nearestPlace,
  findCbdPeak,
  operaHouseWorldFromCbd,
} from "./mapPlaces.js";
import { projectToCanvas } from "./memoryMarker.js";

const MAP_POINT_TARGET = 48000;
/** Fit city into a slightly larger world so relief reads better */
const MAP_FIT = 28;
/** Landmark size relative to city span — readable sails beside CBD */
const OH_SPAN_FRAC = 0.105;
/** Garden sail gold + glow — match garden.js PART_COLORS / STRUCTURE_GLOW */
const SAIL_GOLD = 0xffd89a;
const SAIL_GLOW = 0xffe4b0;

/**
 * Sydney harbour point-cloud map — only Opera House landmark is enterable.
 */
export async function createSydneyMap(canvas, ui, { onEnterPlace } = {}) {
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

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    38,
    window.innerWidth / window.innerHeight,
    0.1,
    400
  );

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = true;
  controls.panSpeed = 0.4;
  controls.minDistance = 10;
  controls.maxDistance = 70;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.rotateSpeed = 0.4;
  controls.enableZoom = true;

  const loader = new GLTFLoader();
  const [cityGltf, operaGltf] = await Promise.all([
    loader.loadAsync("/assets/sydney-nsw.glb"),
    loader.loadAsync("/assets/sydney_opera_house.glb"),
  ]);

  const model = cityGltf.scene;
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      m.map = null;
      m.normalMap = null;
      m.emissiveMap = null;
      m.roughnessMap = null;
      m.metalnessMap = null;
      m.needsUpdate = true;
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = MAP_FIT / maxDim;
  model.position.sub(center);
  model.scale.setScalar(scale);
  model.updateWorldMatrix(true, true);

  const sample = sampleMeshSurface(model, MAP_POINT_TARGET, {
    sailBias: 2.6,
    groundWeight: 0.12,
    elevationBias: 2.4,
  });
  const count = sample.positions.length / 3;
  const positions = sample.positions;
  const normals = sample.normals;

  const aabb = new THREE.Box3();
  for (let i = 0; i < count; i++) {
    aabb.expandByPoint(
      new THREE.Vector3(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      )
    );
  }

  // Uniform city grey — no unlock gold tint on the particle field
  const cityColor = new THREE.Color(MAP_COLORS.city);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const y = positions[i * 3 + 1];
    const [, uy] = worldToUnit(
      positions[i * 3],
      y,
      positions[i * 3 + 2],
      aabb
    );
    const ny = Math.abs(normals[i * 3 + 1]);
    const steep = 1 - ny;
    const heightTerm = uy * MAP_COLORS.heightLift;
    const steepTerm = steep * 0.22;
    const shade =
      (0.78 + Math.random() * 0.14 + heightTerm + steepTerm) *
      MAP_COLORS.cityLift;
    colors[i * 3] = Math.min(1, cityColor.r * shade);
    colors[i * 3 + 1] = Math.min(1, cityColor.g * shade);
    colors[i * 3 + 2] = Math.min(1, cityColor.b * shade);
    sizes[i] = 0.85 + Math.random() * 0.35 + uy * 0.55 + steep * 0.25;
    seeds[i] = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  const opacities = new Float32Array(count);
  opacities.fill(1);
  geo.setAttribute("aOpacity", new THREE.BufferAttribute(opacities, 1));
  geo.computeBoundingSphere();

  const softDisc = createSoftDiscTexture();
  const mat = createParticleMaterial({
    map: softDisc,
    pointSize: 0.072,
    swayAmp: 0.028,
    opacity: 0.94,
    additive: false,
    breathAmp: 0.035,
    breathSpeed: 0.5,
    softEdge: 0.52,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  // Soft city silhouette — cool grey (warm ghost read as unlock-gold)
  const GHOST_OPACITY = 0.05;
  const ghostMats = [];
  const ghost = model.clone(true);
  ghost.traverse((obj) => {
    if (obj.isLine || obj.isLineSegments) {
      obj.visible = false;
      return;
    }
    if (!obj.isMesh) return;
    obj.raycast = () => {};
    const gmat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xa8aeb8) },
        uOpacity: { value: GHOST_OPACITY },
      },
      vertexShader: /* glsl */ `
        varying float vNy;
        void main() {
          vNy = normalize(mat3(modelMatrix) * normal).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vNy;
        void main() {
          float steep = 1.0 - abs(vNy);
          float a = uOpacity * (0.55 + steep * 0.75);
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    obj.material = gmat;
    obj.renderOrder = -2;
    ghostMats.push(gmat);
  });
  scene.add(ghost);

  const fitCenter = aabb.getCenter(new THREE.Vector3());
  const fitSize = aabb.getSize(new THREE.Vector3());
  const span = Math.max(fitSize.x, fitSize.z);
  controls.target.copy(fitCenter);
  const cameraPos = new THREE.Vector3(
    fitCenter.x - span * 0.15,
    fitCenter.y + Math.max(fitSize.y * 1.8, span * 0.32),
    fitCenter.z + span * 0.62
  );
  camera.position.copy(cameraPos);
  camera.lookAt(fitCenter);
  camera.updateMatrixWorld(true);
  controls.update();

  const cbd =
    findCbdPeak(positions, aabb) || {
      x: fitCenter.x + span * 0.12,
      y: fitCenter.y + fitSize.y * 0.2,
      z: fitCenter.z - span * 0.05,
      ux: 0.6,
      uz: 0.45,
    };
  const ohWorld = operaHouseWorldFromCbd(
    cbd,
    positions,
    span,
    aabb,
    cameraPos,
    fitCenter
  );

  // —— Opera House landmark: golden sail particles (same language as garden) ——
  const operaRoot = new THREE.Group();
  operaRoot.name = "opera-house-landmark";
  const operaModel = operaGltf.scene;

  operaModel.updateWorldMatrix(true, true);
  const ohBox0 = new THREE.Box3().setFromObject(operaModel);
  const ohSize0 = ohBox0.getSize(new THREE.Vector3());
  const ohMax = Math.max(ohSize0.x, ohSize0.y, ohSize0.z) || 1;
  operaModel.scale.setScalar((span * OH_SPAN_FRAC) / ohMax);
  // Slight Y exaggerate so sails read against the city's flat massing
  operaModel.scale.y *= 1.45;
  operaModel.updateWorldMatrix(true, true);
  const ohBox1 = new THREE.Box3().setFromObject(operaModel);
  const ohCenter1 = ohBox1.getCenter(new THREE.Vector3());
  operaModel.position.x -= ohCenter1.x;
  operaModel.position.y -= ohCenter1.y;
  operaModel.position.z -= ohCenter1.z;
  operaModel.updateWorldMatrix(true, true);

  // Dense sample so map OH reads as fine points, not soft blobs
  const ohSample = sampleMeshSurface(operaModel, 16000, {
    sailBias: 3.6,
    groundWeight: 0.02,
    elevationBias: 3.2,
  });
  const sailIdx = [];
  for (let i = 0; i < ohSample.layers.length; i++) {
    if (ohSample.layers[i] === LAYER.SAILS) sailIdx.push(i);
  }

  // Always re-filter: upper shells + steep faces only (kill podium carpet)
  {
    const pool =
      sailIdx.length >= 180
        ? sailIdx.slice()
        : Array.from({ length: ohSample.positions.length / 3 }, (_, i) => i);
    const ys = pool.map((i) => ohSample.positions[i * 3 + 1]).sort((a, b) => a - b);
    const yFloor = ys[Math.floor(ys.length * 0.42)] ?? ys[0] ?? 0;
    sailIdx.length = 0;
    for (const i of pool) {
      const y = ohSample.positions[i * 3 + 1];
      const ny = Math.abs(ohSample.normals[i * 3 + 1]);
      const steep = 1 - ny;
      if (y < yFloor) continue;
      if (steep < 0.18) continue;
      if (ny > 0.78) continue;
      sailIdx.push(i);
    }
  }

  const keepN = Math.min(
    11000,
    Math.max(2000, sailIdx.length || ohSample.positions.length / 3)
  );
  const lPositions = new Float32Array(keepN * 3);
  const lColors = new Float32Array(keepN * 3);
  const lSizes = new Float32Array(keepN);
  const lSeeds = new Float32Array(keepN);
  // Exact garden sail + glow hexes
  const gold = new THREE.Color(SAIL_GOLD);
  const glowGold = new THREE.Color(SAIL_GLOW);
  const sailPool =
    sailIdx.length > 0
      ? sailIdx
      : Array.from({ length: ohSample.positions.length / 3 }, (_, i) => i);
  for (let k = 0; k < keepN; k++) {
    const i = sailPool[k % sailPool.length];
    lPositions[k * 3] = ohSample.positions[i * 3];
    lPositions[k * 3 + 1] = ohSample.positions[i * 3 + 1];
    lPositions[k * 3 + 2] = ohSample.positions[i * 3 + 2];
    // Same as garden.js structure colouring — base #ffd89a only
    const shade = 0.92 + (Math.random() - 0.5) * 0.14;
    // Sparse highlight tint toward #ffe4b0 (no muddy additive fog)
    const hi = Math.random() < 0.12 ? 0.35 : 0;
    lColors[k * 3] = gold.r * (1 - hi) + glowGold.r * hi;
    lColors[k * 3 + 1] = gold.g * (1 - hi) + glowGold.g * hi;
    lColors[k * 3 + 2] = gold.b * (1 - hi) + glowGold.b * hi;
    lColors[k * 3] *= shade;
    lColors[k * 3 + 1] *= shade;
    lColors[k * 3 + 2] *= shade;
    // Tight sizes — detail over bloom
    lSizes[k] = 0.82 + Math.random() * 0.22;
    lSeeds[k] = Math.random();
  }

  const landmarkGeo = new THREE.BufferGeometry();
  landmarkGeo.setAttribute("position", new THREE.BufferAttribute(lPositions, 3));
  landmarkGeo.setAttribute("color", new THREE.BufferAttribute(lColors, 3));
  landmarkGeo.setAttribute("aSeed", new THREE.BufferAttribute(lSeeds, 1));
  landmarkGeo.setAttribute("aSize", new THREE.BufferAttribute(lSizes, 1));
  const lOpacities = new Float32Array(keepN);
  lOpacities.fill(1);
  landmarkGeo.setAttribute("aOpacity", new THREE.BufferAttribute(lOpacities, 1));
  landmarkGeo.computeBoundingSphere();

  // Sharp #ffd89a cores — small points, hard edges
  const landmarkMat = createParticleMaterial({
    map: softDisc,
    pointSize: 0.042,
    swayAmp: 0.014,
    opacity: 0.98,
    additive: false,
    breathAmp: 0.03,
    breathSpeed: 0.68,
    softEdge: 0.06,
  });
  const landmarkPoints = new THREE.Points(landmarkGeo, landmarkMat);
  landmarkPoints.renderOrder = 4;
  operaRoot.add(landmarkPoints);

  // Thin #ffe4b0 accent — few, small, low opacity (not a glow cloud)
  const glowCount = Math.min(500, Math.floor(keepN * 0.08));
  const gPositions = new Float32Array(glowCount * 3);
  const gColors = new Float32Array(glowCount * 3);
  const gSizes = new Float32Array(glowCount);
  const gSeeds = new Float32Array(glowCount);
  for (let k = 0; k < glowCount; k++) {
    const src = Math.floor(Math.random() * keepN);
    gPositions[k * 3] = lPositions[src * 3];
    gPositions[k * 3 + 1] = lPositions[src * 3 + 1];
    gPositions[k * 3 + 2] = lPositions[src * 3 + 2];
    gColors[k * 3] = glowGold.r;
    gColors[k * 3 + 1] = glowGold.g;
    gColors[k * 3 + 2] = glowGold.b;
    gSizes[k] = 0.95 + Math.random() * 0.25;
    gSeeds[k] = lSeeds[src];
  }
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute("position", new THREE.BufferAttribute(gPositions, 3));
  glowGeo.setAttribute("color", new THREE.BufferAttribute(gColors, 3));
  glowGeo.setAttribute("aSeed", new THREE.BufferAttribute(gSeeds, 1));
  glowGeo.setAttribute("aSize", new THREE.BufferAttribute(gSizes, 1));
  const gOpacities = new Float32Array(glowCount);
  gOpacities.fill(1);
  glowGeo.setAttribute("aOpacity", new THREE.BufferAttribute(gOpacities, 1));
  glowGeo.computeBoundingSphere();

  const glowMat = createParticleMaterial({
    map: softDisc,
    pointSize: 0.048,
    swayAmp: 0.01,
    opacity: 0.22,
    additive: true,
    breathAmp: 0.02,
    breathSpeed: 0.65,
    softEdge: 0.18,
  });
  const glowPoints = new THREE.Points(glowGeo, glowMat);
  glowPoints.renderOrder = 3;
  operaRoot.add(glowPoints);

  // Base attrs for hover pulse restore
  const lColorsBase = new Float32Array(lColors);
  const lSizesBase = new Float32Array(lSizes);
  const colorAttr = landmarkGeo.getAttribute("color");
  const sizeAttr = landmarkGeo.getAttribute("aSize");
  let ohHover = 0;

  // Faint #ffd89a sail shell
  const landmarkMats = [];
  const sailYs = [];
  for (let k = 0; k < keepN; k++) sailYs.push(lPositions[k * 3 + 1]);
  sailYs.sort((a, b) => a - b);
  const sailFloorLocal =
    sailYs[Math.floor(sailYs.length * 0.14)] ?? sailYs[0] ?? 0;

  const ghostOh = operaModel.clone(true);
  ghostOh.traverse((obj) => {
    if (obj.isLine || obj.isLineSegments) {
      obj.visible = false;
      return;
    }
    if (!obj.isMesh) return;
    obj.raycast = () => {};
    const gmat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(SAIL_GOLD) },
        uOpacity: { value: 0.028 },
        uSailFloor: { value: sailFloorLocal },
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
          float steep = 1.0 - abs(vNy);
          if (vWorldY < uSailFloor - 0.05) discard;
          if (steep < 0.16) discard;
          if (vNy > 0.82) discard;
          float a = uOpacity * (0.55 + steep * 0.7);
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    obj.material = gmat;
    obj.renderOrder = 2;
    landmarkMats.push(gmat);
  });
  operaRoot.add(ghostOh);

  // Seat flush on city particle ground at ohWorld
  operaRoot.updateWorldMatrix(true, true);
  const preSeatBox = new THREE.Box3().setFromObject(operaRoot);
  operaRoot.position.set(
    ohWorld.x - (preSeatBox.min.x + preSeatBox.max.x) * 0.5,
    // Seat slightly into the ground band so it doesn't read as floating
    ohWorld.y - preSeatBox.min.y - span * 0.004,
    ohWorld.z - (preSeatBox.min.z + preSeatBox.max.z) * 0.5
  );
  // Face roughly toward CBD / city mass (harbour landmark orientation)
  // Face roughly toward CBD, then +45° yaw (anticlockwise from above) in place
  operaRoot.rotation.y =
    Math.atan2(cbd.x - ohWorld.x, cbd.z - ohWorld.z) + Math.PI / 4;
  scene.add(operaRoot);
  operaRoot.updateWorldMatrix(true, true);

  // World-space sail floor after seating
  const yLift = ohWorld.y - preSeatBox.min.y;
  for (const m of landmarkMats) {
    m.uniforms.uSailFloor.value = sailFloorLocal + yLift;
  }

  const ohPickCenter = new THREE.Vector3();
  const ohLabelWorld = new THREE.Vector3();
  const ohPickRadius = span * OH_SPAN_FRAC * 1.05;
  let ohLabelLift = span * OH_SPAN_FRAC * 0.55;
  function refreshOhPickBounds() {
    const b = new THREE.Box3().setFromObject(operaRoot);
    b.getCenter(ohPickCenter);
    const s = b.getSize(new THREE.Vector3());
    ohLabelLift = Math.max(s.y * 0.55, span * OH_SPAN_FRAC * 0.45);
    return Math.max(ohPickRadius, Math.max(s.x, s.z) * 0.65);
  }
  let pickRadius = refreshOhPickBounds();

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 0.55 };
  const pointer = new THREE.Vector2(9999, 9999);
  let pointerDown = null;
  let suppressClick = false;
  let hoveredPlace = null;
  let active = true;
  let frame = 0;
  const clock = new THREE.Clock();
  const planeHit = new THREE.Vector3();

  function setPointerFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickOperaLandmark() {
    raycaster.setFromCamera(pointer, camera);
    const ptHits = raycaster.intersectObject(landmarkPoints, false);
    if (ptHits.length) return OPERA_PLACE;

    const plane = new THREE.Plane(
      new THREE.Vector3(0, 1, 0),
      -ohPickCenter.y
    );
    if (raycaster.ray.intersectPlane(plane, planeHit)) {
      const dx = planeHit.x - ohPickCenter.x;
      const dz = planeHit.z - ohPickCenter.z;
      if (dx * dx + dz * dz <= pickRadius * pickRadius) return OPERA_PLACE;
    }
    const closest = new THREE.Vector3();
    raycaster.ray.closestPointToPoint(ohPickCenter, closest);
    if (closest.distanceTo(ohPickCenter) <= pickRadius * 1.05) {
      return OPERA_PLACE;
    }
    return null;
  }

  function pickLockedDistrict() {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(points, false);
    if (hits.length) {
      const ix = hits[0].index * 3;
      const [ux, uy, uz] = worldToUnit(
        positions[ix],
        positions[ix + 1],
        positions[ix + 2],
        aabb
      );
      return nearestPlace(ux, uy, uz, MAP_PLACES);
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -fitCenter.y);
    if (!raycaster.ray.intersectPlane(plane, planeHit)) return null;
    const [ux, uy, uz] = worldToUnit(planeHit.x, planeHit.y, planeHit.z, aabb);
    return nearestPlace(ux, uy, uz, MAP_PLACES);
  }

  function pickPlace() {
    return pickOperaLandmark() || pickLockedDistrict();
  }

  function updateHoverLabel(place) {
    if (place?.id === hoveredPlace?.id) {
      if (place?.id === "opera-house") {
        ui.showMapHover?.(place.name, "Click to enter");
        syncEnterLabelPosition();
      }
      return;
    }
    hoveredPlace = place || null;
    if (place?.id === "opera-house") {
      ui.showMapHover?.(place.name, "Click to enter");
      canvas.style.cursor = "pointer";
      syncEnterLabelPosition();
      return;
    }
    ui.hideMapHover?.();
    canvas.style.cursor = place?.unlocked ? "pointer" : "default";
  }

  function syncEnterLabelPosition() {
    if (hoveredPlace?.id !== "opera-house" && ohHover < 0.05) return;
    ohLabelWorld.set(
      ohPickCenter.x,
      ohPickCenter.y + ohLabelLift,
      ohPickCenter.z
    );
    const proj = projectToCanvas(ohLabelWorld, camera, canvas);
    if (proj.visible) {
      ui.updateMapEnterPosition?.(proj.x, proj.y);
    }
  }

  function applyOperaHover(amount, time = 0) {
    const a = Math.max(0, Math.min(1, amount));
    // Keep hover subtle so points stay crisp
    const pulse = 1 + a * 0.18;
    const lift = a * 0.55;
    for (let k = 0; k < keepN; k++) {
      sizeAttr.array[k] = lSizesBase[k] * pulse;
      // Hover lifts toward exact glow highlight #ffe4b0
      colorAttr.array[k * 3] =
        lColorsBase[k * 3] * (1 - lift) + glowGold.r * lift;
      colorAttr.array[k * 3 + 1] =
        lColorsBase[k * 3 + 1] * (1 - lift) + glowGold.g * lift;
      colorAttr.array[k * 3 + 2] =
        lColorsBase[k * 3 + 2] * (1 - lift) + glowGold.b * lift;
    }
    colorAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    landmarkMat.uniforms.uBreathAmp.value = 0.03 + a * 0.05;
    landmarkMat.uniforms.uSwayAmp.value = 0.014 + a * 0.02;
    landmarkMat.uniforms.uPointSize.value = 0.042 + a * 0.01;
    glowMat.uniforms.uOpacity.value = 0.22 + a * 0.12;
    const wobble = a > 0.01 ? 1 + Math.sin(time * 3.4) * 0.016 * a : 1;
    operaRoot.scale.setScalar((1 + a * 0.04) * wobble);
  }

  function onPointerMove(event) {
    if (!active) return;
    setPointerFromEvent(event);
    if (pointerDown) {
      const dx = event.clientX - pointerDown.x;
      const dy = event.clientY - pointerDown.y;
      if (dx * dx + dy * dy > 36) suppressClick = true;
    }
    updateHoverLabel(pickPlace());
  }

  function onPointerDown(event) {
    if (!active) return;
    pointerDown = { x: event.clientX, y: event.clientY };
    suppressClick = false;
    setPointerFromEvent(event);
  }

  function onPointerUp(event) {
    if (!active) return;
    setPointerFromEvent(event);
    const wasDrag = suppressClick;
    pointerDown = null;
    if (wasDrag) return;
    const place = pickPlace();
    updateHoverLabel(place);
    if (place?.unlocked) {
      onEnterPlace?.(place.id);
    }
  }

  function onPointerLeave(event) {
    if (event?.relatedTarget?.closest?.("#map-hover")) return;
    pointer.set(9999, 9999);
    pointerDown = null;
    updateHoverLabel(null);
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointercancel", onPointerLeave);

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio, 2);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    mat.uniforms.uPixelRatio.value = pr;
    mat.uniforms.uHeight.value = h;
    landmarkMat.uniforms.uPixelRatio.value = pr;
    landmarkMat.uniforms.uHeight.value = h;
    glowMat.uniforms.uPixelRatio.value = pr;
    glowMat.uniforms.uHeight.value = h;
    pickRadius = refreshOhPickBounds();
  }
  window.addEventListener("resize", onResize);
  onResize();

  function tick() {
    frame = requestAnimationFrame(tick);
    if (!active) return;
    const t = clock.getElapsedTime();
    mat.uniforms.uTime.value = t;
    landmarkMat.uniforms.uTime.value = t;
    glowMat.uniforms.uTime.value = t;

    // Smooth hover swell — invites a click on the Opera House
    const target = hoveredPlace?.id === "opera-house" ? 1 : 0;
    ohHover += (target - ohHover) * 0.14;
    if (ohHover < 0.002) ohHover = 0;
    if (ohHover > 0 || target > 0) {
      applyOperaHover(ohHover, t);
      syncEnterLabelPosition();
    }

    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  ui.setMapChromeVisible?.(true);

  return {
    setActive(next) {
      active = Boolean(next);
      controls.enabled = active;
      if (!active) {
        updateHoverLabel(null);
        canvas.style.cursor = "default";
      }
    },
    /** Screen-space anchor for walkthrough spotlight on the Opera House. */
    getOperaAnchor() {
      refreshOhPickBounds();
      ohLabelWorld.set(
        ohPickCenter.x,
        ohPickCenter.y + ohLabelLift * 0.35,
        ohPickCenter.z
      );
      const proj = projectToCanvas(ohLabelWorld, camera, canvas);
      if (!proj.visible) return null;
      const size = Math.max(pickRadius * 18, 100);
      return { x: proj.x, y: proj.y, width: size, height: size * 0.85 };
    },
    dispose() {
      active = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointercancel", onPointerLeave);
      controls.dispose();
      geo.dispose();
      mat.dispose();
      landmarkGeo.dispose();
      landmarkMat.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      softDisc.dispose();
      for (const m of ghostMats) m.dispose();
      for (const m of landmarkMats) m.dispose();
      ghost.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
      });
      renderer.dispose();
      ui.setMapChromeVisible?.(false);
      ui.hideMapHover?.();
    },
  };
}
