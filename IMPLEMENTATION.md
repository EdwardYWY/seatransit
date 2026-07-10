# seatransit — Implementation Plan

A static interactive map showing how far you can go by train (and eventually bus/ferry) from any station in Malaysia/Singapore, inspired by [Chronotrains](https://www.chronotrains.com). Hostable on GitHub Pages.

> **Multi-mode compatible**: The graph model is mode-agnostic — train, bus, and ferry schedules all produce the same `station → station + duration` edges. Adding buses or ferries later requires no changes to the graph traversal, isochrone computation, or frontend. Just add more GTFS feeds to the pipeline.

## Architecture Overview

```
seatransit/
├── scripts/                    # Data pipeline (run locally, output to public/data/)
│   ├── build-data.ts           # Orchestrator
│   ├── gtfs-parser.ts          # Parse GTFS -> stations + edges
│   ├── graph.ts                # Station graph (Dijkstra)
│   ├── isochrone-compute.ts    # Isochrone polygon computation
│   └── utils.ts                # Shared helpers
├── src/                        # Vite + TypeScript frontend
│   ├── main.ts                 # Entry point
│   ├── map.ts                  # MapLibre GL setup
│   ├── isochrones.ts           # GeoJSON layer rendering
│   ├── stations.ts             # Station markers + search
│   ├── slider.ts               # Time range slider
│   └── data-loader.ts          # Fetch static JSON
├── public/
│   └── data/                   # Static JSON files (committed to repo)
│       ├── stations.json       # All stations: {id, name, lat, lng, country}
│       ├── kl-sentral.json     # Isochrones for KL Sentral
│       └── travel-times/       # one {to_station: minutes} JSON file per origin
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .github/workflows/deploy.yml
```

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Build tool | **Vite** | Fast, TS-native, static output to `dist/` |
| Map engine | **MapLibre GL JS** | Free, open-source fork of Mapbox GL, no API key needed |
| Map tiles | **OpenFreeMap** ([openfreemap.org](https://openfreemap.org)) | Free tile hosting, no API key required |
| GTFS parsing | **gtfs-utils** npm package | Handles edge cases, validates GTFS spec |
| Geospatial | **@turf/turf** | Buffer, union, simplify for isochrone polygons |
| Frontend | **Vanilla TypeScript** | No framework overhead for a single-page map |
| Styling | **Plain CSS** | Minimal overhead for MVP |

## Data Sources (Validated)

| Source | Coverage | Format | Status |
|--------|----------|--------|--------|
| **KTM** (`api.data.gov.my/gtfs-static/ktmb`) | 191 stations, entire Peninsular MY | GTFS Static | ✅ Ready |
| **Rapid KL** (`api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl`) | 167 stations, Klang Valley | GTFS Static (headway-based) | ✅ Ready |
| **Singapore MRT** (community GTFS) | 110 stations, 6 MRT + 3 LRT lines | GTFS Static | ✅ Ready |
| **Rapid KL Bus** (`rapid-bus-kl`) | Klang Valley buses | GTFS Static + GTFS-RT | ⏳ Future |
| **Rapid Penang Bus** (`rapid-bus-penang`) | Penang island + mainland | GTFS Static + GTFS-RT | ⏳ Future |
| **BAS.MY Stage Buses** (9 endpoints) | Intercity buses across 9 states | GTFS Static | ⏳ Future |
| **Thailand SRT** | Southern Line (Hat Yai, Bangkok) | No GTFS — manual entry | ⏳ Future |
| **China-Laos Railway** | Vientiane → Kunming | No GTFS — manual entry | ⏳ Future |

> Adding bus/ferry feeds is plug-and-play: the same `gtfs-parser.ts` reads bus `stop_times.txt` identically to rail. Buses produce more stations and edges but the graph algorithm and frontend need zero changes. A future frontend toggle could filter "rail only" vs "rail + bus" isochrones.

**Total stations for MVP: ~468** (rail only). With buses: thousands across Malaysia + Singapore.

### Connection Map

```
Thailand (future)         China/Laos (future)
    │                           │
Padang Besar (47300)     ⋮ manual entry
    │ KTM ETS (~3.5h from KL)
Butterworth (100)
    │ KTM ETS
Ipoh (9000)
    │ KTM ETS
KL Sentral (19100) ─── Rapid KL urban rail
    │ KTM Komuter/ETS    (MRT/LRT/Monorail)
Gemas (27800) ─── ERT → Tumpat (east coast)
    │ KTM ETS
JB Sentral (37500)
    │ Shuttle Tebrau (5 min)
Woodlands (37600)
    │ ~2km walk
Woodlands MRT (NS9) ─── Singapore MRT network
```

## Data Pipeline

### Step 1: Download GTFS

Run `scripts/build-data.ts` which:

1. Fetches KTM GTFS from `api.data.gov.my/gtfs-static/ktmb`
2. Fetches Rapid KL from `api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl`
3. Downloads Singapore MRT GTFS from community source
4. Stores raw zips in `data/` (gitignored)

### Step 2: Parse GTFS (`gtfs-parser.ts`)

Uses `gtfs-utils` to read GTFS files into typed arrays:

```typescript
interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: "MY" | "SG";
  agency: "ktm" | "rapidkl" | "sgmrt";
}

interface Edge {
  fromId: string;
  toId: string;
  durationMinutes: number;
  source: "trip" | "walk" | "transfer";
}
```

**Processing rules per agency:**

| Agency | Approach |
|--------|----------|
| **KTM** | Sort stop_times by trip_id + stop_sequence. For consecutive stops, edge = (arrival_{j} - departure_{i}) in minutes |
| **Rapid KL** | Uses frequencies.txt (headway-based). For each trip, compute station-to-station times from stop_times. Average across directions. |
| **SG MRT** | Same as KTM. Filter to route_type=1 only. |

### Step 3: Build Graph (`graph.ts`)

Build adjacency list: `Map<stationId, Map<stationId, number>>`

**Additional edges beyond trip data:**

- **Walkable connections**: Stations within 3km connected at 9 km/h speed
  - KTM Woodlands ↔ SG Woodlands MRT (~2km)
  - KTM KL Sentral ↔ Rapid KL KL Sentral (below 500m)
  - Any KL station pair within 3km
- **Cross-border transfers**: +60 min for customs/immigration at borders
  - Padang Besar (future: KTM ↔ SRT)
- **In-station transfers**: +15 min for same-station modal transfer
  - KTM ↔ Rapid KL at joint stations
  - MRT ↔ LRT at interchange stations

### Step 4: Compute Isochrones (`isochrone-compute.ts`)

Core algorithm (adapted from Chronotrains' MIT-licensed code):

```typescript
function computeIsochrones(
  startStationId: string,
  graph: Graph,
  stations: Map<string, Station>
): GeoJSON.FeatureCollection {
  // Dijkstra BFS from startStationId
  const travelTimes = dijkstra(startStationId, graph, {
    maxDuration: 2880,    // 48 hours
    maxHops: 12,          // max interchanges
    interchangeTime: 20,  // minutes per connection
  });

  // For each time band, create isochrone polygon
  const timeBands = [60, 120, 180, 240, 360, 480, 720, 1440, 2160, 2880];
  const features = timeBands.map(maxTime => {
    const stationsInBand = travelTimes
      .filter(([id, time]) => time <= maxTime)
      .map(([id]) => stations.get(id)!);

    // Buffer each station point by remaining travel budget
    const buffers = stationsInBand.map(s => buffer(
      point([s.lng, s.lat]),
      (maxTime - travelTimes.get(s.id)!) * 0.15, // km/min walking speed
      { units: "kilometers", steps: 20 }
    ));

    // Union all buffers into single polygon
    const unioned = union(...buffers);
    simplify(unioned, { tolerance: 0.005 });

    return feature(unioned, { duration: maxTime });
  });

  return featureCollection(features);
}
```

**Parameters:**

| Parameter | Value | Notes |
|-----------|-------|-------|
| `maxDuration` | 2880 min (48h) | Global-ready from day one |
| `interchangeTime` | 20 min | Standard connection time |
| `borderTime` | 60 min | Customs at international borders |
| `walkSpeed` | 9 km/h | Inter-station walking |
| `maxWalkDistance` | 3 km | Max walkable connection |
| `maxHops` | 12 | Max train changes |

### Step 5: Export Static JSON

Output files written to `public/data/`:

| File | Size (est.) | Contents |
|------|-------------|----------|
| `stations.json` | ~20 KB | Array of all stations with id, name, lat, lng, country |
| `kl-sentral.json` | ~100-300 KB | GeoJSON FeatureCollection with 10 isochrone polygons |
| `travel-times/*.json` | typically 5-25 KB each | `{ "to_id": minutes, ... }` for one origin |

## Frontend

### Pages

| Route | Content |
|-------|---------|
| `index.html` | Full-screen interactive map |
| `about.html` (future) | Methodology, data sources, attribution |

### Map UI Layout

```
┌──────────────────────────────────────────┐
│  [🔍 Search stations...          ]       │
│                                          │
│       ┌──────────────────────────┐       │
│       │                          │       │
│       │   MAPLIBRE GL MAP        │       │
│       │   (SE Asia centered)     │       │
│       │                          │       │
│       │   ▓ 1h isochrone (gold)  │       │
│       │   ▓ 2h isochrone (org)   │       │
│       │   ▓ 4h isochrone (red)   │       │
│       │   ▓ 8h isochrone (purp)  │       │
│       │   ● Station markers      │       │
│       └──────────────────────────┘       │
│                                          │
│  ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐    │
│  0h  1h  2h  3h  4h  6h  8h 12h 24h 48h │
│          ↕ slider knob                    │
│                                          │
│  KL Sentral → Reachable: 85 stns        │
└──────────────────────────────────────────┘
```

### Interaction Flow

1. Page loads → MapLibre centered on SE Asia (lat=3.5, lng=102, zoom=6)
2. `data-loader.ts` fetches `stations.json` and `kl-sentral.json` via HTTP GET
3. Stations plotted as colored markers (green=MY, blue=SG)
4. Default: isochrones for KL Sentral displayed as translucent fill layers
5. Each time band rendered as separate MapLibre layer with distinct color
6. Time slider (HTML range input) filters visible isochrone bands:
   - Slider at 4h → show 1h, 2h, 3h, 4h bands
   - Slider at 48h → show all bands
7. Click on station → highlight that station, center map on it
8. Search box → filter station list, autocomplete, select to center

### Color Scheme

| Time Band | Color | Hex |
|-----------|-------|-----|
| 1h | Gold | `#FFD700` |
| 2h | Orange | `#FF8C00` |
| 3h | Dark Orange | `#FF6600` |
| 4h | Red-Orange | `#FF4500` |
| 6h | Red | `#DC143C` |
| 8h | Crimson | `#8B0000` |
| 12h | Dark Purple | `#4B0082` |
| 24h | Deep Purple | `#2E0854` |
| 36h | Very Dark Purple | `#1A0033` |
| 48h | Near Black | `#0D001A` |

### Data Loading Strategy

- All data files in `public/data/` are committed to git and deployed with the site
- `stations.json` (~20KB) loaded on page start
- `kl-sentral.json` (~100-300KB) loaded on page start
- Future: when clicking a different station, fetch `{stationId}.json` on demand
- No server, no API calls. Everything is static HTTP file serving.

## Git Repository

```bash
cd D:\Documents\Code\seatransit
git init
git remote add origin https://github.com/EdwardYWY/seatransit.git
git branch -M main
# After first commit: git push -u origin main
```

## Implementation Steps

### Phase A — Project Setup

1. `npm create vite@latest . -- --template vanilla-ts` (in existing directory)
2. Install deps: `npm install maplibre-gl @turf/turf gtfs-utils @types/node node-fetch`
3. Install dev deps: `npm install -D typescript gh-pages tsx vite`
4. Create directory structure
5. Set up `vite.config.ts` with `base: './'` for relative paths

### Phase B — Data Pipeline

1. Write `scripts/gtfs-parser.ts` — parse all 3 GTFS sources
2. Write `scripts/graph.ts` — build graph with walkable edges
3. Write `scripts/isochrone-compute.ts` — Dijkstra + turf buffer
4. Write `scripts/build-data.ts` — orchestrate everything
5. Run pipeline → verify output files in `public/data/`

### Phase C — Frontend

1. Set up MapLibre in `src/map.ts` with OpenFreeMap tiles
2. Add station markers from `stations.json` in `src/stations.ts`
3. Render isochrone GeoJSON layers in `src/isochrones.ts`
4. Build time slider in `src/slider.ts`
5. Implement station search in `src/stations.ts`
6. Wire everything together in `src/main.ts`

### Phase D — Deploy

1. Create `.github/workflows/deploy.yml`
2. Configure GitHub Pages to serve from `gh-pages` branch
3. Push to GitHub → verify live site

## Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build-data": "tsx scripts/build-data.ts",
    "preview": "vite preview",
    "deploy": "npm run build-data && npm run build && gh-pages -d dist"
  }
}
```

## Dependencies

```json
{
  "dependencies": {
    "maplibre-gl": "^4.7.0",
    "@turf/turf": "^7.1.0",
    "gtfs-utils": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "gh-pages": "^6.3.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.0.0",
    "node-fetch": "^3.3.0"
  }
}
```

## Future Roadmap

### Post-MVP (Phase E+)

| Feature | Priority | Approach |
|---------|----------|----------|
| All stations as origins | High | Pre-compute isochrones for each station; lazy-load JSON on click |
| **Bus integration** | **Medium** | Add bus GTFS feeds (Rapid KL Bus, Rapid Penang, BAS.MY). Same parser, same graph — mode-agnostic. Add frontend toggle: "Rail only" vs "Rail + Bus" |
| Thailand (SRT) | Medium | Scrape `dticket.railway.co.th` → manual GTFS → add to graph |
| Ferry/boat connections | Medium | Manual entries for Penang ferry, Langkawi ferry, etc. Same edge model |
| China-Laos connection | Low | Manual schedule entry for Vientiane→Kunming |
| Auto data refresh | Low | GitHub Actions cron job (monthly) |
| Station-to-station routing | Low | Show path between two selected stations |
| About page | Low | Plain HTML with methodology docs |
| Multi-language | Low | i18n via JSON files |

> **Multi-mode is seamless**: The graph is `station → station + duration`. Buses, ferries, trains are all just more stations with more edges. The isochrone algorithm and frontend renderer don't care about transport mode. A simple `mode` flag on each edge allows filtering later.

### Global Expansion (KL → Europe via train)

The Trans-Asian Railway corridor:
```
KL Sentral → Padang Besar → Hat Yai → Bangkok → Vientiane (Laos)
→ Kunming (China) → Xi'an → Urumqi → Almaty (Kazakhstan)
→ Moscow → Berlin → Paris/London
```

This requires adding ~15,000km of rail data, but the algorithm stays the same. The slider already supports 48h+.

## Data License Notes

- **KTM + Rapid KL data** from data.gov.my: Malaysian Open Data license
- **Singapore MRT** community GTFS: GitHub repo, attribution required
- **Chronotrains algorithm** (MIT licensed): Adapted from `benjamintd/chronotrains`
- **MapLibre GL**: BSD-3-Clause license
- **OpenFreeMap tiles**: Free for any usage, attribution required
