import * as THREE from "three";

/**
 * Soft luminous points — ambient multi-octave sway + optional breath.
 * CPU owns brush scatter / assemble via the position attribute.
 */
export function createParticleMaterial({
  map,
  pointSize = 0.07,
  swayAmp = 0.035,
  opacity = 0.95,
  additive = false,
  breathAmp = 0,
  breathSpeed = 1.15,
  /** Soft edge in fragment (0–1). Higher = more misty / dimensional. */
  softEdge = 0.55,
} = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uTime: { value: 0 },
      uPointSize: { value: pointSize },
      uSwayAmp: { value: swayAmp },
      uOpacity: { value: opacity },
      uBreathAmp: { value: breathAmp },
      uBreathSpeed: { value: breathSpeed },
      uSoftEdge: { value: softEdge },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uHeight: { value: window.innerHeight },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aSize;
      attribute float aOpacity;
      attribute vec3 color;

      uniform float uTime;
      uniform float uPointSize;
      uniform float uSwayAmp;
      uniform float uBreathAmp;
      uniform float uBreathSpeed;
      uniform float uPixelRatio;
      uniform float uHeight;

      varying vec3 vColor;
      varying float vAlpha;
      varying float vOpacity;

      float hash(float n) {
        return fract(sin(n) * 43758.5453123);
      }

      // Quiet living cloud — never frozen
      vec3 ambientSway(float seed, float time) {
        float s0 = hash(seed);
        float s1 = hash(seed + 19.7);
        float s2 = hash(seed + 41.3);
        float t1 = time * (0.18 + s0 * 0.16);
        float t2 = time * (0.31 + s1 * 0.22);
        float t3 = time * (0.47 + s2 * 0.18);
        vec3 a = vec3(
          sin(t1 + seed * 6.2831),
          cos(t1 * 0.91 + seed * 4.1) * 0.72,
          sin(t1 * 0.73 + seed * 2.7)
        );
        vec3 b = vec3(
          sin(t2 * 1.3 + s0 * 9.1) * 0.45,
          cos(t2 * 0.8 + s1 * 5.5) * 0.35,
          sin(t2 * 1.1 + s2 * 3.3) * 0.45
        );
        vec3 c = vec3(
          cos(t3 + s1 * 7.2) * 0.22,
          sin(t3 * 1.15 + s2 * 2.8) * 0.28,
          cos(t3 * 0.9 + s0 * 4.4) * 0.22
        );
        return (a + b + c) * uSwayAmp;
      }

      void main() {
        vColor = color;
        vOpacity = aOpacity > 0.001 ? aOpacity : 1.0;
        float seed = aSeed;
        vec3 transformed = position + ambientSway(seed, uTime);
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        float sizeMul = aSize > 0.001 ? aSize : 1.0;
        float phase = seed * 6.2831853;
        float rate = uBreathSpeed * (0.85 + hash(seed + 1.7) * 0.35);
        float breath = sin(uTime * rate + phase);
        breath = breath * 0.62 + sin(uTime * rate * 0.47 + phase * 1.25) * 0.38;
        float inhale = breath * 0.5 + 0.5;
        float breathOn = step(0.001, uBreathAmp);
        sizeMul *= 1.0 + inhale * uBreathAmp;
        // Subtle alpha breath even when breathAmp is 0 (idle life)
        float idlePulse = 0.94 + inhale * 0.08;
        vAlpha = mix(idlePulse, 0.7 + inhale * (0.48 + uBreathAmp * 0.45), breathOn);

        float atten = uHeight * 0.5 / max(1.0, -mvPosition.z);
        gl_PointSize = uPointSize * sizeMul * uPixelRatio * atten;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uOpacity;
      uniform float uSoftEdge;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vOpacity;

      void main() {
        vec2 uv = gl_PointCoord;
        float dist = length(uv - vec2(0.5)) * 2.0;
        // Soft gaseous falloff — reads as volume, not a hard disc
        float soft = 1.0 - smoothstep(0.15, 1.0, dist);
        soft = pow(soft, mix(1.35, 0.75, uSoftEdge));
        vec4 tex = texture2D(uMap, uv);
        float alpha = tex.a * soft * uOpacity * vOpacity * clamp(vAlpha, 0.35, 1.5);
        if (alpha < 0.018) discard;
        float core = 1.0 - smoothstep(0.0, 0.45, dist);
        float glow = clamp((vAlpha - 0.82) * 0.75, 0.0, 0.45) + core * 0.08;
        // Keep brand colour (gold/sand) — avoid washing toward white
        vec3 rgb = vColor * (tex.rgb * 0.92 + 0.08) * (1.0 + glow * 0.55);
        gl_FragColor = vec4(rgb, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export function createSoftDiscTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.75)");
  g.addColorStop(0.45, "rgba(255,255,255,0.28)");
  g.addColorStop(0.72, "rgba(255,255,255,0.06)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
