import type { Graph, Station } from "./utils";
import { dijkstra } from "./graph";
import { buffer, union, simplify, point } from "@turf/turf";

const TIME_BANDS = [60, 120, 180, 240, 360, 480, 720, 1440, 2160, 2880];

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

  for (const maxTime of TIME_BANDS) {
    const reachableIds: string[] = [];
    for (const [id, time] of distances) {
      if (time <= maxTime) {
        reachableIds.push(id);
      }
    }

    const reachableStations: Station[] = [];
    for (const id of reachableIds) {
      const s = stationMap.get(id);
      if (s) reachableStations.push(s);
    }

    if (reachableStations.length < 2) {
      if (reachableStations.length === 1) {
        const s = reachableStations[0];
        features.push({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[
              [s.lng - 0.01, s.lat - 0.01],
              [s.lng + 0.01, s.lat - 0.01],
              [s.lng + 0.01, s.lat + 0.01],
              [s.lng - 0.01, s.lat + 0.01],
              [s.lng - 0.01, s.lat - 0.01],
            ]],
          },
          properties: {
            duration: maxTime,
            fillColor: getColorForBand(maxTime),
            stationCount: 1,
          },
        });
      }
      continue;
    }

    let merged: any = null;
    for (const s of reachableStations) {
      const travelTime = distances.get(s.id)!;
      const remainingBudget = maxTime - travelTime;
      const bufKm = Math.min(Math.max(remainingBudget * 0.15, 2), 100);
      try {
        const pt = point([s.lng, s.lat]);
        const buf = buffer(pt, bufKm, { units: "kilometers", steps: 64 });
        if (!merged) {
          merged = buf;
        } else if (buf) {
          merged = union(merged, buf);
        }
      } catch {
        // skip failed buffer
      }
    }

    if (!merged) continue;

    let simplified: any;
    try {
      simplified = simplify(merged, { tolerance: 0.003, highQuality: true });
    } catch {
      simplified = merged;
    }

    const geom = simplified.geometry || simplified;
    if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) continue;

    const coords = JSON.parse(JSON.stringify(geom.coordinates));
    roundCoords(coords, 5);

    features.push({
      type: "Feature",
      geometry: {
        type: geom.type as "Polygon" | "MultiPolygon",
        coordinates: coords,
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

function roundCoords(coords: any, decimals: number): void {
  if (typeof coords[0] === "number") {
    coords[0] = parseFloat(coords[0].toFixed(decimals));
    coords[1] = parseFloat(coords[1].toFixed(decimals));
  } else if (Array.isArray(coords)) {
    for (const c of coords) roundCoords(c, decimals);
  }
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
