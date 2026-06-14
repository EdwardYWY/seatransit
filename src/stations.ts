import maplibregl from "maplibre-gl";
import type { StationData } from "./data-loader";

export function addStationMarkers(
  map: maplibregl.Map,
  stations: StationData[],
  onClick: (station: StationData) => void
): void {
  const geojson: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: stations.map((s) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [s.lng, s.lat],
      },
      properties: {
        id: s.id,
        name: s.name,
        country: s.country,
        color: s.country === "MY" ? "#2ECC71" : "#3498DB",
      },
    })),
  };

  map.addSource("stations", {
    type: "geojson",
    data: geojson,
  });

  map.addLayer({
    id: "station-circles",
    type: "circle",
    source: "stations",
    paint: {
      "circle-radius": 6,
      "circle-color": ["get", "color"],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  map.on("click", "station-circles", (e) => {
    if (!e.features?.[0]) return;
    const props = e.features[0].properties;
    if (!props) return;
    const station = stations.find((s) => s.id === props.id);
    if (station) onClick(station);
  });

  map.on("mouseenter", "station-circles", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "station-circles", () => {
    map.getCanvas().style.cursor = "";
  });
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
