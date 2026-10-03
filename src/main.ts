import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import maplibregl from "maplibre-gl";
import { createMap } from "./map";
import { addStationMarkers, displayStationName, setupStationSearch } from "./stations";
import { renderIsochrones } from "./isochrones";
import { buildDynamicIsochrones } from "./dynamic-isochrones";
import { setupSlider, updateSliderValue, formatDuration, getTimeBandValue } from "./slider";
import {
  loadStations,
  loadRailSegments,
  loadTravelTimes,
  type RailSegment,
  type StationData,
  type IsochroneCollection,
  type OriginTravelTimes,
} from "./data-loader";

async function main() {
  const loadingEl = document.getElementById("loading")!;
  const errorEl = document.getElementById("error")!;

  const mapContainer = document.getElementById("map")!;
  const map = createMap(mapContainer);
  if (import.meta.env.DEV) {
    (window as unknown as { __seatransitMap?: typeof map }).__seatransitMap = map;
  }

  let currentStation: StationData;
  let currentIsochrones: IsochroneCollection | null = null;
  let currentTravelTimes: OriginTravelTimes = {};
  let allStations: StationData[] = [];
  let allRailSegments: RailSegment[] = [];
  let markerController: ReturnType<typeof addStationMarkers> | null = null;
  let stationCountCache: Map<number, number> = new Map();
  let stationLoadRequest = 0;

  const slider = document.getElementById("time-slider") as HTMLInputElement;
  const playButton = document.getElementById("play-button") as HTMLButtonElement;
  let playTimer: number | undefined;
  let fitTimer: number | undefined;

  // After the slider settles, refit so growth outside the current view is visible.
  function scheduleFit(delay: number) {
    window.clearTimeout(fitTimer);
    fitTimer = window.setTimeout(() => {
      const minutes = getTimeBandValue(parseInt(slider.value));
      if (currentStation && minutes > 0) fitToReachable(currentStation, minutes, currentTravelTimes);
    }, delay);
  }

  function setSliderIndex(index: number) {
    slider.value = String(index);
    slider.dispatchEvent(new Event("input"));
  }

  function stopPlayback() {
    if (playTimer !== undefined) window.clearInterval(playTimer);
    playTimer = undefined;
    playButton.classList.remove("playing");
    playButton.textContent = "▶";
    playButton.setAttribute("aria-label", "Play time animation");
  }

  function startPlayback() {
    const max = Number(slider.max);
    if (Number(slider.value) >= max) setSliderIndex(0);
    playButton.classList.add("playing");
    playButton.textContent = "❚❚";
    playButton.setAttribute("aria-label", "Pause time animation");
    playTimer = window.setInterval(() => {
      const next = Number(slider.value) + 1;
      setSliderIndex(next);
      if (next >= max) stopPlayback();
    }, 900);
  }

  playButton.addEventListener("click", () => (playTimer === undefined ? startPlayback() : stopPlayback()));

  const panel = document.getElementById("control-panel")!;
  const handle = document.getElementById("sheet-handle")!;
  handle.addEventListener("click", () => {
    const expanded = panel.classList.toggle("expanded");
    handle.setAttribute("aria-expanded", String(expanded));
  });
  const infoButton = document.getElementById("info-button")!;
  const dataNote = document.getElementById("data-note")!;
  infoButton.addEventListener("click", () => {
    dataNote.hidden = !dataNote.hidden;
    infoButton.setAttribute("aria-expanded", String(!dataNote.hidden));
  });
  slider.addEventListener("pointerdown", stopPlayback);

  function writeHash(stationId: string, bandIndex: number) {
    const hash = `#s=${encodeURIComponent(stationId)}&t=${bandIndex}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }

  function readHash(): { stationId?: string; band?: number } {
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    const band = Number(params.get("t"));
    return {
      stationId: params.get("s") ?? undefined,
      band: params.has("t") && Number.isInteger(band) && band >= 0 && band <= Number(slider.max) ? band : undefined,
    };
  }

  function fitToReachable(station: StationData, maxMinutes: number, times: OriginTravelTimes) {
    const limit = maxMinutes > 0 ? maxMinutes : 240;
    const bounds = new maplibregl.LngLatBounds([station.lng, station.lat], [station.lng, station.lat]);
    for (const s of allStations) {
      const t = times[s.id];
      if (t !== undefined && t <= limit) bounds.extend([s.lng, s.lat]);
    }
    const mobile = window.innerWidth <= 760;
    const panelHeight = panel.offsetHeight;
    map.fitBounds(bounds, {
      padding: mobile
        ? { top: 70, bottom: panelHeight + 30, left: 30, right: 30 }
        : { top: panelHeight + 90, bottom: 50, left: 40, right: 40 },
      maxZoom: 9,
      duration: 800,
    });
  }

  function reachableStationIdsFor(station: StationData, maxMinutes: number): Set<string> {
    const reachable = new Set<string>([station.id]);
    if (maxMinutes <= 0) return reachable;

    for (const [stationId, minutes] of Object.entries(currentTravelTimes)) {
      if (minutes <= maxMinutes) reachable.add(stationId);
    }
    return reachable;
  }

  function updateReachableMarkers(maxMinutes: number) {
    if (!currentStation || !markerController) return;
    markerController.setReachableStationIds(reachableStationIdsFor(currentStation, maxMinutes));
  }

  function stationCountFor(maxMinutes: number): number {
    if (maxMinutes <= 0) return 1;
    let bestDuration = 0;
    let bestCount = 1;
    for (const [duration, count] of stationCountCache) {
      if (duration <= maxMinutes && duration >= bestDuration) {
        bestDuration = duration;
        bestCount = count;
      }
    }
    return bestCount;
  }

  function setSummary(station: StationData, maxMinutes: number) {
    const count = stationCountFor(maxMinutes);
    const stationName = displayStationName(station.name);
    updateSliderValue(maxMinutes <= 0 ? "Origin only" : `Within ${formatDuration(maxMinutes)} · ${count} ${count === 1 ? "station" : "stations"}`);
    document.getElementById("origin-name")!.textContent = stationName;
  }

  async function loadStation(station: StationData) {
    const requestId = ++stationLoadRequest;
    loadingEl.style.display = "flex";
    loadingEl.textContent = `Loading ${displayStationName(station.name)}...`;
    errorEl.classList.remove("visible");

    try {
      const travelTimes = await loadTravelTimes(station.id);
      if (requestId !== stationLoadRequest) return;
      currentStation = station;
      currentTravelTimes = travelTimes;
      currentIsochrones = buildDynamicIsochrones(station, allStations, allRailSegments, travelTimes);
      fitToReachable(station, getTimeBandValue(parseInt(slider.value)), travelTimes);
    } catch (err) {
      if (requestId !== stationLoadRequest) return;
      loadingEl.style.display = "none";
      errorEl.textContent = `Failed to load ${displayStationName(station.name)}: ${err instanceof Error ? err.message : String(err)}`;
      errorEl.classList.add("visible");
      return;
    }

    loadingEl.style.display = "none";

    stationCountCache.clear();
    for (const f of currentIsochrones.features) {
      stationCountCache.set(f.properties.duration, f.properties.stationCount);
    }

    const currentIdx = parseInt(slider.value);
    const maxMinutes = getTimeBandValue(currentIdx);

    renderIsochrones(map, currentIsochrones, maxMinutes);
    markerController?.setSelectedStationId(station.id);
    updateReachableMarkers(maxMinutes);

    setSummary(station, maxMinutes);
    writeHash(station.id, currentIdx);
  }

  map.once("style.load", async () => {
    try {
      const [stations, railSegments] = await Promise.all([loadStations(), loadRailSegments()]);
      allStations = stations;
      allRailSegments = railSegments;
      loadingEl.style.display = "none";

      markerController = addStationMarkers(map, stations, async (station) => {
        if (currentStation?.id !== station.id) {
          await loadStation(station);
        }
      });

      const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
      const stationById = new Map(stations.map((s) => [s.id, s]));
      map.on("mousemove", "station-circles", (e) => {
        const id = String(e.features?.[0]?.properties?.id ?? "");
        const station = stationById.get(id);
        if (!station) return;
        const isOrigin = station.id === currentStation?.id;
        const minutes = currentTravelTimes[station.id];
        const detail = isOrigin
          ? "Starting point"
          : minutes === undefined
            ? "Not reachable by train from here"
            : `${formatDuration(minutes)} by train · click to start here`;
        const el = document.createElement("div");
        el.className = "station-tip";
        const name = document.createElement("b");
        name.textContent = displayStationName(station.name);
        const sub = document.createElement("span");
        sub.textContent = detail;
        el.append(name, document.createElement("br"), sub);
        tip.setLngLat([station.lng, station.lat]).setDOMContent(el).addTo(map);
      });
      map.on("mouseleave", "station-circles", () => tip.remove());

      setupStationSearch(stations, async (station) => {
        await loadStation(station);
      });

      setupSlider((maxMinutes, bandIndex) => {
        updateReachableMarkers(maxMinutes);
        if (currentIsochrones) {
          renderIsochrones(map, currentIsochrones, maxMinutes);
          setSummary(currentStation, maxMinutes);
          writeHash(currentStation.id, bandIndex);
          scheduleFit(playTimer !== undefined ? 0 : 450);
        }
      });

      const initial = readHash();
      if (initial.band !== undefined) setSliderIndex(initial.band);

      const startStation =
        stations.find((s) => s.id === initial.stationId) ||
        stations.find((s) => s.id === "ktm:19100") ||
        stations[0];
      await loadStation(startStation);
    } catch (err) {
      loadingEl.style.display = "none";
      errorEl.textContent = `Failed to load data: ${err instanceof Error ? err.message : String(err)}`;
      errorEl.classList.add("visible");
    }
  });
}

main().catch(console.error);
