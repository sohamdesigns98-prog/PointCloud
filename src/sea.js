import * as THREE from "three";
import {
  createParticleMaterial,
  createSoftDiscTexture,
} from "./particleMaterial.js";

/** Soft white base — podium + sea; sails stay gold. */
export const SEA_COLOR = new THREE.Color(0xe8e4dc);
export const SEA_GLOW = new THREE.Color(0xf5f2ea);

export const SEA = {
  count: 62000,
  /** Fallback multiplier on building footprint if no outerRadius passed */
  outerScale: 7.5,
  /** No hole — one continuous white base under the sails */
  innerScale: 0.02,
  /** Drop below building min Y */
  yOffset: -0.28,
  rippleAmp: 0.1,
  /** Match structure mist language — slightly softer water */
  scatter: 0.032,
  glowRadius: 7.2,
  scatterRadius: 4.6,
  pointSize: 0.058,
};

/**
 * Radius on the sea plane that reaches past the screen corners
 * for the given camera, plus orbit headroom so water stays full-bleed.
 */
export function seaRadiusToScreenEdge({
  camera,
  center,
  seaY,
  maxDistance = 40,
  bleed = 1.12,
} = {}) {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -seaY);
  const raycaster = new THREE.Raycaster();
  const hit = new THREE.Vector3();
  const ndc = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];

  let maxR = 0;
  for (const [nx, ny] of ndc) {
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    if (raycaster.ray.intersectPlane(plane, hit)) {
      const r = Math.hypot(hit.x - center.x, hit.z - center.z);
      if (r > maxR) maxR = r;
    }
  }

  // Orbit headroom: when zoomed/panned out, keep water past the frame
  const fovRad = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const aspect = camera.aspect || 1;
  const halfH = Math.tan(fovRad) * maxDistance;
  const halfW = halfH * aspect;
  const orbitR = Math.hypot(halfW, halfH);

  return Math.max(maxR, orbitR) * bleed;
}

/**
 * Build a flat particle disc under/around the building.
 * Dense near the structure, gradually sparse toward the outer rim.
 */
export function createSeaField(fitBox, softDisc, { outerRadius } = {}) {
  const size = fitBox.getSize(new THREE.Vector3());
  const center = fitBox.getCenter(new THREE.Vector3());
  const footprint = Math.max(size.x, size.z) * 0.5;
  const innerR = footprint * SEA.innerScale;
  const outerR = Math.max(
    outerRadius ?? footprint * SEA.outerScale,
    innerR + footprint * 0.5
  );
  const y = fitBox.min.y + SEA.yOffset;
  /** Radius where “near structure” density holds before the falloff steepens */
  const coreR = Math.max(footprint * 1.15, innerR + footprint * 0.35);

  const count = SEA.count;
  const rest = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const baseColors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const velocities = new Float32Array(count * 3);

  // Radial PDF: dense near structure → sparse at screen edge
  // Inverse CDF of weight w(s)=(1-s)^α on normalized radius s∈[0,1]
  const falloff = 2.85;
  const inv = 1 / (falloff + 1);

  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const s = 1 - Math.pow(1 - u, inv);
    // Soft hold near the building footprint, then stretch the outer half
    const sWarp =
      s < 0.38
        ? (s / 0.38) * ((coreR - innerR) / Math.max(1e-3, outerR - innerR))
        : (coreR - innerR) / Math.max(1e-3, outerR - innerR) +
          ((s - 0.38) / 0.62) *
            (1 - (coreR - innerR) / Math.max(1e-3, outerR - innerR));
    const r = innerR + (outerR - innerR) * Math.min(1, Math.max(0, sWarp));
    const theta = Math.random() * Math.PI * 2;
    const ix = i * 3;
    rest[ix] = center.x + Math.cos(theta) * r;
    rest[ix + 1] = y + (Math.random() - 0.5) * 0.05;
    rest[ix + 2] = center.z + Math.sin(theta) * r;

    const edge = (r - innerR) / Math.max(1e-3, outerR - innerR);
    const near = 1 - edge;
    const shade = (0.82 + near * 0.16) * (0.92 + Math.random() * 0.1);
    baseColors[ix] = SEA_COLOR.r * shade;
    baseColors[ix + 1] = SEA_COLOR.g * shade;
    baseColors[ix + 2] = SEA_COLOR.b * shade;
    colors[ix] = baseColors[ix];
    colors[ix + 1] = baseColors[ix + 1];
    colors[ix + 2] = baseColors[ix + 2];
    seeds[i] = Math.random();
    // Slightly larger / fuller near the building, quieter at the rim
    sizes[i] = (0.72 + near * 0.38) * (0.88 + Math.random() * 0.2);
  }

  const positions = new Float32Array(rest);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  const opacities = new Float32Array(count);
  opacities.fill(1);
  geo.setAttribute("aOpacity", new THREE.BufferAttribute(opacities, 1));
  geo.computeBoundingSphere();

  const mat = createParticleMaterial({
    map: softDisc || createSoftDiscTexture(),
    pointSize: SEA.pointSize,
    swayAmp: SEA.rippleAmp,
    opacity: 0.8,
    additive: false,
    breathAmp: 0.08,
    breathSpeed: 0.55,
    softEdge: 0.72,
  });

  const points = new THREE.Points(geo, mat);
  points.renderOrder = -1;

  return {
    rest,
    positions,
    velocities,
    colors,
    baseColors,
    geo,
    mat,
    points,
    count,
    outerR,
    innerR,
  };
}

/** Soft harbour wave under the brush — same XZ footprint as the building mist. */
export function applySeaHover(sea, brushHit, softFalloff, tmpColor) {
  const { count, positions, velocities, colors, baseColors, geo } = sea;
  const glowR = SEA.glowRadius;
  const glowR2 = glowR * glowR;
  const scatterR = SEA.scatterRadius ?? glowR * 0.9;
  const scatterR2 = scatterR * scatterR;
  const now = performance.now() * 0.001;

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    colors[ix] = baseColors[ix];
    colors[ix + 1] = baseColors[ix + 1];
    colors[ix + 2] = baseColors[ix + 2];

    const dx = positions[ix] - brushHit.x;
    const dz = positions[ix + 2] - brushHit.z;
    const dSq = dx * dx + dz * dz;
    if (dSq > glowR2 && dSq > scatterR2) continue;

    const d = Math.sqrt(dSq);
    if (dSq <= glowR2) {
      const falloff = softFalloff(d, glowR);
      const t = falloff * 0.4;
      tmpColor.setRGB(baseColors[ix], baseColors[ix + 1], baseColors[ix + 2]);
      tmpColor.lerp(SEA_GLOW, t);
      colors[ix] = tmpColor.r;
      colors[ix + 1] = tmpColor.g;
      colors[ix + 2] = tmpColor.b;
    }

    if (dSq <= scatterR2 && dSq > 1e-6) {
      const falloff = softFalloff(d, scatterR);
      const inv = 1 / d;
      const nx = dx * inv;
      const nz = dz * inv;
      const seed = (i * 0.137 + 0.41) % 1;
      const swirl =
        Math.sin(now * 0.7 + i * 0.05) * 0.2 +
        Math.sin(now * 0.35 + seed * 6.0) * 0.08;
      const radial = 0.24 + seed * 0.1;
      const lift = 0.2 + seed * 0.1;
      const force = falloff * SEA.scatter;
      velocities[ix] += (nx * radial - nz * swirl) * force;
      velocities[ix + 1] += lift * force;
      velocities[ix + 2] += (nz * radial + nx * swirl) * force;
    }
  }
  geo.attributes.color.needsUpdate = true;
}

export function integrateSea(sea, spring = 0.1, damping = 0.86) {
  const { count, positions, rest, velocities, geo } = sea;
  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    velocities[ix] += (rest[ix] - positions[ix]) * spring;
    velocities[ix + 1] += (rest[ix + 1] - positions[ix + 1]) * spring;
    velocities[ix + 2] += (rest[ix + 2] - positions[ix + 2]) * spring;
    velocities[ix] *= damping;
    velocities[ix + 1] *= damping;
    velocities[ix + 2] *= damping;
    positions[ix] += velocities[ix];
    positions[ix + 1] += velocities[ix + 1];
    positions[ix + 2] += velocities[ix + 2];
  }
  geo.attributes.position.needsUpdate = true;
}

export function resetSeaColors(sea) {
  const { count, colors, baseColors, geo } = sea;
  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    colors[ix] = baseColors[ix];
    colors[ix + 1] = baseColors[ix + 1];
    colors[ix + 2] = baseColors[ix + 2];
  }
  geo.attributes.color.needsUpdate = true;
}
