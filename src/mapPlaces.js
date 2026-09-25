/**
 * Sydney harbour map places — locked districts for hover labels.
 * Opera House entry is a landmark mesh (not a gold particle AABB).
 */
import * as THREE from "three";

export const MAP_PLACES = [
  {
    id: "harbour-bridge",
    name: "Harbour Bridge",
    unlocked: false,
    box: { min: [0.22, 0.15, 0.55], max: [0.48, 0.98, 0.82] },
  },
  {
    id: "circular-quay",
    name: "Circular Quay",
    unlocked: false,
    box: { min: [0.52, 0.0, 0.48], max: [0.72, 0.35, 0.68] },
  },
  {
    id: "cbd",
    name: "CBD",
    unlocked: false,
    box: { min: [0.42, 0.08, 0.18], max: [0.82, 0.92, 0.55] },
  },
  {
    id: "rocks",
    name: "The Rocks",
    unlocked: false,
    box: { min: [0.4, 0.05, 0.5], max: [0.58, 0.55, 0.7] },
  },
];

export const OPERA_PLACE = {
  id: "opera-house",
  name: "Sydney Opera House",
  unlocked: true,
};

export const MAP_COLORS = {
  city: 0xb8bcc6,
  cityLift: 0.9,
  heightLift: 0.32,
};

export function worldToUnit(x, y, z, aabb) {
  const sx = Math.max(1e-6, aabb.max.x - aabb.min.x);
  const sy = Math.max(1e-6, aabb.max.y - aabb.min.y);
  const sz = Math.max(1e-6, aabb.max.z - aabb.min.z);
  return [
    (x - aabb.min.x) / sx,
    (y - aabb.min.y) / sy,
    (z - aabb.min.z) / sz,
  ];
}

export function nearestPlace(ux, uy, uz, places = MAP_PLACES) {
  let best = null;
  let bestD = Infinity;
  for (const p of places) {
    const cx = (p.box.min[0] + p.box.max[0]) * 0.5;
    const cy = (p.box.min[1] + p.box.max[1]) * 0.5;
    const cz = (p.box.min[2] + p.box.max[2]) * 0.5;
    const dx = ux - cx;
    const dy = uy - cy;
    const dz = uz - cz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * Densest elevated grid cell ≈ CBD towers.
 * @returns {{ x: number, y: number, z: number, ux: number, uz: number } | null}
 */
export function findCbdPeak(positions, aabb, gridN = 28) {
  const count = positions.length / 3;
  const cells = new Float32Array(gridN * gridN);
  const ySum = new Float32Array(gridN * gridN);
  const nSum = new Uint32Array(gridN * gridN);

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const [ux, uy, uz] = worldToUnit(x, y, z, aabb);
    if (uy < 0.28) continue;
    const gx = Math.min(gridN - 1, Math.floor(ux * gridN));
    const gz = Math.min(gridN - 1, Math.floor(uz * gridN));
    const idx = gz * gridN + gx;
    cells[idx] += 1 + uy * 3.5;
    ySum[idx] += y;
    nSum[idx] += 1;
  }

  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] > bestScore) {
      bestScore = cells[i];
      best = i;
    }
  }
  if (best < 0 || bestScore <= 0) return null;

  const gz = Math.floor(best / gridN);
  const gx = best % gridN;
  const ux = (gx + 0.5) / gridN;
  const uz = (gz + 0.5) / gridN;
  const y =
    nSum[best] > 0
      ? ySum[best] / nSum[best]
      : aabb.min.y + (aabb.max.y - aabb.min.y) * 0.35;

  return {
    x: aabb.min.x + ux * (aabb.max.x - aabb.min.x),
    y,
    z: aabb.min.z + uz * (aabb.max.z - aabb.min.z),
    ux,
    uz,
  };
}

function buildDensityGrid(positions, aabb, gridN = 32) {
  const count = positions.length / 3;
  const cells = new Float32Array(gridN * gridN);
  for (let i = 0; i < count; i++) {
    const [ux, , uz] = worldToUnit(
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2],
      aabb
    );
    const gx = Math.min(gridN - 1, Math.max(0, Math.floor(ux * gridN)));
    const gz = Math.min(gridN - 1, Math.max(0, Math.floor(uz * gridN)));
    cells[gz * gridN + gx] += 1;
  }
  return { cells, gridN };
}

function densityAt(grid, aabb, x, z) {
  const { cells, gridN } = grid;
  const [ux, , uz] = worldToUnit(x, aabb.min.y, z, aabb);
  if (ux < 0 || ux > 1 || uz < 0 || uz > 1) return 0;
  const gx = Math.min(gridN - 1, Math.floor(ux * gridN));
  const gz = Math.min(gridN - 1, Math.floor(uz * gridN));
  return cells[gz * gridN + gx];
}

/**
 * Low-band Y of city points near (x,z) — seats landmark on particle ground.
 */
export function sampleGroundYNear(positions, x, z, radius, aabb = null) {
  const r2 = radius * radius;
  const ys = [];
  const count = positions.length / 3;
  for (let i = 0; i < count; i++) {
    const dx = positions[i * 3] - x;
    const dz = positions[i * 3 + 2] - z;
    if (dx * dx + dz * dz > r2) continue;
    const y = positions[i * 3 + 1];
    if (aabb) {
      const uy =
        (y - aabb.min.y) / Math.max(1e-6, aabb.max.y - aabb.min.y);
      // Skip rooftops / towers — only ground band
      if (uy > 0.28) continue;
    }
    ys.push(y);
  }
  if (!ys.length) {
    // Fallback: any nearby point, lower percentile
    for (let i = 0; i < count; i++) {
      const dx = positions[i * 3] - x;
      const dz = positions[i * 3 + 2] - z;
      if (dx * dx + dz * dz > r2) continue;
      ys.push(positions[i * 3 + 1]);
    }
  }
  if (!ys.length) return null;
  ys.sort((a, b) => a - b);
  return ys[Math.floor(ys.length * 0.08)];
}

/**
 * Place Opera House beside the CBD on the harbour protrusion.
 * Offset uses screen-right in camera space so it reads on the LEFT of
 * the CBD towers in the default harbour overview.
 */
export function operaHouseWorldFromCbd(
  cbd,
  positions,
  span,
  aabb,
  cameraPos,
  fitCenter
) {
  const grid = buildDensityGrid(positions, aabb, 36);

  const forward = fitCenter.clone().sub(cameraPos);
  forward.y = 0;
  if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
  forward.normalize();
  const screenRight = new THREE.Vector3().crossVectors(
    forward,
    new THREE.Vector3(0, 1, 0)
  );
  if (screenRight.lengthSq() < 1e-8) screenRight.set(1, 0, 0);
  screenRight.normalize();
  // Flip from previous side: offset along screen-right so the landmark
  // reads on the LEFT of the CBD in the harbour overview (opposite of before).
  const harbourSide = screenRight;

  // Base: harbour protrusion beside CBD
  const pos = new THREE.Vector3(cbd.x, cbd.y, cbd.z);
  pos.addScaledVector(harbourSide, span * 0.125);

  // Small slide toward emptier water along harbour±forward fan
  let bestNudge = new THREE.Vector3();
  let bestDrop = -Infinity;
  for (let t = -0.35; t <= 0.55; t += 0.1) {
    const dir = harbourSide
      .clone()
      .addScaledVector(forward, t)
      .normalize();
    const probe = pos
      .clone()
      .addScaledVector(dir, span * 0.04);
    const near = densityAt(grid, aabb, pos.x, pos.z);
    const far = densityAt(grid, aabb, probe.x, probe.z);
    const drop = near - far * 2.5;
    if (drop > bestDrop) {
      bestDrop = drop;
      bestNudge.copy(dir).multiplyScalar(span * 0.035);
    }
  }
  pos.add(bestNudge);

  const ground =
    sampleGroundYNear(positions, pos.x, pos.z, span * 0.05, aabb) ??
    aabb.min.y + (aabb.max.y - aabb.min.y) * 0.05;
  pos.y = ground;

  return pos;
}

