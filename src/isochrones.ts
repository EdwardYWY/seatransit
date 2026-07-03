import maplibregl from "maplibre-gl";
import type { IsochroneCollection } from "./data-loader";

export function renderIsochrones(
  map: maplibregl.Map,
  isochrones: IsochroneCollection,
  maxBand: number
): void {
  removeIsochrones(map);

  if (maxBand <= 0) return;

  const filtered = isochrones.features.filter(
    (f) => f.properties.duration <= maxBand
  );

  filtered.sort((a, b) => b.properties.duration - a.properties.duration);

  for (let i = 0; i < filtered.length; i++) {
    const feature = filtered[i];
    const duration = feature.properties.duration;
    const color = feature.properties.fillColor;
    const layerId = `isochrone-${duration}`;
    const subSourceId = `isochrone-src-${duration}`;

    map.addSource(subSourceId, {
      type: "geojson",
      data: feature,
    });

    map.addLayer({
      id: layerId,
      type: "fill",
      source: subSourceId,
      paint: {
        "fill-color": color,
        "fill-opacity": 0.52,
      },
    });

    map.addLayer({
      id: `${layerId}-border`,
      type: "line",
      source: subSourceId,
      paint: {
        "line-color": color,
        "line-opacity": 0.72,
        "line-width": i === filtered.length - 1 ? 2.2 : 1.2,
      },
    });
  }
}

export function removeIsochrones(map: maplibregl.Map): void {
  const layers = map.getStyle().layers || [];
  for (const layer of layers) {
    if (layer.id.startsWith("isochrone-")) {
      try { map.removeLayer(layer.id); } catch {}
    }
  }
  const sources = Object.keys(map.getStyle().sources || {});
  for (const src of sources) {
    if (src.startsWith("isochrone")) {
      try { map.removeSource(src); } catch {}
    }
  }
}
