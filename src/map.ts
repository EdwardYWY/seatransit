import maplibregl from "maplibre-gl";

export function createMap(container: HTMLElement): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        carto: {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
            "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
            "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        },
      },
      layers: [
        {
          id: "carto-voyager",
          type: "raster",
          source: "carto",
          paint: {
            "raster-opacity": 0.9,
            "raster-saturation": -0.25,
            "raster-contrast": 0.12,
          },
        },
      ],
    },
    center: [102.0, 3.5],
    zoom: 6,
    minZoom: 4,
    maxZoom: 14,
    dragRotate: false,
  });

  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.ScaleControl(), "bottom-right");

  return map;
}
