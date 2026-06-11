import maplibregl from "maplibre-gl";

export function createMap(container: HTMLElement): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: [
            "https://tiles.openfreemap.org/planet/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm",
        },
      ],
    },
    center: [102.0, 3.5],
    zoom: 6,
    minZoom: 4,
    maxZoom: 14,
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");

  return map;
}
