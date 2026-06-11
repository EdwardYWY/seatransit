# Implementation Prompt — seatransit

Run this agent at `D:\Documents\Code\seatransit\` with the **general** agent type. It will self-validate using agent-browser and iterate until everything works.

---

You have a complete implementation plan in `IMPLEMENTATION.md`. Your job: implement this project from scratch, self-validate with agent-browser, and iterate until the web app works correctly from 0h to 48h with zero console errors.

## Git Setup (do this first)

```bash
cd D:\Documents\Code\seatransit
git init
git add .
git commit -m "init: project scaffold"
git remote add origin https://github.com/EdwardYWY/seatransit.git
git branch -M main
git push -u origin main
```

## Implementation Task

Create a working Chronotrains-like interactive map for Malaysia/Singapore trains. The data pipeline must parse GTFS feeds from 3 sources (KTM, Rapid KL, Singapore MRT), build a station graph, compute isochrone polygons via Dijkstra BFS, and export static JSON. The frontend must render a MapLibre GL map with isochrone overlays, time slider (0h to 48h), and station search — all as a static site deployable to GitHub Pages.

## Steps

### 1. Scaffold Project
- `npm create vite@latest . -- --template vanilla-ts` (overwrite existing files)
- `npm install maplibre-gl @turf/turf gtfs-utils`
- `npm install -D typescript gh-pages tsx vite @types/node`
- Set `vite.config.ts` with `base: './'` and `build.outDir: 'dist'`
- Create directory structure: `scripts/`, `src/`, `public/data/`
- Add scripts to package.json: `"build-data": "tsx scripts/build-data.ts"`, `"deploy": "npm run build-data && npm run build && gh-pages -d dist"`
- Commit: `git add . && git commit -m "feat: project scaffold" && git push`

### 2. Data Pipeline (`scripts/`)
All scripts are Node.js/TypeScript that run locally via `tsx`.

#### `scripts/gtfs-parser.ts`
Export functions:
```typescript
interface Station { id: string; name: string; lat: number; lng: number; country: string; agency: string; }
interface Edge { fromId: string; toId: string; durationMinutes: number; source: string; }
interface ParseResult { stations: Station[]; edges: Edge[]; }
async function parseKTM(): Promise<ParseResult>
async function parseRapidKL(): Promise<ParseResult>
async function parseSingaporeMRT(): Promise<ParseResult>
```

Implementation:
- Download GTFS zips from:
  - KTM: `https://api.data.gov.my/gtfs-static/ktmb`
  - Rapid KL: `https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl`
  - SG MRT: `https://github.com/thecrapone/singapore-gtfs-2026/raw/main/singapore-gtfs.zip`
- Parse stops.txt -> Station[]
- Parse trips.txt + stop_times.txt: for each trip, iterate consecutive stops by stop_sequence, compute duration = arrival_{j} - departure_{i} in minutes
- For Singapore: filter to route_type=1 only (ignore bus routes)
- For Rapid KL: it uses frequencies.txt (headway-based). Read stop_times for each trip, average station-to-station times across trips on same route
- BOM handling: GTFS CSVs may start with a UTF-8 BOM (`\ufeff`). Strip it from the first line before parsing
- Time parsing: stop_times may use hours > 24 (e.g. `25:30:00`). Parse as `hours * 60 + minutes` (e.g. 25*60+30 = 1530 minutes from midnight)

#### `scripts/graph.ts`
```typescript
type Graph = Map<string, Map<string, number>>;
function buildGraph(stations: Station[], edges: Edge[]): Graph
function addWalkableEdges(graph: Graph, stations: Station[], maxDistanceKm: number, speedKmPerMin: number): void
function addTransferEdges(graph: Graph, stations: Station[], transfers: {fromId: string, toId: string, minutes: number}[]): void
function dijkstra(graph: Graph, startId: string, maxDuration: number, maxHops: number, interchangeTime: number): Map<string, number>
```

Walkable edges: stations within 3km at 9 km/h speed (0.15 km/min)
Transfer edges:
- KTM Woodlands (37600) <-> SG Woodlands MRT (NS9-TE2): 20 min walk
- KTM KL Sentral (19100) <-> Rapid KL KL Sentral (use Rapid KL stop IDs that match "KL Sentral"): 5 min transfer
- Same-station KTM <-> Rapid KL where station names overlap: 15 min transfer
- JB Sentral (37500) <-> Woodlands (37600): 5 min (Shuttle Tebrau)

Dijkstra implementation:
- Standard priority-queue BFS
- Track visited stations to avoid cycles
- Track hop count per path, stop expanding when maxHops exceeded
- Return Map<stationId, shortestDuration>

#### `scripts/isochrone-compute.ts`
```typescript
function computeIsochrones(
  startStationId: string,
  graph: Graph,
  stations: Station[],
  timeBands: number[],
  walkSpeedKmPerMin: number
): GeoJSON.FeatureCollection
```

Algorithm (adapt from Chronotrains' MIT code):
1. Run dijkstra from start station to get all reachable stations with travel times
2. For each time band (60, 120, 180, 240, 360, 480, 720, 1440, 2160, 2880):
   a. Filter stations with travel_time <= band
   b. Buffer each station point by `(band - travel_time) * walkSpeedKmPerMin` km using @turf/buffer
   c. Union all buffers into one polygon using @turf/union
     - Handle single-input union: if only one buffer, use it directly
     - Handle multi-polygon results from union
   d. Simplify polygon with tolerance 0.005
   e. Round coordinates to 4 decimal places
3. Return GeoJSON FeatureCollection with each feature having `{duration: minutes}` property

Parameters: maxDuration=2880 (48h), interchangeTime=20min, maxHops=12, walkSpeed=0.15 km/min

#### `scripts/build-data.ts` (orchestrator)
1. Parse all 3 GTFS sources
2. Merge stations (deduplicate by id — KTM ids are numeric, Rapid KL ids start with route code, SG ids start with line code; they won't overlap)
3. Build graph from merged stations + edges
4. Add walkable edges
5. Add transfer edges
6. Compute isochrones from KL Sentral (use station name matching to find "KL SENTRAL" or "KL Sentral" in KTM stations)
7. Compute travel times from KL Sentral to all stations
8. Write output files to `public/data/`:
   - `stations.json`: Station[] (all stations, sorted by name)
   - `station-lookup.json`: {name_lowercase: station_id} (for search autocomplete)
   - `kl-sentral.json`: GeoJSON FeatureCollection with isochrones
   - `travel-times.json`: {from_id: {to_id: minutes, ...}, ...}

Error handling: if a GTFS download fails, log and continue with partial data. Validate that station IDs match between stops.txt and stop_times.txt. Wrap @turf operations in try-catch to handle edge case geometries.

### 3. Frontend (`src/`)
All files are TypeScript that Vite bundles into `dist/`.

#### `src/map.ts`
- Initialize MapLibre GL with OpenFreeMap tiles: `https://tiles.openfreemap.org/styles/liberty` (or fallback to `https://demotiles.maplibre.org/style.json`)
- Center on SE Asia: [102.0, 3.5], zoom 6
- Add navigation controls (zoom + compass)
- Add scale control

#### `src/data-loader.ts`
- Fetch `stations.json`, `kl-sentral.json`, `station-lookup.json`, `travel-times.json` from `./data/` (relative path)
- Return typed objects
- Cache in memory (module-level variables)
- Handle fetch errors with descriptive messages

#### `src/stations.ts`
- On load: fetch station data, add circle markers for all stations
- Marker color: green (#2ECC71) for Malaysia, blue (#3498DB) for Singapore
- Marker size: 6px radius, white stroke 2px
- On click: highlight selected station (pulsing animation), center map on it
- Search: input field with autocomplete dropdown
  - Match typed text against station-lookup.json keys (case-insensitive prefix match)
  - Show top 10 matches in dropdown
  - On select: fly-to station coordinates with smooth animation

#### `src/isochrones.ts`
- After loading kl-sentral.json, add each isochrone polygon as a MapLibre fill layer
- Layer ID format: `isochrone-{duration}`
- Layer config: fill opacity 0.25, line width 1.5, line opacity 0.5, line color matching fill
- Color scheme by duration:
  - 0-1h: #FFD700 (gold)
  - 1-2h: #FF8C00 (orange)
  - 2-3h: #FF6600
  - 3-4h: #FF4500 (red-orange)
  - 4-6h: #DC143C (crimson)
  - 6-8h: #8B0000 (dark red)
  - 8-12h: #4B0082 (indigo)
  - 12-24h: #2E0854 (deep purple)
  - 24-36h: #1A0033 (very dark purple)
  - 36-48h: #0D001A (near black)
- Add a legend UI element showing color ↔ time band mapping

#### `src/slider.ts`
- Create horizontal range input (input type="range") with values 0 to 2880 (minutes), step 30
- Display labels at: 0h, 1h, 2h, 3h, 4h, 6h, 8h, 12h, 18h, 24h, 36h, 48h
- Style slider to be wide, with visible tick marks at label positions
- On input change: update MapLibre layers — show all isochrone bands where band <= current slider value, hide bands where band > slider value
- Display text below slider: "Reachable in Xh Ym — N stations"
- Calculate reachable station count from travel-times.json

#### `src/main.ts`
- Entry point: initialize map, load data, render stations + isochrones, wire up slider
- Show loading spinner while data loads
- Show error message overlay if data files are missing or malformed
- Handle empty states gracefully (no stations found, no isochrones)

### 4. `index.html`
Single HTML page with full-screen map.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>seatransit — How far can you go by train from KL?</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚆</text></svg>">
  <style>
    /* Reset */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; }
    
    /* Map */
    #map { width: 100vw; height: 100vh; }
    
    /* Search overlay - top center */
    #search-overlay {
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
      width: min(400px, calc(100vw - 32px));
    }
    #search-overlay input {
      width: 100%;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      font-size: 15px;
      outline: none;
    }
    #search-results {
      background: white;
      border-radius: 0 0 8px 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      max-height: 240px;
      overflow-y: auto;
      display: none;
    }
    #search-results.visible { display: block; }
    #search-results div {
      padding: 8px 16px;
      cursor: pointer;
      font-size: 14px;
    }
    #search-results div:hover { background: #f0f0f0; }
    
    /* Slider overlay - bottom */
    #slider-overlay {
      position: absolute;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
      background: rgba(255,255,255,0.95);
      backdrop-filter: blur(8px);
      border-radius: 12px;
      padding: 16px 24px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      width: min(600px, calc(100vw - 32px));
    }
    #slider-labels {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #666;
      margin-top: 4px;
    }
    #slider-value {
      text-align: center;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #333;
    }
    input[type="range"] { width: 100%; }
    
    /* Info overlay - right side */
    #info-overlay {
      position: absolute;
      bottom: 120px;
      right: 16px;
      z-index: 10;
      background: rgba(255,255,255,0.9);
      backdrop-filter: blur(8px);
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      font-size: 12px;
      color: #555;
    }
    
    /* Legend */
    #legend {
      position: absolute;
      bottom: 120px;
      left: 16px;
      z-index: 10;
      background: rgba(255,255,255,0.9);
      backdrop-filter: blur(8px);
      border-radius: 8px;
      padding: 10px 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      font-size: 12px;
      color: #555;
    }
    #legend .row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 2px 0;
    }
    #legend .swatch {
      width: 16px;
      height: 4px;
      border-radius: 2px;
    }
    
    /* Loading */
    #loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 20;
      font-size: 18px;
      color: #555;
    }
    
    /* Error */
    #error {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 20;
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.2);
      color: #c00;
      text-align: center;
      max-width: 400px;
      display: none;
    }
    #error.visible { display: block; }
    
    /* Mobile adjustments */
    @media (max-width: 640px) {
      #slider-overlay { padding: 12px 16px; width: calc(100vw - 16px); bottom: 16px; }
      #legend { display: none; }
      #slider-labels { font-size: 9px; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="loading">Loading data...</div>
  <div id="error"></div>
  <div id="search-overlay">
    <input id="search-input" type="text" placeholder="Search stations..." autocomplete="off">
    <div id="search-results"></div>
  </div>
  <div id="legend">
    <div class="row"><span class="swatch" style="background:#FFD700"></span> 0-1h</div>
    <div class="row"><span class="swatch" style="background:#FF8C00"></span> 1-2h</div>
    <div class="row"><span class="swatch" style="background:#FF6600"></span> 2-3h</div>
    <div class="row"><span class="swatch" style="background:#FF4500"></span> 3-4h</div>
    <div class="row"><span class="swatch" style="background:#DC143C"></span> 4-6h</div>
    <div class="row"><span class="swatch" style="background:#8B0000"></span> 6-8h</div>
    <div class="row"><span class="swatch" style="background:#4B0082"></span> 8-12h</div>
    <div class="row"><span class="swatch" style="background:#2E0854"></span> 12-24h</div>
    <div class="row"><span class="swatch" style="background:#1A0033"></span> 24-36h</div>
    <div class="row"><span class="swatch" style="background:#0D001A"></span> 36-48h</div>
  </div>
  <div id="slider-overlay">
    <div id="slider-value">Reachable in 0h 0m — 1 station</div>
    <input type="range" id="time-slider" min="0" max="2880" value="0" step="30">
    <div id="slider-labels">
      <span>0h</span><span>1h</span><span>2h</span><span>3h</span><span>4h</span>
      <span>6h</span><span>8h</span><span>12h</span><span>18h</span><span>24h</span><span>36h</span><span>48h</span>
    </div>
  </div>
  <div id="info-overlay">KL Sentral → ?? stations</div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

### 5. Build & Iterate

```bash
npm run build-data     # Download GTFS -> parse -> compute -> export JSON
npm run build          # Vite bundles frontend
npm run preview        # Serve dist/ at localhost:4173
```

After each change, rebuild and preview. Use agent-browser to validate.

### 6. Self-Validation with agent-browser

Use the **agent-browser** skill to load `http://localhost:4173` and validate:

#### Validation Checklist

**6.1 Data pipeline integrity**
- `public/data/stations.json` exists, is valid JSON, has at least 100 stations
- Each station has `id`, `name`, `lat` (number), `lng` (number), `country` (string)
- `public/data/kl-sentral.json` exists, is valid GeoJSON FeatureCollection
- Has at least 3 features (time bands)
- Each feature has `geometry` with `type: "Polygon"` or `"MultiPolygon"`
- Each feature has `properties.duration` (number)
- `public/data/station-lookup.json` exists, has station name entries
- `public/data/travel-times.json` exists, has kl-sentral entries

**6.2 Map loads visually**
- Navigate to `http://localhost:4173`
- Screenshot the page
- Verify map tiles are rendering (visual: land/water visible)
- Verify map is centered on Southeast Asia region
- Verify navigation controls (zoom +/-) are present

**6.3 Station markers render**
- Wait for data to load (spinner disappears)
- Green and blue circles visible on the map at station locations
- Count: number of visible markers should roughly match stations in KL area

**6.4 Isochrone polygons render**
- Colored polygons visible radiating from KL Sentral area
- Move slider to 4h — verify 4 colored bands visible (1h, 2h, 3h, 4h)
- Move slider to 12h — more bands appear
- Move slider to 48h (max) — all bands visible, reaches Singapore area

**6.5 Slider interaction**
- Default at 0h: only KL Sentral marker visible, no isochrones
- Slide to 1h: 1h isochrone appears, text says "Reachable in 1h 0m"
- Slide to 6h: 6 bands appear, reachable station count increases
- Slide to 48h: all 10 bands, max reachable area, station count at max
- Slide back to 0h: bands disappear (smooth transition)

**6.6 Station search**
- Click search input, type "kl"
- Dropdown shows "KL Sentral" as option
- Click "KL Sentral" — map flies to KL Sentral location
- Type "woodlands" — "Woodlands" appears
- Type nonexistent "zzzzz" — no results, dropdown empty or hidden

**6.7 Legend visibility**
- Legend box visible at bottom-left
- Shows 10 color swatches matching time bands (0-1h through 36-48h)

**6.8 Zero console errors**
- Open browser DevTools Console
- Verify: zero errors, zero failed network requests (no 404s)
- Verify: no unhandled promises or TypeScript runtime errors
- If errors exist, fix the source, rebuild (`npm run build-data && npm run build`), restart preview, re-validate

**6.9 48h reachability**
- Set slider to 2880 (48h)
- Verify isochrones exist (polygons visible)
- Verify reachable stations include SG MRT stations (Singapore MRT)

**6.10 Mobile responsive**
- Use agent-browser to resize to 375x812
- Verify slider is still usable (not cut off)
- Verify search input is still accessible
- Verify legend may be hidden (expected on mobile)

**6.11 Commit and push**
- After all validations pass:
```bash
git add .
git commit -m "feat: working MVP with 48h isochrones"
git push -u origin main
```

### Troubleshooting Common Issues

- **CORS errors with GTFS download**: data.gov.my's S3 bucket may have CORS restrictions. Use `node-fetch` in scripts (Node.js, not browser — no CORS issue)
- **Map tiles not loading**: OpenFreeMap URLs may have changed. Fallback: `https://demotiles.maplibre.org/style.json` for development
- **GTFS time parsing**: Some stop_times use hours > 24 (e.g. `24:05:00` = 1445 minutes). Parse as `h * 60 + m`
- **GTFS BOM**: First line of CSV may start with `\ufeff`. Strip it before splitting columns
- **@turf/union fails**: May throw on single input or invalid geometry. Wrap in try-catch: if only one buffer, use it directly; if union throws, skip that time band
- **Large GeoJSON**: Simplify with tolerance 0.005 first, then 0.01 if >500KB
- **Station ID overlap**: KTM uses numeric IDs, Rapid KL uses route-prefixed IDs, SG uses line-prefixed IDs. No overlap expected
- **KTM KL Sentral ID**: KTM stop_id for KL Sentral is `19100`. Use this as the start station for isochrones
- **SG MRT station names in stops.txt**: SG community GTFS stops.txt uses `location_type` column to distinguish parent stations (stations) from child platforms. Location_type=1 means parent station (this is what we want for markers)
- **Rapid KL frequency-based**: The stop_times for Rapid KL only have one trip per direction per service day; the actual frequency is in frequencies.txt. Average travel time between consecutive stops across all trips to get representative edge durations
