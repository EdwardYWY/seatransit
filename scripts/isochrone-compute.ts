import { type Graph, type Station, TIME_BANDS } from "./utils";
import { dijkstra } from "./graph";

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
  for (const s of stations) {
    stationMap.set(s.id, s);
  }

  const features: GeoJSONFeature[] = [];

  const WALK_SPEED_KM_PER_MIN = 0.15;

  for (const maxTime of TIME_BANDS) {
    const reachableIds: string[] = [];
    for (const [id, time] of distances) {
      if (time <= maxTime) {
        reachableIds.push(id);
      }
    }

    const points: Array<[number, number]> = [];
    for (const id of reachableIds) {
      const station = stationMap.get(id);
      if (station) {
        points.push([station.lng, station.lat]);
      }
    }

    if (points.length === 0) continue;

    const polygon = convexHull(points);
    if (!polygon) continue;

    const buffered = bufferPolygon(polygon, 0.05);

    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: buffered,
      },
      properties: {
        duration: maxTime,
        fillColor: getColorForBand(maxTime),
        stationCount: reachableIds.length,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function convexHull(points: Array<[number, number]>): Array<[number, number]> | null {
  if (points.length < 3) return null;

  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  };

  const lower: Array<[number, number]> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Array<[number, number]> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function bufferPolygon(ring: Array<[number, number]>, distanceDeg: number): number[][][] {
  if (ring.length < 3) return [ring];

  const buffered: Array<[number, number]> = [];

  for (let i = 0; i < ring.length; i++) {
    const prev = ring[(i - 1 + ring.length) % ring.length];
    const curr = ring[i];
    const next = ring[(i + 1) % ring.length];

    const ax = curr[0] - prev[0];
    const ay = curr[1] - prev[1];
    const len1 = Math.sqrt(ax * ax + ay * ay);
    const nx1 = len1 > 0 ? -ay / len1 : 0;
    const ny1 = len1 > 0 ? ax / len1 : 0;

    const bx = next[0] - curr[0];
    const by = next[1] - curr[1];
    const len2 = Math.sqrt(bx * bx + by * by);
    const nx2 = len2 > 0 ? -by / len2 : 0;
    const ny2 = len2 > 0 ? bx / len2 : 0;

    const mx = nx1 + nx2;
    const my = ny1 + ny2;
    const lenM = Math.sqrt(mx * mx + my * my);
    const factor = lenM > 0 ? distanceDeg / lenM : 1;

    buffered.push([curr[0] + mx * factor, curr[1] + my * factor]);
  }

  return [buffered];
}

function getColorForBand(duration: number): string {
  const colors: Record<number, string> = {
    60: "#FFD700",
    120: "#FF8C00",
    180: "#FF6600",
    240: "#FF4500",
    360: "#DC143C",
    480: "#8B0000",
    720: "#4B0082",
    1440: "#2E0854",
    2160: "#1A0033",
    2880: "#0D001A",
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
    if (id !== startStationId) {
      result[id] = time;
    }
  }
  return result;
}
