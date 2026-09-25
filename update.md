# STILL HERE — detailed Cursor prompt

Project: `/Users/soham/Documents/UTS/IDS/Concept/still-here-garden`

Stack: Vite + Three.js particle garden, Opera Neon charcoal chrome, concept opener → ENTER EXPERIENCE.

## Goal
Wire the post-opener journey and garden tools:

1. **Sydney point-cloud map** (Sketchfab model) with only Opera House unlocked  
2. **Emotion filters** inside the Opera House garden  
3. **Bookmark / Saved memories**

Keep existing garden feel (hover wave/glow, click → memory panel, particle Opera House + blue sea base). Keep STILL HERE visual tokens already in the project.

---

## A. Flow

```
Opener (concept copy)
  → ENTER EXPERIENCE
    → Sydney Map (point cloud)
         → tap unlocked Opera House
              → Opera House Garden
                   → emotion filter chips
                   → open memory → Save / Saved list
```

- First paint after ENTER EXPERIENCE = **Sydney map**, not the deep garden  
- Deep garden only after choosing Opera House  
- Pass / Locations / Leave can stay as existing routes; this prompt prioritises map + filters + bookmarks

---

## B. Sydney map

### Asset
- Source: https://sketchfab.com/3d-models/sydney-nsw-australia-19402dd9c2ba41588712574b0b211baa  
- Download GLB → `public/assets/sydney-nsw.glb`  
- Credit author/license in README or a small on-map attribution

### Look
- Same particle language as Opera House garden (sample mesh surface → Points / custom point shader if you already have one)
- Charcoal / void background consistent with site
- Camera: readable harbour overview; gentle orbit or pan; no wild spins

### Place states
Define place hotspots (at least):

| Place | State | Behaviour |
|---|---|---|
| Sydney Opera House | `unlocked` | Brighter / warmer particles in that region; click/tap → navigate to Opera House Garden |
| Others (Bridge, CBD, Quay, etc. as identifiable) | `locked` | Dim, cooler grey; not enterable; optional hover “Locked” |

Implementation notes:
- Prefer region masks / bounding volumes over perfect geocoding — e.g. a box/sphere around Opera House coordinates in model space marked `unlocked`
- Locked regions share one dim material/colour multiplier
- Unlocked region uses bone/gold lift so it reads as the only open place
- Cursor: pointer on unlocked; default on locked
- Soft label on hover: place name + Open / Locked

### UX chrome on map
- Minimal: STILL HERE mark, back to opener optional, hint “Only one place is open”
- Tap Opera House → fade/transition into existing garden scene

---

## C. Opera House garden — emotion filters

### Data
Extend each memory with:

```ts
emotion: 'Love' | 'Nostalgia' | 'Joy' | 'Wonder' | 'Pain'
```

Map sheet “Sadness” → `Pain` if needed. Keep `title`, `body`, `relationship`, `region`.

Ensure seeded Opera House memories cover all five emotions so filters are testable.

### UI
Horizontal filter chips (garden overlay, quiet mono/caps or soft pills matching Opera Neon chrome):

- **All** (default)
- Love · Nostalgia · Joy · Wonder · Pain

Single-select for MVP.

### Behaviour
- `All`: every memory particle interactive (current behaviour)
- Specific emotion: matching particles full brightness + pickable; non-matching dimmed (opacity/size) or hidden — prefer **dim** so the building silhouette stays
- Changing filter clears current selection / closes panel if the open memory no longer matches
- Hotspot / memory particle colours may tint lightly by emotion (muted auras) without rainbow chaos

---

## D. Bookmarks

### UI
- On memory detail panel: **Save** control (icon + label)
- Filled state when saved; tap again to unsave
- Chrome entry: **Saved** opens a panel/list

### Data (localStorage)
```ts
{
  id: string
  title: string
  snippet: string  // first ~80 chars of body
  emotion: string
  place: 'Opera House'
  savedAt: number
}
```

### Behaviour
- List shows saved items; tap item reopens that memory panel (and focuses/highlights its particle if in garden)
- Survives refresh
- Empty state: short line — “No saved memories yet”

---

## E. Implementation preferences
- Reuse existing particle pipeline; add a `SydneyMap` scene/route rather than rewriting the garden
- Shared theme colours for unlocked vs locked vs emotion dims
- Touch + mouse
- Keep laptop performance: cap map particle count if the Sketchfab mesh is heavy (downsample on sample)

---

## Done when
1. ENTER EXPERIENCE → Sydney particle map from `sydney-nsw.glb`  
2. Only Opera House region is enterable; others look locked  
3. Entering Opera House loads the existing garden  
4. Emotion chips filter memory particles  
5. Save / unsave / Saved list works via localStorage  
6. `npm run dev` runs clean; no console errors  

Credit Sketchfab model in README.
