import maplibregl from "maplibre-gl";

// OpenFreeMap: free vector tiles with labels, no API key required.
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

export function createMap(container: HTMLElement): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: BASEMAP_STYLE,
    center: [102.0, 3.5],
    zoom: 6,
    minZoom: 4,
    maxZoom: 14,
    dragRotate: false,
    attributionControl: { compact: true },
  });

  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.ScaleControl(), "bottom-right");

  return map;
}
