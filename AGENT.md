# AGENT.md — seatransit current state

This file is for coding agents working on this repository. The old implementation prompt is obsolete: the project is no longer a blank scaffold task. Treat this repo as an existing, partially working MVP that needs fixing, validation, and enhancement.

## Project summary

`seatransit` is a static Vite + TypeScript + MapLibre web app showing rail-reachability isochrones around Malaysia/Singapore. It currently focuses on KL Sentral as the default origin, with early support for per-station origins when a matching precomputed GeoJSON file exists.

The app is deployable as static files: data is generated into `public/data/`, Vite copies it into `dist/data/`, and the browser only fetches static JSON plus map tiles.

## Current repo state (2026-07-03)

### What exists

- Frontend source is in `src/`:
  - `src/main.ts` wires map, stations, search, slider, and station loading.
  - `src/map.ts` creates a MapLibre map using softened CARTO light raster tiles.
  - `src/stations.ts` renders small MapLibre circle-layer station markers and implements search.
  - `src/isochrones.ts` removes/re-adds MapLibre fill/line layers for visible bands.
  - `src/slider.ts` uses a discrete 10-position slider for time bands.
  - `src/data-loader.ts` fetches static JSON from `data/` and maps station IDs to filenames by replacing `:` with `-`.
  - `src/style.css` contains all UI styling.
- Data pipeline source is in `scripts/`:
  - `scripts/build-data.ts` orchestrates download/parse/fallback/sample data, graph build, station JSON, one default isochrone, and all-pairs-ish travel times.
  - `scripts/gtfs-parser.ts` tries to download and parse GTFS zips.
  - `scripts/graph.ts` builds an undirected weighted graph, adds walkable edges, transfer-like same-name edges, and Malaysia/Singapore border edges.
  - `scripts/isochrone-compute.ts` runs Dijkstra and builds Turf buffer/union isochrones.
  - `scripts/utils.ts` has shared types, agency URLs, CSV parsing, distance, and time helpers.
- Static generated data currently exists in `public/data/`:
  - `stations.json`
  - `station-lookup.json`
  - `ktm-19100.json` (default KL Sentral isochrones)
  - `travel-times.json`
- `npm run build` currently succeeds, with a Vite chunk-size warning because MapLibre/Turf are bundled.
- `npm run build-data` currently parses KTM and Rapid KL GTFS from data.gov.my plus an unofficial Singapore rail GTFS feed listed by Transitland.

### Important current behavior

- Default origin is `ktm:19100` / KL Sentral.
- Default isochrone filename is `public/data/ktm-19100.json`, not `kl-sentral.json`.
- Clicking or searching another station attempts to load `public/data/<safe-station-id>.json` (example: `rapidkl-KJ15.json`). Most stations do **not** have matching isochrone files yet, so the UI shows “No isochrone data”.
- The slider is discrete:
  - HTML range: `min="0" max="10" step="1"`
  - indexes map to `[0,60,120,180,240,360,480,720,1440,2160,2880]`
  - the 0-minute state hides all isochrone bands and shows only the origin marker.
- `travel-times.json` is generated for every origin. The frontend uses it to hide station markers that are not reachable from the current origin at the current slider time; station counts still come from each isochrone feature when isochrone data exists.
- Map tiles use CARTO light raster tiles based on OpenStreetMap data.

## Data reality and limitations

The GTFS pipeline is not production-grade yet.

Observed when running `npm run build-data`:

- KTM GTFS downloads and parses successfully.
- Rapid KL GTFS downloads and parses successfully.
- Singapore MRT uses an unofficial Transitland-listed feed:
  - `https://cdn.rushowl.app/rushtrail-app/gtfs-feed/gtfs-feed-lta.zip`
  - Transitland feed page: `https://www.transit.land/feeds/f-w21z-lta`
  - This feed includes bus and rail; `routeTypeFilter: 1` keeps rail trips/stops only.
- Because KTM/Rapid KL/SG rail parse now succeeds, the sample/demo fallback is no longer used unless every agency fails.
- Current output after `build-data` is about:
  - 568 stations
  - 378 MY stations, 190 SG stations
  - 10 KL Sentral isochrone bands
  - 568 origins in `travel-times.json`
- KL Sentral now reaches all 190 SG stations in `travel-times.json`; nearest SG rail stations are about 357-360 minutes from KL Sentral under current static modeling.
- Path modeling fix increased Dijkstra default `maxHops` to 240 and adds two known KTM connector edges:
  - `ktm:25100` Pulau Sebang/Tampin ↔ `ktm:27800` Gemas, because KTM GTFS separates KL-area services from southern Intercity services.
  - `ktm:37400` Holiday Plaza ↔ `ktm:36900` Kempas Bahru, because KTM stop_times references missing stop_id `37200` between them.

Do not describe the project as using authoritative live GTFS data until the parser/download issues are fixed and validated.

## Commands

```bash
npm install
npm run build-data
npm run build
npm run dev
npm run preview
```

Notes:

- `npm run build-data` may overwrite files in `public/data/`.
- `npm run build` copies `public/data/` into `dist/data/`.
- `npm run deploy` runs `build-data`, `build`, and `gh-pages -d dist`.

## Current build/validation status

Last checked:

```bash
npm run build      # passes, Vite chunk-size warning only
npm run build-data # passes, but uses sample fallback data
```

Before claiming anything is fixed, validate in browser with `npm run dev` or `npm run preview` and inspect console/network failures.

## Priority direction from here

### 1. Make the app honestly stable with sample/static data

- Avoid console/network noise when selecting stations without precomputed isochrones.
  - A 404 from `fetch(data/<station>.json)` is expected today but should not be treated as a scary runtime failure.
  - Consider checking an index/manifest of available isochrones or precomputing all origins.
- Improve selected-station UX:
  - Marker highlighting/pulsing is not currently implemented despite earlier plans.
  - Current station click opens popup and triggers origin load.
- Make search behavior intentional:
  - It currently matches `includes`, not prefix/autocomplete from `station-lookup.json`.
  - `station-lookup.json` is generated but not used by frontend.

### 2. Fix the GTFS ingestion pipeline

This is the largest correctness gap.

Things to inspect/fix:

- Validate the unofficial Singapore GTFS source quality/licensing for production use. It is listed by Transitland as unofficial and appears to be hosted by RushOwl.
- Route filtering logic in `gtfs-parser.ts` has an unused `filteredTripIds` block; clean this up.
- Station filtering for Singapore parent/child stops is not implemented.
- Rapid KL frequencies are not actually used beyond detecting `frequencies` exists.
- Add validation and clear diagnostics for parsed station/edge counts per agency.

### 3. Decide the product scope for origins

Current code suggests dynamic per-station origin selection, but data only has KL Sentral isochrones.

Pick one direction:

- **KL-only MVP**: simplify UI copy and behavior so selecting a station just flies/opens info, not “origin switching”. Keep only `ktm-19100.json`.
- **All-origin MVP**: update `build-data.ts` to compute isochrone JSON for every station and add an `isochrone-index.json` manifest so the frontend knows what is available. Watch output size and build time.

### 4. Improve reachability correctness

- Consider replacing Dijkstra's remaining hop limit with transfer-aware pruning. Current default `maxHops=240` avoids truncating long rail chains but is still a crude guard.
- Border transfer logic is currently distance-based and broad (`MY` to `SG` under 5 km adds 60 min). Replace with explicit border/interchange edges.
- Walkable edges are globally added for any stations within 3 km, which can create unrealistic shortcuts. Consider limiting by urban areas or mode/interchange rules.

### 5. Browser validation checklist

Use this checklist after fixes:

- Page loads without JS console errors.
- No unexpected 404s or failed network requests.
- Map tiles render and attribution is visible.
- Station markers render in Malaysia and Singapore.
- KL Sentral default isochrones render.
- Slider at 0h hides all bands; higher bands appear as expected.
- Search for `kl`, `woodlands`, and a nonsense string behaves correctly.
- Selecting a station without isochrone data shows a graceful, non-broken state.
- Mobile width around 375px keeps search and slider usable.

## File/data contracts

### Station JSON

`public/data/stations.json`:

```ts
Array<{
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: "MY" | "SG";
}>
```

### Isochrone JSON

Per-origin file named by `safeFilename(station.id)`, where `:` becomes `-`.

Example: `ktm:19100` -> `public/data/ktm-19100.json`

```ts
{
  type: "FeatureCollection",
  features: Array<{
    type: "Feature",
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown },
    properties: {
      duration: number;
      fillColor: string;
      stationCount: number;
    }
  }>
}
```

### Travel times JSON

`public/data/travel-times.json`:

```ts
Record<originStationId, Record<destinationStationId, minutes>>
```

## Coding notes

- Keep `vite.config.ts` `base: "./"` for GitHub Pages/static relative paths.
- Browser fetch paths should stay relative (`data/...` or `./data/...`), not absolute `/data/...`.
- Prefer precise changes and validate with `npm run build` after TypeScript changes.
- If changing generated data, mention whether it came from real GTFS or sample fallback.
- Do not reintroduce the old from-scratch scaffold instructions unless explicitly asked.
