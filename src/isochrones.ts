import maplibregl from "maplibre-gl";
import type { IsochroneCollection } from "./data-loader";

export function renderIsochrones(
  map: maplibregl.Map,
  isochrones: IsochroneCollection,
  maxBand: number
): void {
  removeIsochrones(map);

  const sourceId = "isochrones";
  const layerIds: string[] = [];

  map.addSource(sourceId, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [],
    },
  });

  const filtered = isochrones.features.filter(
    (f) => f.properties.duration <= maxBand
  );

  filtered.sort((a, b) => a.properties.duration - b.properties.duration);

  for (const feature of filtered) {
    const duration = feature.properties.duration;
    const color = feature.properties.fillColor;
    const layerId = `isochrone-${duration}`;
    layerIds.push(layerId);

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
        "fill-opacity": 0.3,
      },
    });
  }

  map.addLayer({
    id: "isochrone-borders",
    type: "line",
    source: sourceId,
    paint: {
      "line-color": "#ffffff",
      "line-opacity": 0.5,
      "line-width": 1,
    },
  });
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
