import type { Graph, Station } from "./utils";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { dijkstra } from "./graph";
import {
  buffer,
  simplify,
  point,
  featureCollection,
  geomEach,
  polygon,
  multiPolygon,
  coordEach,
  clone,
} from "@turf/turf";
import polygonClipping from "polygon-clipping";

const TIME_BANDS = [60, 120, 180, 240, 360, 480, 720, 1440, 2160, 2880];
const LOCAL_ACCESS_SPEED_KM_PER_MIN = 0.04;
const BUFFER_STEPS = 14;
const INTERCHANGE_TIME = 10;

interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
  properties: Record<string, unknown>;
}

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export function computeIsochrones(
  startStationId: string,
  startStationName: string,
  graph: Graph,
  stations: Station[]
): GeoJSONFeatureCollection {
  const { distances } = dijkstra(startStationId, graph, 2880);
  const stationMap = new Map<string, Station>();
  for (const s of stations) stationMap.set(s.id, s);

  const start = stationMap.get(startStationId);
  if (!start) return { type: "FeatureCollection", features: [] };

  const features: GeoJSONFeature[] = [];

  for (const maxTime of TIME_BANDS) {
    const reachableStations = Array.from(distances.entries())
      .filter(([, time]) => time <= maxTime)
      .map(([id]) => stationMap.get(id))
      .filter((s): s is Station => Boolean(s));

    const stationBuffers = reachableStations
      .map((s) => {
        const travelTime = distances.get(s.id) || 0;
        const remaining = Math.max(maxTime - travelTime, INTERCHANGE_TIME);
        const radius = Math.min(
          remaining * LOCAL_ACCESS_SPEED_KM_PER_MIN,
          maxStationBufferKm(maxTime, s.id === startStationId)
        );
        try {
          return buffer(stationToPoint(s), radius, { units: "kilometers", steps: BUFFER_STEPS });
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Feature<Polygon | MultiPolygon>[];

    const fc = featureCollection(stationBuffers);
    try {
      simplify(fc, { tolerance: 0.003, mutate: true });
    } catch {
      // keep unsimplified buffers
    }

    const geoms: polygonClipping.Geom[] = [];
    geomEach(fc, (geom) => {
      if ("coordinates" in geom) {
        geoms.push(geom.coordinates as polygonClipping.Geom);
      }
    });

    let isoGeometry: Feature<Polygon | MultiPolygon> | null = null;
    try {
      if (geoms.length === 1) {
        isoGeometry = polygon(geoms[0] as any, { duration: maxTime }) as Feature<Polygon>;
      } else if (geoms.length > 1) {
        const unioned = polygonClipping.union(geoms[0], ...geoms.slice(1));
        isoGeometry = unioned.length === 1
          ? polygon(unioned[0], { duration: maxTime }) as Feature<Polygon>
          : multiPolygon(unioned, { duration: maxTime }) as Feature<MultiPolygon>;
      }
    } catch {
      isoGeometry = stationBuffers[0] ? clone(stationBuffers[0]) as Feature<Polygon | MultiPolygon> : null;
    }

    if (!isoGeometry) continue;

    try {
      simplify(isoGeometry, { tolerance: 0.003, mutate: true });
    } catch {
      // keep unsimplified geometry
    }

    coordEach(isoGeometry, (p) => {
      p[0] = Math.round(p[0] * 1e4) / 1e4;
      p[1] = Math.round(p[1] * 1e4) / 1e4;
    });

    const reachableCount = reachableStations.length;
    const feature = clone(isoGeometry) as unknown as GeoJSONFeature;
    feature.properties = {
      duration: maxTime,
      fillColor: getColorForBand(maxTime),
      stationCount: reachableCount,
    };
    features.push(feature);
  }

  return { type: "FeatureCollection", features };
}

function stationToPoint(s: Station) {
  return point([s.lng, s.lat]);
}

function maxStationBufferKm(duration: number, isOrigin = false): number {
  if (isOrigin) return duration <= 60 ? 5 : 8;
  if (duration <= 60) return 3;
  if (duration <= 240) return 5;
  if (duration <= 720) return 7;
  if (duration <= 1440) return 9;
  return 11;
}

function getColorForBand(duration: number): string {
  const colors: Record<number, string> = {
    // Chronotrains-style ramp: hot/red near the origin, fading to yellow for
    // longer travel times. Keep later SEA-specific bands pale rather than dark.
    60: "#D96B52",
    120: "#E8895E",
    180: "#F0A96B",
    240: "#F4C977",
    360: "#F6DA8A",
    480: "#F8E8A8",
    720: "#FAF0C4",
    1440: "#FBF5D6",
    2160: "#FCF8E6",
    2880: "#FEFBF1",
  };
  return colors[duration] || "#333333";
}

export function computeTravelTimes(
  startStationId: string,
  graph: Graph
): Record<string, number> {
  const { distances } = dijkstra(startStationId, graph, 2880);
  const result: Record<string, number> = {};
  for (const [id, time] of distances) {
    if (id !== startStationId) result[id] = time;
  }
  return result;
}
