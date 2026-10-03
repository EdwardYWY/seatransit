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
  // Draw under roads and labels so the basemap stays readable.
  const beforeLayer = map.getLayer("building")
    ? "building"
    : map.getLayer("station-circles")
      ? "station-circles"
      : undefined;

  for (const feature of filtered) {
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
        "fill-opacity": 0.62,
      },
    }, beforeLayer);

    map.addLayer({
      id: `${layerId}-edge`,
      type: "line",
      source: subSourceId,
      paint: {
        "line-color": color,
        "line-width": 5,
        "line-blur": 4,
        "line-opacity": 0.18,
      },
    }, beforeLayer);
  }

  addWaterMask(map, beforeLayer);
}

// Re-draw the basemap's water on top of the bands so coverage never shows over the sea.
function addWaterMask(map: maplibregl.Map, beforeLayer: string | undefined): void {
  const water = map.getLayer("water");
  if (!water || water.type !== "fill") return;
  const color = map.getPaintProperty("water", "fill-color") as string | undefined;
  map.addLayer({
    id: "isochrone-water-mask",
    type: "fill",
    source: water.source as string,
    "source-layer": (water as unknown as { sourceLayer: string }).sourceLayer,
    filter: map.getFilter("water") ?? undefined,
    paint: { "fill-color": color ?? "#d4dadc" },
  }, beforeLayer);
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
