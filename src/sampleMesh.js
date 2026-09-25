import * as THREE from "three";

/** Semantic structure layers for colour / density. */
export const LAYER = {
  GROUND: 0,
  PODIUM: 1,
  SAILS: 2,
};

/**
 * Sample surface points with normals + mesh index, then classify layers.
 * Thresholds are derived from the sample's own Y distribution (percentiles).
 *
 * @returns {{
 *   positions: Float32Array,
 *   normals: Float32Array,
 *   meshIndices: Uint16Array,
 *   layers: Uint8Array,
 *   meshNames: string[],
 *   stats: object
 * }}
 */
export function sampleMeshSurface(root, targetCount = 18000, options = {}) {
  const {
    sailBias = 2.2,
    groundWeight = 0.45,
    /** Prefer taller faces (city buildings). 0 = off. */
    elevationBias = 0,
  } = options;

  root.updateWorldMatrix(true, true);

  // First pass: world Y range for elevation weighting
  let yMin = Infinity;
  let yMax = -Infinity;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
    const pos = obj.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      yMin = Math.min(yMin, v.y);
      yMax = Math.max(yMax, v.y);
    }
  });
  const ySpan = Math.max(1e-6, yMax - yMin);

  const triangles = [];
  let totalWeight = 0;
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const meshNames = [];
  let meshIndex = -1;

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    meshIndex += 1;
    meshNames.push(obj.name || `mesh_${meshIndex}`);

    const geometry = obj.geometry.index
      ? obj.geometry.toNonIndexed()
      : obj.geometry;
    const pos = geometry.attributes.position;
    if (!pos) return;

    const normalMatrix = new THREE.Matrix3().getNormalMatrix(obj.matrixWorld);
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const nWorld = new THREE.Vector3();

    for (let i = 0; i < pos.count; i += 3) {
      vA.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      vB.fromBufferAttribute(pos, i + 1).applyMatrix4(obj.matrixWorld);
      vC.fromBufferAttribute(pos, i + 2).applyMatrix4(obj.matrixWorld);

      const area = triangleArea(vA, vB, vC);
      if (area <= 1e-10) continue;

      ab.subVectors(vB, vA);
      ac.subVectors(vC, vA);
      normal.crossVectors(ab, ac).normalize();
      nWorld.copy(normal).applyMatrix3(normalMatrix).normalize();

      const ny = Math.abs(nWorld.y);
      // Flat-up faces → ground-ish; steep / tilted → building / sail weight
      const steep = 1 - ny;
      const elev = (vA.y + vB.y + vC.y) / 3;
      const sailLikeness =
        steep * 0.65 + Math.max(0, nWorld.y < 0.9 ? steep : 0) * 0.35;
      let weight = area * (groundWeight + sailLikeness * sailBias);
      const elev01 = (elev - yMin) / ySpan;
      // Mild elevation preference
      weight *= 0.85 + 0.15 * Math.max(0, Math.min(1, elev01));
      // City mode: strongly prefer rooftops / façades over ground plane
      if (elevationBias > 0) {
        weight *= 1 + elevationBias * (0.15 + elev01 * elev01 * 1.6 + steep * 0.85);
      }

      triangles.push({
        a: vA.clone(),
        b: vB.clone(),
        c: vC.clone(),
        nx: nWorld.x,
        ny: nWorld.y,
        nz: nWorld.z,
        meshIndex,
        area: weight,
        cumulative: 0,
      });
      totalWeight += weight;
    }
  });

  if (!triangles.length || totalWeight <= 0) {
    throw new Error("No sampleable triangles found in Opera House mesh.");
  }

  let running = 0;
  for (const tri of triangles) {
    running += tri.area;
    tri.cumulative = running;
  }

  const positions = new Float32Array(targetCount * 3);
  const normals = new Float32Array(targetCount * 3);
  const meshIndices = new Uint16Array(targetCount);
  const point = new THREE.Vector3();

  for (let i = 0; i < targetCount; i++) {
    const tri = pickTriangle(triangles, totalWeight);
    sampleTriangle(tri.a, tri.b, tri.c, point);
    const ix = i * 3;
    positions[ix] = point.x;
    positions[ix + 1] = point.y;
    positions[ix + 2] = point.z;
    normals[ix] = tri.nx;
    normals[ix + 1] = tri.ny;
    normals[ix + 2] = tri.nz;
    meshIndices[i] = tri.meshIndex;
  }

  const { layers, stats } = classifyLayers(positions, normals);

  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.has("debugParts")) {
      console.info("[still-here] mesh parts", meshNames);
      console.info("[still-here] layer stats", stats);
    }
  }

  return { positions, normals, meshIndices, layers, meshNames, stats };
}

/**
 * Classify each sample into GROUND / PODIUM / SAILS using bbox percentiles + normals.
 */
export function classifyLayers(positions, normals) {
  const count = positions.length / 3;
  const ys = new Float32Array(count);
  for (let i = 0; i < count; i++) ys[i] = positions[i * 3 + 1];

  const yGround = percentile(ys, 0.22);
  const yPodiumTop = percentile(ys, 0.48);
  const ySail = percentile(ys, 0.58);

  const layers = new Uint8Array(count);
  let nGround = 0;
  let nPodium = 0;
  let nSails = 0;

  for (let i = 0; i < count; i++) {
    const y = positions[i * 3 + 1];
    const ny = normals[i * 3 + 1];
    const absNy = Math.abs(ny);
    const steep = 1 - absNy;

    // Ground: flat-up OR low band
    if (ny > 0.72 || y <= yGround) {
      layers[i] = LAYER.GROUND;
      nGround += 1;
      continue;
    }

    // Sails: elevated shells with tilted normals (not flat slab)
    if (y >= ySail && steep > 0.18 && ny < 0.88) {
      layers[i] = LAYER.SAILS;
      nSails += 1;
      continue;
    }

    // Also catch mid-high steep faces as sails (shell flanks)
    if (y >= yPodiumTop && steep > 0.35 && absNy < 0.92) {
      layers[i] = LAYER.SAILS;
      nSails += 1;
      continue;
    }

    layers[i] = LAYER.PODIUM;
    nPodium += 1;
  }

  return {
    layers,
    stats: {
      count,
      nGround,
      nPodium,
      nSails,
      yGround,
      yPodiumTop,
      ySail,
      // Tunables used (for README / debug)
      groundNy: 0.72,
      sailSteep: 0.18,
    },
  };
}

/** Pick a spaced subset of structure points for the interactive memory layer. */
export function pickMemorySites(structurePositions, count) {
  const total = structurePositions.length / 3;
  const step = Math.max(1, Math.floor(total / count));
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const src = Math.min(total - 1, i * step + (i % 7));
    out[i * 3] = structurePositions[src * 3];
    out[i * 3 + 1] = structurePositions[src * 3 + 1];
    out[i * 3 + 2] = structurePositions[src * 3 + 2];
  }
  return out;
}

function percentile(values, p) {
  const sorted = Float32Array.from(values).sort();
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1)))
  );
  return sorted[idx];
}

function triangleArea(a, b, c) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  return ab.cross(ac).length() * 0.5;
}

function pickTriangle(triangles, totalArea) {
  const r = Math.random() * totalArea;
  let lo = 0;
  let hi = triangles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r <= triangles[mid].cumulative) hi = mid;
    else lo = mid + 1;
  }
  return triangles[lo];
}

function sampleTriangle(a, b, c, target) {
  let u = Math.random();
  let v = Math.random();
  if (u + v > 1) {
    u = 1 - u;
    v = 1 - v;
  }
  const w = 1 - u - v;
  target.set(
    a.x * w + b.x * u + c.x * v,
    a.y * w + b.y * u + c.y * v,
    a.z * w + b.z * u + c.z * v
  );
}

export function computeRegionCenters(positions) {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const sx = (maxX - minX) * 0.25;
  const sy = (maxY - minY) * 0.25;
  const sz = (maxZ - minZ) * 0.25;

  return {
    sails: new THREE.Vector3(cx, maxY - sy * 0.4, cz),
    steps: new THREE.Vector3(cx, minY + sy * 0.35, maxZ - sz * 0.2),
    forecourt: new THREE.Vector3(cx, minY + sy * 0.2, maxZ),
    harbour: new THREE.Vector3(cx, cy, minZ + sz * 0.3),
  };
}
