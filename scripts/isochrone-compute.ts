import type { Graph, Station } from "./utils";
import { dijkstra } from "./graph";
import { buffer, simplify, point, lineString } from "@turf/turf";

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
  for (const s of stations) stationMap.set(s.id, s);

  const features: GeoJSONFeature[] = [];

  for (const maxTime of TIME_BANDS) {
    const reachableIds = new Set<string>();
    for (const [id, time] of distances) {
      if (time <= maxTime) reachableIds.add(id);
    }

    const reachableStations: Station[] = [];
    for (const id of reachableIds) {
      const s = stationMap.get(id);
      if (s) reachableStations.push(s);
    }
    if (reachableStations.length === 0) continue;

    // Important: don't draw "remaining walking budget" circles. Chronotrains'
    // useful visual metaphor is a rail-shaped reachable region. So we buffer
    // reachable rail graph segments into corridors, then add only small station
    // blobs. This keeps the output branchy/linear instead of circular.
    const parts: any[] = [];
    const corridorKm = corridorWidthKm(maxTime);
    const stationKm = stationBlobKm(maxTime);

    const seenSegments = new Set<string>();
    for (const [fromId, neighbors] of graph) {
      if (!reachableIds.has(fromId)) continue;
      const fromStation = stationMap.get(fromId);
      const fromTime = distances.get(fromId);
      if (!fromStation || fromTime === undefined) continue;

      for (const [toId, edgeMinutes] of neighbors) {
        if (!reachableIds.has(toId)) continue;
        const toStation = stationMap.get(toId);
        const toTime = distances.get(toId);
        if (!toStation || toTime === undefined) continue;

        if (Math.max(fromTime, toTime) > maxTime) continue;
        if (Math.min(fromTime, toTime) + edgeMinutes > maxTime + 30) continue;

        const key = [fromId, toId].sort().join("|");
        if (seenSegments.has(key)) continue;
        seenSegments.add(key);

        try {
          const line = lineString([
            [fromStation.lng, fromStation.lat],
            [toStation.lng, toStation.lat],
          ]);
          const corridor = buffer(line, corridorKm, { units: "kilometers", steps: 6 });
          if (corridor) parts.push(corridor);
        } catch {
          // skip failed segment
        }
      }
    }

    for (const s of reachableStations) {
      try {
        const blob = buffer(point([s.lng, s.lat]), stationKm, { units: "kilometers", steps: 8 });
        if (blob) parts.push(blob);
      } catch {
        // skip failed station
      }
    }

    if (parts.length === 0) continue;

    // Do not union these into a single convex-looking blob. Keeping the pieces
    // as a MultiPolygon preserves the rail-corridor shape and is much faster for
    // the current sample graph.
    const merged = multiPolygonFallback(parts);
    if (!merged) continue;

    let simplified: any;
    try {
      simplified = simplify(merged, { tolerance: 0.004, highQuality: false });
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
        stationCount: reachableIds.size,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

function multiPolygonFallback(parts: any[]): any {
  const polygons: number[][][][] = [];
  for (const part of parts) {
    const geom = part.geometry;
    if (!geom) continue;
    if (geom.type === "Polygon") polygons.push(geom.coordinates);
    if (geom.type === "MultiPolygon") polygons.push(...geom.coordinates);
  }
  if (polygons.length === 0) return null;
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "MultiPolygon", coordinates: polygons },
  };
}

function corridorWidthKm(duration: number): number {
  if (duration <= 60) return 3;
  if (duration <= 240) return 5;
  if (duration <= 720) return 8;
  if (duration <= 1440) return 11;
  return 14;
}

function stationBlobKm(duration: number): number {
  if (duration <= 60) return 3.5;
  if (duration <= 240) return 5;
  if (duration <= 720) return 7;
  if (duration <= 1440) return 9;
  return 11;
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
    if (id !== startStationId) result[id] = time;
  }
  return result;
}
