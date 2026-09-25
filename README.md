# STILL HERE — Opera House Garden (prototype)

Interactive particle field of the Sydney Opera House, reached through a Sydney harbour point-cloud map.

Brush through the cloud to scatter particles (spring back). Tap a warmer hotspot to hold a memory. The field stays visible behind the reading panel.

## Setup

```bash
cd still-here-garden
cp "/Users/soham/Downloads/sydney_opera_house (1).glb" public/assets/sydney_opera_house.glb
cp "/Users/soham/Downloads/sydney_nsw_australia.glb" public/assets/sydney-nsw.glb
npm install
npm run dev
```

Open the local URL (default `http://localhost:5173`).

## Journey

1. **Opener** — concept copy → Enter experience
2. **Sydney map** — particle city from `sydney-nsw.glb`; only the Opera House region is unlocked
3. **Opera House garden** — existing particle garden, emotion filters, save memories

## Credits

**Sydney NSW Australia** 3D model via [Sketchfab](https://sketchfab.com/3d-models/sydney-nsw-australia-19402dd9c2ba41588712574b0b211baa) — harbour point-cloud map (`public/assets/sydney-nsw.glb`). See the Sketchfab page for the author and license terms.

## Structure layers (silhouette)

Particles are classified from sample **height percentiles + normals** (single-material GLB), so thresholds survive normalize/scale.

| Layer | Heuristic | Colour on black (`PART_COLORS`) |
|-------|-----------|----------------------------------|
| **Sails** | elevated + steep normals | warm white / soft gold `#fff4dc` (brightest) |
| **Podium** | mid building mass | sand / amber `#d4b896` |
| **Model ground** | flat-up or low Y band | soft mauve / mist `#b5a8b8` |

No near-black particle colours — background is pure black.

## Harbour sea

Separate particle disc (`src/sea.js`) — not from the GLB. Soft harbour blue (`#6aa8d8`), denser near the podium edge, fading outward. Gentle idle ripple; hover wave/glow is softer than the building. Assembles with the intro.

## Structure layers (detail)

**Debug:** `?debugParts=1` rainbow by source mesh + console stats.

### Layer / sea tunables

| Where | What |
|-------|------|
| `garden.js` → `PART_COLORS` | Sails / podium / ground |
| `garden.js` → `LAYER_SIZE` | Relative point size |
| `sampleMesh.js` → `classifyLayers` | Y percentiles + normal thresholds |
| `sea.js` → `SEA` / `SEA_COLOR` | Count, radii, ripple, harbour blue |

## Intro & interaction

**Opening:** On load, particles assemble from a dispersed cloud into the Opera House while the camera settles (~3.2s). Header and hint fade in near the end.

**Skip intro:** Click / tap anywhere, or press `Esc`. Lands in the same end state; orbit + brush + pick unlock after.

**After intro:** Orbit (no pan). Brush through mist. Tap a slightly warmer / larger hotspot particle to open a memory. Dismiss clears selection. Selected hotspot stays pinned near its rest while the panel is open.

### Key tunables

| Where | What | Default |
|-------|------|---------|
| `src/intro.js` → `INTRO.assembleDuration` | Assemble length (s) | `3.2` |
| `src/intro.js` → `INTRO.cameraDuration` | Camera settle (s) | `3.4` |
| `src/intro.js` → `INTRO.disperseRadius` | Start-cloud spread | `5.5` |
| `src/garden.js` → `SCATTER_RADIUS` | Brush soft radius | `4.6` |
| `src/garden.js` → `STRUCTURE_SCATTER` | Firefly drift strength | `0.075` |
| `src/garden.js` → `SPRING` / `DAMPING` | Lazy return (firefly) | `0.028` / `0.94` |
| `src/garden.js` → `STRUCTURE_GLOW` | Soft colour glow (no sprite blob) | `0.42` |
| `src/garden.js` → `SWAY_AMP_STRUCTURE` | Ambient sway | `0.048` |
| `src/garden.js` → `STRUCTURE_COUNT` | Structure particles | `45000` |

### Perf assumptions

~45k structure points + memory hotspots, soft-disc shader with tiny vertex sway. Targets 60fps on a laptop GPU; lower `STRUCTURE_COUNT` if needed. Sydney map caps ~32k city points.

## Stack

- Vite
- Three.js (GLTFLoader, Points, OrbitControls, custom point shader)
- GSAP (intro + memory card)

## Out of scope

- NFC unlock / My Places shell
- Contribution flow
- Native iOS wrapper
- Audio-reactive / PCD pipelines
