import maplibregl from "maplibre-gl";
import type { StationData } from "./data-loader";

export interface StationMarkerController {
  setReachableStationIds(ids: Set<string>): void;
  setSelectedStationId(id: string): void;
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
      name: displayStationName(s.name),
      country: s.country,
      color: s.country === "MY" ? "#38A169" : s.country === "SG" ? "#3182CE" : "#9F7AEA",
    },
  }));

  let reachableIds: Set<string> | undefined;
  let selectedStationId: string | undefined;

  const makeGeojson = (ids = reachableIds): GeoJSON.FeatureCollection => ({
    type: "FeatureCollection",
    features: (ids ? allFeatures.filter((feature) => ids.has(String(feature.properties.id))) : allFeatures)
      .map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          selected: feature.properties.id === selectedStationId,
        },
      })),
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
        ["case", ["get", "selected"], 8, ["case", ["in", ["get", "country"], ["literal", ["SG", "TH"]]], 1.8, 2.6]],
        8,
        ["case", ["get", "selected"], 8, ["case", ["in", ["get", "country"], ["literal", ["SG", "TH"]]], 2.5, 3.6]],
        12,
        ["case", ["get", "selected"], 8, ["case", ["in", ["get", "country"], ["literal", ["SG", "TH"]]], 4.2, 5.2]],
      ],
      "circle-color": ["case", ["get", "selected"], "#0f172a", ["get", "color"]],
      "circle-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4,
        ["case", ["get", "selected"], 0.98, 0.16],
        7,
        ["case", ["get", "selected"], 0.98, 0.48],
        10,
        ["case", ["get", "selected"], 0.98, 0.88],
      ],
      "circle-stroke-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        ["case", ["get", "selected"], 3, 0.6],
        10,
        ["case", ["get", "selected"], 3, 1.1],
      ],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4,
        ["case", ["get", "selected"], 1, 0.2],
        7,
        ["case", ["get", "selected"], 1, 0.58],
        10,
        ["case", ["get", "selected"], 1, 0.9],
      ],
    },
  });

  map.addLayer({
    id: "station-labels",
    type: "symbol",
    source: "stations",
    minzoom: 9.5,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 9.5, 10, 12, 12.5, 14, 14],
      "text-offset": [0, 0.9],
      "text-anchor": "top",
      "text-allow-overlap": false,
      "text-ignore-placement": false,
    },
    paint: {
      "text-color": "#1f2937",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.4,
      "text-halo-blur": 0.4,
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
      reachableIds = ids;
      const source = map.getSource("stations") as maplibregl.GeoJSONSource | undefined;
      source?.setData(makeGeojson(ids));
    },
    setSelectedStationId(id: string) {
      selectedStationId = id;
      const source = map.getSource("stations") as maplibregl.GeoJSONSource | undefined;
      source?.setData(makeGeojson());
    },
  };
}

export function displayStationName(name: string): string {
  const displayName = name.split(";").pop()?.trim() || name.trim();
  if (displayName !== displayName.toUpperCase()) return displayName;
  return displayName
    .split(/\s+/)
    .map((part) => part.length <= 3 ? part : `${part[0]}${part.slice(1).toLowerCase()}`)
    .join(" ");
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

    matches.forEach((station, index) => {
      const div = document.createElement("div");
      div.id = `station-option-${index}`;
      div.textContent = stationResultLabel(station);
      div.setAttribute("role", "option");
      div.setAttribute("aria-selected", "false");
      div.addEventListener("click", () => {
        selectStation(station);
      });
      results.appendChild(div);
    });
  }

  function updateKbHighlight() {
    const items = results.querySelectorAll("div");
    items.forEach((el, i) => {
      const selected = i === kbIndex;
      el.classList.toggle("keyboard-focus", selected);
      el.setAttribute("aria-selected", String(selected));
    });
    if (kbIndex >= 0) {
      input.setAttribute("aria-activedescendant", `station-option-${kbIndex}`);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function closeResults() {
    results.innerHTML = "";
    results.classList.remove("visible");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    filtered = [];
    kbIndex = -1;
  }

  function selectStation(station: StationData) {
    onSelect(station);
    closeResults();
    input.value = displayStationName(station.name);
  }

  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();
    results.innerHTML = "";
    filtered = [];
    kbIndex = -1;
    input.removeAttribute("aria-activedescendant");
    if (q.length < 1) {
      closeResults();
      return;
    }

    const matches = stations
      .filter((s) => displayStationName(s.name).toLowerCase().includes(q))
      .sort((a, b) => searchRank(a, q) - searchRank(b, q) || displayStationName(a.name).localeCompare(displayStationName(b.name)))
      .slice(0, 10);

    if (matches.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.setAttribute("role", "status");
      empty.textContent = "No stations found";
      results.appendChild(empty);
      results.classList.add("visible");
      input.setAttribute("aria-expanded", "true");
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
      if (filtered.length === 0) return;
      kbIndex = (kbIndex + 1) % filtered.length;
      updateKbHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length === 0) return;
      kbIndex = kbIndex <= 0 ? filtered.length - 1 : kbIndex - 1;
      updateKbHighlight();
    } else if (e.key === "Enter" && kbIndex >= 0) {
      e.preventDefault();
      selectStation(filtered[kbIndex]);
    } else if (e.key === "Escape") {
      closeResults();
    }
  });

  document.addEventListener("click", (e) => {
    if (!results.contains(e.target as Node) && e.target !== input) {
      closeResults();
    }
  });
}

function searchRank(station: StationData, query: string): number {
  const name = displayStationName(station.name).toLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  return 2;
}

function stationResultLabel(station: StationData): string {
  const [network, code = ""] = station.id.split(":");
  const networkLabels: Record<string, string> = {
    ktm: "KTM",
    sgmrt: "Singapore MRT",
    rapidkl: "Rapid KL",
    thrail: "Thailand Rail",
  };
  const details = [station.country, networkLabels[network] || network.toUpperCase(), code]
    .filter(Boolean)
    .join(" · ");
  return `${displayStationName(station.name)} (${details})`;
}
