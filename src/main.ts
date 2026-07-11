import "./style.css";
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
  document.querySelector<HTMLElement>('[data-map-action="zoom-in"]')
    ?.addEventListener("click", () => map.zoomIn());
  document.querySelector<HTMLElement>('[data-map-action="zoom-out"]')
    ?.addEventListener("click", () => map.zoomOut());
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
    updateSliderValue(`Reachable in ${formatDuration(maxMinutes)} — ${count} ${count === 1 ? "station" : "stations"}`);
    document.getElementById("info-overlay")!.textContent = `Origin: ${stationName}`;
    document.getElementById("origin-heading")!.textContent = `How far can you go by train from ${stationName}?`;
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
      map.flyTo({
        center: [station.lng, station.lat],
        zoom: station.id === "ktm:19100" ? 6.6 : 8,
        duration: 1000,
      });
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

    const slider = document.getElementById("time-slider") as HTMLInputElement;
    const currentIdx = parseInt(slider.value);
    const maxMinutes = getTimeBandValue(currentIdx);

    renderIsochrones(map, currentIsochrones, maxMinutes);
    markerController?.setSelectedStationId(station.id);
    updateReachableMarkers(maxMinutes);

    setSummary(station, maxMinutes);
  }

  map.on("load", async () => {
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

      setupStationSearch(stations, async (station) => {
        await loadStation(station);
      });

      setupSlider((maxMinutes, bandIndex) => {
        updateReachableMarkers(maxMinutes);
        if (currentIsochrones) {
          renderIsochrones(map, currentIsochrones, maxMinutes);
          setSummary(currentStation, maxMinutes);
        }
      });

      const klSentral = stations.find((s) => s.id === "ktm:19100") || stations[0];
      await loadStation(klSentral);
    } catch (err) {
      loadingEl.style.display = "none";
      errorEl.textContent = `Failed to load data: ${err instanceof Error ? err.message : String(err)}`;
      errorEl.classList.add("visible");
    }
  });
}

main().catch(console.error);
