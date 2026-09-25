import * as THREE from "three";

const RING_COLOR = 0xffe8c4;
const PIN_COLOR = 0xffefd6;

/**
 * Soft annular glow — hairline rim with a faint outer bloom.
 */
function createGlowRingTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;

  ctx.clearRect(0, 0, size, size);

  // Very soft bloom outside the stroke
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,236,200,0.22)";
  ctx.lineWidth = size * 0.045;
  ctx.stroke();

  // Hairline luminous stroke
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,245,225,0.9)";
  ctx.lineWidth = size * 0.012;
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Quiet in-scene memory marker: compact glowing ring + centre pin.
 * Call lookAtCamera(camera) each frame while visible.
 */
export function createMemoryMarker({ radius = 0.34 } = {}) {
  const group = new THREE.Group();
  group.visible = false;

  const glowMap = createGlowRingTexture();
  const glowGeo = new THREE.PlaneGeometry(radius * 2.6, radius * 2.6);
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowMap,
    color: RING_COLOR,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.renderOrder = 10;
  group.add(glow);

  // Hairline rim
  const ringPts = [];
  const segments = 64;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    ringPts.push(
      new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0)
    );
  }
  const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
  const ringMat = new THREE.LineBasicMaterial({
    color: 0xfff6e8,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
  });
  const ring = new THREE.Line(ringGeo, ringMat);
  ring.renderOrder = 11;
  group.add(ring);

  const pinGeo = new THREE.SphereGeometry(radius * 0.16, 12, 12);
  const pinMat = new THREE.MeshBasicMaterial({
    color: PIN_COLOR,
    depthTest: false,
    transparent: true,
    opacity: 0.98,
  });
  const pin = new THREE.Mesh(pinGeo, pinMat);
  pin.renderOrder = 12;
  group.add(pin);

  return {
    group,
    radius,
    show() {
      group.visible = true;
    },
    hide() {
      group.visible = false;
    },
    setPosition(x, y, z) {
      group.position.set(x, y, z);
    },
    setScale(s) {
      const v = Math.max(0.01, s);
      group.scale.setScalar(v);
    },
    setOpacity(o) {
      const a = Math.max(0, Math.min(1, o));
      glowMat.opacity = 0.85 * a;
      ringMat.opacity = 0.55 * a;
      pinMat.opacity = 0.98 * a;
    },
    lookAtCamera(camera) {
      group.quaternion.copy(camera.quaternion);
    },
    dispose() {
      glowGeo.dispose();
      glowMat.dispose();
      glowMap.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      pinGeo.dispose();
      pinMat.dispose();
    },
  };
}

/** Project a world point to CSS pixel coords relative to the canvas. */
export function projectToCanvas(worldPos, camera, canvas) {
  const v = worldPos.clone().project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: (v.x * 0.5 + 0.5) * rect.width,
    y: (-v.y * 0.5 + 0.5) * rect.height,
    visible: v.z < 1,
  };
}
