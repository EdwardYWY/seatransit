import { type Station, type Edge, type Graph, haversineKm } from "./utils";

const MAX_WALK_DISTANCE = 3;
const WALK_SPEED = 9;
const TRANSFER_TIME = 15;
const BORDER_TIME = 60;
const DEFAULT_MAX_HOPS = 240;

export const KNOWN_RAIL_CONNECTORS: ReadonlyArray<readonly [string, string, number, string]> = [
  ["ktm:25100", "ktm:27800", 45, "Pulau Sebang/Tampin ↔ Gemas"],
  ["ktm:37400", "ktm:36900", 10, "Holiday Plaza ↔ Kempas Bahru"],
  ["ktm:47300", "thrail:17003", 60, "Padang Besar ↔ Hat Yai Junction"],
  ["ktm:86300", "thrail:17015", 60, "Tumpat ↔ Su-Ngai Kolok"],
];

export function buildGraph(stations: Station[], edges: Edge[]): Graph {
  const graph: Graph = new Map();

  for (const station of stations) {
    graph.set(station.id, new Map());
  }

  for (const edge of edges) {
    addEdge(graph, edge.fromId, edge.toId, edge.durationMinutes);
  }

  addWalkableEdges(graph, stations);
  addTransferEdges(graph, stations);
  addKnownRailConnectorEdges(graph, stations);
  addBorderEdges(graph, stations);

  return graph;
}

function addEdge(graph: Graph, fromId: string, toId: string, durationMinutes: number): void {
  const fromEdges = graph.get(fromId);
  const toEdges = graph.get(toId);
  if (!fromEdges || !toEdges) return;

  const existing = fromEdges.get(toId);
  if (existing === undefined || durationMinutes < existing) {
    fromEdges.set(toId, durationMinutes);
  }
  const existingRev = toEdges.get(fromId);
  if (existingRev === undefined || durationMinutes < existingRev) {
    toEdges.set(fromId, durationMinutes);
  }
}

function addWalkableEdges(graph: Graph, stations: Station[]): void {
  let added = 0;
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const a = stations[i];
      const b = stations[j];
      const dist = haversineKm(a.lat, a.lng, b.lat, b.lng);
      if (dist <= MAX_WALK_DISTANCE) {
        const time = Math.round((dist / WALK_SPEED) * 60);
        if (time > 0 && time < 60) {
          addEdge(graph, a.id, b.id, time);
          added++;
        }
      }
    }
  }
  console.log(`  Walkable edges added: ${added}`);
}

function addTransferEdges(graph: Graph, stations: Station[]): void {
  const byName = new Map<string, Station[]>();
  for (const s of stations) {
    const normalized = s.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!byName.has(normalized)) byName.set(normalized, []);
    byName.get(normalized)!.push(s);
  }

  let added = 0;
  for (const [, group] of byName) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const dist = haversineKm(group[i].lat, group[i].lng, group[j].lat, group[j].lng);
        if (dist < 0.5) {
          addEdge(graph, group[i].id, group[j].id, TRANSFER_TIME);
          added++;
        }
      }
    }
  }
  console.log(`  Transfer edges added: ${added}`);
}

function addKnownRailConnectorEdges(graph: Graph, stations: Station[]): void {
  const stationIds = new Set(stations.map((s) => s.id));
  let added = 0;
  for (const [fromId, toId, minutes] of KNOWN_RAIL_CONNECTORS) {
    if (!stationIds.has(fromId) || !stationIds.has(toId)) continue;
    addEdge(graph, fromId, toId, minutes);
    added++;
  }
  console.log(`  Known rail connector edges added: ${added}`);
}

function addBorderEdges(graph: Graph, stations: Station[]): void {
  const myStations = stations.filter((s) => s.country === "MY");
  const sgStations = stations.filter((s) => s.country === "SG");
  const thStations = stations.filter((s) => s.country === "TH");

  let added = 0;
  added += addCountryBorderEdges(graph, myStations, sgStations, 5, BORDER_TIME);
  added += addCountryBorderEdges(graph, myStations, thStations, 8, BORDER_TIME);
  console.log(`  Border edges added: ${added}`);
}

function addCountryBorderEdges(
  graph: Graph,
  aStations: Station[],
  bStations: Station[],
  maxDistanceKm: number,
  borderTimeMinutes: number
): number {
  let added = 0;
  for (const a of aStations) {
    for (const b of bStations) {
      const dist = haversineKm(a.lat, a.lng, b.lat, b.lng);
      if (dist < maxDistanceKm) {
        addEdge(graph, a.id, b.id, borderTimeMinutes);
        added++;
      }
    }
  }
  return added;
}

export interface DijkstraResult {
  distances: Map<string, number>;
  reachableStationIds: string[];
}

export function dijkstra(
  startId: string,
  graph: Graph,
  maxDuration: number = 2880,
  maxHops: number = DEFAULT_MAX_HOPS
): DijkstraResult {
  const distances = new Map<string, number>();
  const hops = new Map<string, number>();
  const visited = new Set<string>();
  const pq: Array<{ id: string; dist: number; hop: number }> = [];

  distances.set(startId, 0);
  hops.set(startId, 0);
  pq.push({ id: startId, dist: 0, hop: 0 });

  while (pq.length > 0) {
    pq.sort((a, b) => a.dist - b.dist);
    const current = pq.shift()!;

    if (visited.has(current.id)) continue;
    visited.add(current.id);

    if (current.dist >= maxDuration) continue;

    const neighbors = graph.get(current.id);
    if (!neighbors) continue;

    for (const [neighborId, edgeDuration] of neighbors) {
      const newDist = current.dist + edgeDuration;
      const newHop = current.hop + 1;

      if (newHop > maxHops) continue;
      if (newDist > maxDuration) continue;

      const existingDist = distances.get(neighborId);
      if (existingDist === undefined || newDist < existingDist) {
        distances.set(neighborId, Math.round(newDist));
        hops.set(neighborId, newHop);
        pq.push({ id: neighborId, dist: newDist, hop: newHop });
      }
    }
  }

  const reachableStationIds = Array.from(distances.keys()).filter((id) => id !== startId);

  return { distances, reachableStationIds };
}
