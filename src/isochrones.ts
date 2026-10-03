import maplibregl from "maplibre-gl";
import type { IsochroneCollection, IsochroneFeature } from "./data-loader";

// One muted colour for the whole reachable area, so the basemap stays readable underneath.
const FILL_COLOR = "#4a8799";
const EDGE_COLOR = "#245a6d";
const AREA_OPACITY = 0.42;
const MAX_CANVAS_PX = 3200;
const EDGE_PX = 3;

type Ring = number[][];

function polygonsOf(feature: IsochroneFeature): Ring[][] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates as Ring[]]
    : (feature.geometry.coordinates as Ring[][]);
}

// Web-mercator world coordinates, 0..1.
function worldX(lng: number): number {
  return (lng + 180) / 360;
}
function worldY(lat: number): number {
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
}
function lngOf(x: number): number {
  return x * 360 - 180;
}
function latOf(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

// Painting the shapes onto a canvas merges overlaps for free; a translucent vector fill
// would double-blend wherever the buffers overlap.
function paintArea(feature: IsochroneFeature) {
  const polygons = polygonsOf(feature);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygons) {
    for (const [lng, lat] of poly[0]) {
      const x = worldX(lng), y = worldY(lat);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const pad = 0.002;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const scale = MAX_CANVAS_PX / Math.max(maxX - minX, maxY - minY);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil((maxX - minX) * scale));
  canvas.height = Math.max(1, Math.ceil((maxY - minY) * scale));
  const ctx = canvas.getContext("2d")!;

  const trace = (poly: Ring[]) => {
    ctx.beginPath();
    poly[0].forEach(([lng, lat], i) => {
      const px = (worldX(lng) - minX) * scale;
      const py = (worldY(lat) - minY) * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
  };

  // Edge pass first (slightly expanded), fill pass on top: only the outer boundary keeps the edge colour.
  ctx.lineJoin = "round";
  ctx.lineWidth = EDGE_PX * 2;
  ctx.fillStyle = EDGE_COLOR;
  ctx.strokeStyle = EDGE_COLOR;
  for (const poly of polygons) { trace(poly); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = FILL_COLOR;
  for (const poly of polygons) { trace(poly); ctx.fill(); }

  const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
    [lngOf(minX), latOf(minY)],
    [lngOf(maxX), latOf(minY)],
    [lngOf(maxX), latOf(maxY)],
    [lngOf(minX), latOf(maxY)],
  ];
  return { canvas, coordinates };
}

export function renderIsochrones(
  map: maplibregl.Map,
  isochrones: IsochroneCollection,
  maxBand: number
): void {
  removeIsochrones(map);

  if (maxBand <= 0) return;

  // Largest band that fits inside the selected time.
  const feature = isochrones.features
    .filter((f) => f.properties.duration <= maxBand)
    .sort((a, b) => b.properties.duration - a.properties.duration)[0];
  if (!feature) return;

  // Draw under roads and labels so the basemap stays readable.
  const beforeLayer = map.getLayer("building")
    ? "building"
    : map.getLayer("station-circles")
      ? "station-circles"
      : undefined;

  const { canvas, coordinates } = paintArea(feature);
  map.addSource("isochrone-src", { type: "canvas", canvas, coordinates, animate: false });
  map.addLayer({
    id: "isochrone-area",
    type: "raster",
    source: "isochrone-src",
    paint: { "raster-opacity": AREA_OPACITY, "raster-fade-duration": 0, "raster-resampling": "linear" },
  }, beforeLayer);

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
