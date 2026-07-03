import type { Graph, Station } from "./utils";
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
  type Feature,
  type Polygon,
  type MultiPolygon,
} from "@turf/turf";
import polygonClipping from "polygon-clipping";

const TIME_BANDS = [60, 120, 180, 240, 360, 480, 720, 1440, 2160, 2880];
const TRANSIT_SPEED_KM_PER_MIN = 0.09;
const BUFFER_STEPS = 20;
const INTERCHANGE_TIME = 20;

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
  const { distances } = dijkstra(startStationId, graph, 2880, 12);
  const stationMap = new Map<string, Station>();
  for (const s of stations) stationMap.set(s.id, s);

  const start = stationMap.get(startStationId);
  if (!start) return { type: "FeatureCollection", features: [] };

  const features: GeoJSONFeature[] = [];

  // This intentionally mirrors Chronotrains' generation model: keep an
  // accumulated geometry, expand it by the time delta for each band, then union
  // in destination buffers for stations newly reachable in that band. See
  // benjamintd/chronotrains src/scripts/compute-isochrones.ts.
  let isoGeometry: Feature<Polygon | MultiPolygon> = buffer(
    stationToPoint(start),
    0.1,
    { units: "kilometers", steps: BUFFER_STEPS }
  ) as Feature<Polygon | MultiPolygon>;

  for (let i = 0; i < TIME_BANDS.length; i++) {
    const minTime = TIME_BANDS[i - 1] || -1;
    const maxTime = TIME_BANDS[i];
    const delta = maxTime - minTime;

    const expanded = buffer(isoGeometry, TRANSIT_SPEED_KM_PER_MIN * delta, {
      units: "kilometers",
      steps: BUFFER_STEPS,
    });
    if (expanded) isoGeometry = expanded as Feature<Polygon | MultiPolygon>;

    const stationsInBand = Array.from(distances.entries())
      .filter(([, time]) => time > minTime && time <= maxTime)
      .map(([id]) => stationMap.get(id))
      .filter((s): s is Station => Boolean(s));

    const stationBuffers = stationsInBand
      .map((s) => {
        const travelTime = distances.get(s.id) || 0;
        const radius = Math.min(
          Math.max(maxTime - travelTime, INTERCHANGE_TIME) * TRANSIT_SPEED_KM_PER_MIN,
          maxStationBufferKm(maxTime)
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
      simplify(fc, { tolerance: 0.005, mutate: true });
    } catch {
      // keep unsimplified buffers
    }

    const geoms: polygonClipping.Geom[] = [];
    geomEach(fc, (geom) => {
      geoms.push(geom.coordinates as polygonClipping.Geom);
    });
    geoms.push(isoGeometry.geometry.coordinates as polygonClipping.Geom);

    try {
      const unioned = geoms.length === 1 ? [geoms[0] as any] : polygonClipping.union(geoms[0], ...geoms);
      if (unioned.length === 1) {
        isoGeometry = polygon(unioned[0], { duration: maxTime }) as Feature<Polygon>;
      } else {
        isoGeometry = multiPolygon(unioned, { duration: maxTime }) as Feature<MultiPolygon>;
      }
    } catch {
      // If clipping fails, keep the expanded prior geometry rather than falling
      // back to circles/corridors.
      isoGeometry.properties = { duration: maxTime };
    }

    try {
      simplify(isoGeometry, { tolerance: 0.005, mutate: true });
    } catch {
      // keep unsimplified geometry
    }

    coordEach(isoGeometry, (p) => {
      p[0] = Math.round(p[0] * 1e4) / 1e4;
      p[1] = Math.round(p[1] * 1e4) / 1e4;
    });

    const reachableCount = Array.from(distances.values()).filter((time) => time <= maxTime).length;
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

function maxStationBufferKm(duration: number): number {
  if (duration <= 60) return 7;
  if (duration <= 240) return 12;
  if (duration <= 720) return 18;
  if (duration <= 1440) return 26;
  return 34;
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
  const { distances } = dijkstra(startStationId, graph, 2880, 12);
  const result: Record<string, number> = {};
  for (const [id, time] of distances) {
    if (id !== startStationId) result[id] = time;
  }
  return result;
}
