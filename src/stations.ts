import maplibregl from "maplibre-gl";
import type { StationData } from "./data-loader";

export function addStationMarkers(
  map: maplibregl.Map,
  stations: StationData[],
  onClick: (station: StationData) => void
): maplibregl.Marker[] {
  const markers: maplibregl.Marker[] = [];

  for (const station of stations) {
    const color = station.country === "MY" ? "#4CAF50" : "#2196F3";
    const el = document.createElement("div");
    el.className = "station-marker";
    el.style.width = "8px";
    el.style.height = "8px";
    el.style.borderRadius = "50%";
    el.style.backgroundColor = color;
    el.style.border = "2px solid white";
    el.style.cursor = "pointer";
    el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.4)";
    el.title = station.name;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([station.lng, station.lat])
      .setPopup(new maplibregl.Popup({ offset: 25 }).setText(station.name))
      .addTo(map);

    el.addEventListener("click", () => onClick(station));

    markers.push(marker);
  }

  return markers;
}

export function setupStationSearch(
  stations: StationData[],
  onSelect: (station: StationData) => void
): void {
  const input = document.getElementById("search-input") as HTMLInputElement;
  const results = document.getElementById("search-results") as HTMLUListElement;
  if (!input || !results) return;

  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();
    results.innerHTML = "";
    if (q.length < 1) return;

    const matches = stations
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 10);

    for (const station of matches) {
      const li = document.createElement("li");
      li.textContent = `${station.name} (${station.country})`;
      li.addEventListener("click", () => {
        onSelect(station);
        results.innerHTML = "";
        input.value = station.name;
      });
      results.appendChild(li);
    }
  });

  document.addEventListener("click", (e) => {
    if (!results.contains(e.target as Node) && e.target !== input) {
      results.innerHTML = "";
    }
  });
}
