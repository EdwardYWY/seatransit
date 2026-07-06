import "./style.css";
import { createMap } from "./map";
import { addStationMarkers, setupStationSearch } from "./stations";
import { renderIsochrones, removeIsochrones } from "./isochrones";
import { setupSlider, updateSliderValue, formatDuration, getTimeBandValue } from "./slider";
import {
  loadStations,
  loadIsochrones,
  loadTravelTimes,
  type StationData,
  type IsochroneCollection,
  type TravelTimes,
} from "./data-loader";

async function main() {
  const loadingEl = document.getElementById("loading")!;
  const errorEl = document.getElementById("error")!;

  const mapContainer = document.getElementById("map")!;
  const map = createMap(mapContainer);

  let currentStation: StationData;
  let currentIsochrones: IsochroneCollection | null = null;
  let currentTravelTimes: TravelTimes = {};
  let markerController: ReturnType<typeof addStationMarkers> | null = null;
  let stationCountCache: Map<number, number> = new Map();

  function reachableStationIdsFor(station: StationData, maxMinutes: number): Set<string> {
    const reachable = new Set<string>([station.id]);
    if (maxMinutes <= 0) return reachable;

    const timesFromOrigin = currentTravelTimes[station.id] || {};
    for (const [stationId, minutes] of Object.entries(timesFromOrigin)) {
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
    updateSliderValue(`Reachable in ${formatDuration(maxMinutes)} — ${count} stations`);
    document.getElementById("info-overlay")!.textContent = `Origin: ${station.name}`;
  }

  async function loadStation(station: StationData) {
    currentStation = station;
    loadingEl.style.display = "block";
    loadingEl.textContent = "Loading isochrones...";

    map.flyTo({
      center: [station.lng, station.lat],
      zoom: station.id === "ktm:19100" ? 6.6 : 8,
      duration: 1000,
    });

    try {
      currentIsochrones = await loadIsochrones(station.id);
    } catch {
      currentIsochrones = { type: "FeatureCollection", features: [] };
    }

    loadingEl.style.display = "none";

    if (currentIsochrones.features.length === 0) {
      const slider = document.getElementById("time-slider") as HTMLInputElement;
      const maxMinutes = getTimeBandValue(parseInt(slider.value));
      updateReachableMarkers(maxMinutes);
      updateSliderValue(`${station.name} — No isochrone data`);
      return;
    }

    stationCountCache.clear();
    for (const f of currentIsochrones.features) {
      stationCountCache.set(f.properties.duration, f.properties.stationCount);
    }

    const slider = document.getElementById("time-slider") as HTMLInputElement;
    const currentIdx = parseInt(slider.value);
    const maxMinutes = getTimeBandValue(currentIdx);

    renderIsochrones(map, currentIsochrones, maxMinutes);
    updateReachableMarkers(maxMinutes);

    setSummary(station, maxMinutes);
  }

  map.on("load", async () => {
    try {
      const [stations, travelTimes] = await Promise.all([
        loadStations(),
        loadTravelTimes(),
      ]);
      currentTravelTimes = travelTimes;
      loadingEl.style.display = "none";

      markerController = addStationMarkers(map, stations, async (station) => {
        if (currentStation?.id !== station.id) {
          removeIsochrones(map);
          await loadStation(station);
        }
      });

      setupStationSearch(stations, async (station) => {
        removeIsochrones(map);
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
