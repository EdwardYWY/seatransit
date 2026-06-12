import "./style.css";
import maplibregl from "maplibre-gl";
import { createMap } from "./map";
import { addStationMarkers, setupStationSearch } from "./stations";
import { renderIsochrones, removeIsochrones } from "./isochrones";
import { setupSlider, updateSliderValue, formatDuration, getTimeBandValue } from "./slider";
import {
  loadStations,
  loadIsochrones,
  type StationData,
  type IsochroneCollection,
} from "./data-loader";

async function main() {
  const loadingEl = document.getElementById("loading")!;
  const errorEl = document.getElementById("error")!;

  const mapContainer = document.getElementById("map")!;
  const map = createMap(mapContainer);

  let currentStation: StationData;
  let currentIsochrones: IsochroneCollection | null = null;
  let stationCountCache: Map<number, number> = new Map();

  async function loadStation(station: StationData) {
    currentStation = station;
    loadingEl.style.display = "block";
    loadingEl.textContent = "Loading isochrones...";

    map.flyTo({
      center: [station.lng, station.lat],
      zoom: 8,
      duration: 1000,
    });

    try {
      currentIsochrones = await loadIsochrones(station.id);
    } catch {
      currentIsochrones = { type: "FeatureCollection", features: [] };
    }

    loadingEl.style.display = "none";

    if (currentIsochrones.features.length === 0) {
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

    const count = stationCountCache.get(maxMinutes) || 0;
    updateSliderValue(`Reachable in ${formatDuration(maxMinutes)} — ${count} stations`);
    document.getElementById("info-overlay")!.textContent = station.name;
  }

  map.on("load", async () => {
    try {
      const stations = await loadStations();
      loadingEl.style.display = "none";

      addStationMarkers(map, stations, async (station) => {
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
        if (currentIsochrones) {
          renderIsochrones(map, currentIsochrones, maxMinutes);
          const count = stationCountCache.get(maxMinutes) || 0;
          updateSliderValue(`Reachable in ${formatDuration(maxMinutes)} — ${count} stations`);
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
