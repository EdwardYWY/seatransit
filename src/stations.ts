import maplibregl from "maplibre-gl";
import type { StationData } from "./data-loader";

export interface StationMarkerController {
  setReachableStationIds(ids: Set<string>): void;
}

export function addStationMarkers(
  map: maplibregl.Map,
  stations: StationData[],
  onClick: (station: StationData) => void
): StationMarkerController {
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const allFeatures = stations.map((s) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [s.lng, s.lat],
    },
    properties: {
      id: s.id,
      name: s.name,
      country: s.country,
      color: s.country === "MY" ? "#38A169" : s.country === "SG" ? "#3182CE" : "#9F7AEA",
    },
  }));

  const makeGeojson = (ids?: Set<string>): GeoJSON.FeatureCollection => ({
    type: "FeatureCollection",
    features: ids ? allFeatures.filter((feature) => ids.has(String(feature.properties.id))) : allFeatures,
  });

  map.addSource("stations", {
    type: "geojson",
    data: makeGeojson(),
  });

  map.addLayer({
    id: "station-circles",
    type: "circle",
    source: "stations",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        ["case", ["in", ["get", "country"], ["literal", ["SG", "TH"]]], 1.8, 2.6],
        8,
        ["case", ["in", ["get", "country"], ["literal", ["SG", "TH"]]], 2.5, 3.6],
        12,
        ["case", ["in", ["get", "country"], ["literal", ["SG", "TH"]]], 4.2, 5.2],
      ],
      "circle-color": ["get", "color"],
      "circle-opacity": 0.88,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 10, 1.1],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": 0.9,
    },
  });

  map.on("click", "station-circles", (e) => {
    if (!e.features?.[0]) return;
    const props = e.features[0].properties;
    if (!props) return;
    const station = stationById.get(String(props.id));
    if (station) onClick(station);
  });

  map.on("mouseenter", "station-circles", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "station-circles", () => {
    map.getCanvas().style.cursor = "";
  });

  return {
    setReachableStationIds(ids: Set<string>) {
      const source = map.getSource("stations") as maplibregl.GeoJSONSource | undefined;
      source?.setData(makeGeojson(ids));
    },
  };
}

export function setupStationSearch(
  stations: StationData[],
  onSelect: (station: StationData) => void
): void {
  const input = document.getElementById("search-input") as HTMLInputElement;
  const results = document.getElementById("search-results") as HTMLDivElement;
  if (!input || !results) return;

  let filtered: StationData[] = [];
  let kbIndex = -1;

  function renderResults(matches: StationData[]) {
    filtered = matches;
    kbIndex = -1;
    results.innerHTML = "";

    for (const station of matches) {
      const div = document.createElement("div");
      div.textContent = `${station.name} (${station.country})`;
      div.setAttribute("role", "option");
      div.addEventListener("click", () => {
        selectStation(station);
      });
      results.appendChild(div);
    }
  }

  function updateKbHighlight() {
    const items = results.querySelectorAll("div");
    items.forEach((el, i) => {
      el.classList.toggle("keyboard-focus", i === kbIndex);
    });
  }

  function selectStation(station: StationData) {
    onSelect(station);
    results.innerHTML = "";
    results.classList.remove("visible");
    input.value = station.name;
    input.setAttribute("aria-expanded", "false");
  }

  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();
    results.innerHTML = "";
    filtered = [];
    kbIndex = -1;
    if (q.length < 1) {
      results.classList.remove("visible");
      input.setAttribute("aria-expanded", "false");
      return;
    }

    const matches = stations
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 10);

    if (matches.length === 0) {
      results.classList.remove("visible");
      input.setAttribute("aria-expanded", "false");
      return;
    }

    renderResults(matches);
    results.classList.add("visible");
    input.setAttribute("aria-expanded", "true");
  });

  input.addEventListener("keydown", (e) => {
    if (!results.classList.contains("visible")) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      kbIndex = Math.min(kbIndex + 1, filtered.length - 1);
      updateKbHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      kbIndex = Math.max(kbIndex - 1, 0);
      updateKbHighlight();
    } else if (e.key === "Enter" && kbIndex >= 0) {
      e.preventDefault();
      selectStation(filtered[kbIndex]);
    } else if (e.key === "Escape") {
      results.innerHTML = "";
      results.classList.remove("visible");
      input.setAttribute("aria-expanded", "false");
      kbIndex = -1;
    }
  });

  document.addEventListener("click", (e) => {
    if (!results.contains(e.target as Node) && e.target !== input) {
      results.innerHTML = "";
      results.classList.remove("visible");
      input.setAttribute("aria-expanded", "false");
    }
  });
}
