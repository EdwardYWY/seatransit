import "./style.css";
import maplibregl from "maplibre-gl";
import { createMap } from "./map";
import { addStationMarkers, setupStationSearch } from "./stations";
import { renderIsochrones, removeIsochrones } from "./isochrones";
import { setupSlider, getTimeBandValue } from "./slider";
import {
  loadStations,
  loadIsochrones,
  type StationData,
  type IsochroneCollection,
} from "./data-loader";

async function main() {
  const mapContainer = document.getElementById("map")!;
  const map = createMap(mapContainer);

  let currentStation: StationData;
  let currentIsochrones: IsochroneCollection | null = null;

  const stationNameEl = document.getElementById("station-name")!;
  const stationCountEl = document.getElementById("station-count")!;

  async function loadStation(station: StationData) {
    currentStation = station;
    stationNameEl.textContent = station.name;
    stationCountEl.textContent = "Loading...";

    map.flyTo({
      center: [station.lng, station.lat],
      zoom: 8,
      duration: 1000,
    });

    currentIsochrones = await loadIsochrones(station.id);
    if (currentIsochrones.features.length === 0) {
      stationCountEl.textContent = "No isochrone data available";
      return;
    }

    const slider = document.getElementById("time-slider") as HTMLInputElement;
    const currentIdx = parseInt(slider.value);
    const maxMinutes = getTimeBandValue(currentIdx);

    renderIsochrones(map, currentIsochrones, maxMinutes);

    const lastFeature = currentIsochrones.features[currentIsochrones.features.length - 1];
    stationCountEl.textContent = `${lastFeature.properties.stationCount} stations reachable`;
  }

  map.on("load", async () => {
    const stations = await loadStations();

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

    setupSlider(async (maxMinutes, _bandIndex) => {
      if (currentIsochrones) {
        renderIsochrones(map, currentIsochrones, maxMinutes);
      }
    });

    const klSentral = stations.find((s) => s.id === "ktm:19100") || stations[0];
    await loadStation(klSentral);
  });
}

main().catch(console.error);
