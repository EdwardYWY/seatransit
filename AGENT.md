# AGENT.md — seatransit current state

This file is for coding agents working on this repository. The old implementation prompt is obsolete: the project is no longer a blank scaffold task. Treat this repo as an existing, partially working MVP that needs fixing, validation, and enhancement.

## Project summary

`seatransit` is a static Vite + TypeScript + MapLibre web app showing rail-reachability isochrones around Malaysia, Singapore, and Thailand. The browser supports switching the origin to any station by rendering lightweight dynamic isochrone bands from precomputed travel times.

The app is deployable as static files: data is generated into `public/data/`, Vite copies it into `dist/data/`, and the browser only fetches static JSON plus map tiles.

## Current repo state (2026-07-03)

### What exists

- Frontend source is in `src/`:
  - `src/main.ts` wires map, stations, search, slider, and station loading.
  - `src/map.ts` creates a MapLibre map using CARTO Voyager raster tiles with stronger label contrast.
  - `src/stations.ts` renders small MapLibre circle-layer station markers, high-zoom station labels, and search.
  - `src/dynamic-isochrones.ts` builds short-term dynamic station-buffer isochrone bands in the browser from `stations.json` plus one per-origin file in `travel-times/`.
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
  - `travel-times/*.json` (one small file per origin)
- `npm run build` currently succeeds, with a Vite chunk-size warning because MapLibre/Turf are bundled.
- `npm run build-data` currently parses KTM and Rapid KL GTFS from data.gov.my, an unofficial Singapore rail GTFS feed listed by Transitland, and Thailand rail from Namtang GTFS.

### Important current behavior

- Default origin is `ktm:19100` / KL Sentral.
- The frontend builds dynamic isochrones for all origins instead of fetching per-station isochrone GeoJSON.
- Clicking or searching another station switches the origin, recomputes dynamic isochrone bands in the browser, updates station visibility, and flies the map to the selected station.
- The slider is discrete:
  - HTML range: `min="0" max="10" step="1"`
  - indexes map to `[0,60,120,180,240,360,480,720,1440,2160,2880]`
  - the 0-minute state hides all isochrone bands and shows only the origin marker.
- A file in `travel-times/` is generated for every origin. The frontend loads origins on demand, caches them in memory, and uses the active origin to filter markers and build dynamic isochrone bands/counts.
- Map tiles use CARTO Voyager raster tiles based on OpenStreetMap data.

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
- Thailand rail uses Namtang GTFS:
  - `https://namtang-api.otp.go.th/download/namtang-gtfs.zip`
  - The feed is multimodal; `routeTypeFilter: [1, 2]` keeps train-like route types only.
  - Several long-distance Thai rail trips have placeholder `00:xx` stop times; parser estimates invalid/zero Thai rail segment durations from station distance at 70 km/h.
- Current output after `build-data` is about:
  - 863 stations
  - 378 MY stations, 190 SG stations, 295 TH stations
  - 10 KL Sentral isochrone bands
  - 863 per-origin files in `travel-times/`
- KL Sentral now reaches all 190 SG stations and all 295 TH stations in `travel-times/ktm-19100.json`.
- Singapore Woodlands MRT is about 359 minutes from KL Sentral under current static modeling.
- Hat Yai Junction is about 334 minutes from KL Sentral; farthest imported Thai rail station is about 1566 minutes from KL Sentral.
- Singapore can reach Thailand: Woodlands MRT (`sgmrt:NS9`) reaches all 295 Thai rail stations; Hat Yai Junction is about 693 minutes from Woodlands.
- Path modeling fix increased Dijkstra default `maxHops` to 240 and adds known connector edges:
  - `ktm:25100` Pulau Sebang/Tampin ↔ `ktm:27800` Gemas, because KTM GTFS separates KL-area services from southern Intercity services.
  - `ktm:37400` Holiday Plaza ↔ `ktm:36900` Kempas Bahru, because KTM stop_times references missing stop_id `37200` between them.
  - `ktm:47300` Padang Besar ↔ `thrail:17003` Hat Yai Junction, because the Thailand feed lacks a Padang Besar stop.
  - `ktm:86300` Tumpat ↔ `thrail:17015` Su-Ngai Kolok, eastern MY/TH rail border.

Do not describe the project as authoritative/live-routing data. It uses static GTFS snapshots and several explicit modeling approximations.

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
npm run build-data # passes with KTM, Rapid KL, Singapore rail, and Thailand rail feeds
```

Before claiming anything is fixed, validate in browser with `npm run dev` or `npm run preview` and inspect console/network failures.

## Priority direction from here

### 1. Make the app honestly stable with sample/static data

- Keep dynamic isochrone rendering fast and visually useful without precomputing one GeoJSON file per station.
  - Current short-term implementation renders non-unioned per-band station buffers, not exact network corridors.
- Improve selected-station UX:
  - Marker highlighting/pulsing is not currently implemented despite earlier plans.
  - Current station click opens popup and triggers origin load.
- Keep search behavior intentional: exact and prefix matches should rank ahead of substring matches, and duplicate names must show network/station codes.

### 2. Fix the GTFS ingestion pipeline

This is the largest correctness gap.

Things to inspect/fix:

- Validate the unofficial Singapore GTFS source quality/licensing for production use. It is listed by Transitland as unofficial and appears to be hosted by RushOwl.
- Route filtering logic in `gtfs-parser.ts` has an unused `filteredTripIds` block; clean this up.
- Station filtering for Singapore parent/child stops is not implemented.
- Rapid KL frequencies are not actually used beyond detecting `frequencies` exists.
- Add validation and clear diagnostics for parsed station/edge counts per agency.

### 3. Improve dynamic origin rendering

The product direction is dynamic all-origin selection without precomputing one asset per station.

Next improvements:

- Tune station-buffer sizes/opacities so bands feel organic but do not imply impossible ocean/land coverage.
- Consider rail-corridor geometry or a Web Worker if dynamic rendering becomes heavier at Laos/China scale.
- Keep `public/data/` limited to shared assets and the lightweight per-origin travel-time files unless there is a clear reason to add precomputed isochrone files.

### 4. Improve reachability correctness

- Consider replacing Dijkstra's remaining hop limit with transfer-aware pruning. Current default `maxHops=240` avoids truncating long rail chains but is still a crude guard.
- Border transfer logic is currently distance-based and broad (`MY` to `SG` under 5 km adds 60 min). Replace with explicit border/interchange edges.
- Walkable edges are globally added for any stations within 3 km, which can create unrealistic shortcuts. Consider limiting by urban areas or mode/interchange rules.

### 5. Browser validation checklist

Use this checklist after fixes:

- Page loads without JS console errors.
- No unexpected 404s or failed network requests.
- Map tiles render and attribution is visible.
- Station markers render in Malaysia, Singapore, and Thailand.
- Dynamic isochrones render for KL Sentral and non-default origins such as Woodlands and Hat Yai.
- Slider at 0h hides all bands; higher bands appear as expected.
- Search for `kl`, `woodlands`, and a nonsense string behaves correctly.
- Selecting another station switches origin and renders dynamic isochrones without 404s.
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
  country: "MY" | "SG" | "TH";
}>
```

### Travel times JSON

Each origin has a file at `public/data/travel-times/{safeFilename(originId)}.json`:

```ts
Record<destinationStationId, minutes>
```

## Coding notes

- Keep `vite.config.ts` `base: "./"` for GitHub Pages/static relative paths.
- Browser fetch paths should stay relative (`data/...` or `./data/...`), not absolute `/data/...`.
- Prefer precise changes and validate with `npm run build` after TypeScript changes.
- If changing generated data, mention whether it came from real GTFS or sample fallback.
- Do not reintroduce the old from-scratch scaffold instructions unless explicitly asked.
