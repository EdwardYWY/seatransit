export interface StationData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: "MY" | "SG" | "TH";
}

export interface IsochroneFeature {
  type: "Feature";
  geometry: Polygon | MultiPolygon;
  properties: {
    duration: number;
    fillColor: string;
    stationCount: number;
  };
}

export interface IsochroneCollection {
  type: "FeatureCollection";
  features: IsochroneFeature[];
}

export type OriginTravelTimes = Record<string, number>;

let cachedStations: StationData[] | null = null;
const cachedTravelTimes = new Map<string, OriginTravelTimes>();

function safeFilename(id: string): string {
  return id.replace(/:/g, "-");
}

export async function loadStations(): Promise<StationData[]> {
  if (cachedStations) return cachedStations;
  const resp = await fetch("data/stations.json");
  if (!resp.ok) throw new Error(`Station data request failed (${resp.status})`);
  cachedStations = await resp.json();
  return cachedStations!;
}

export async function loadTravelTimes(stationId: string): Promise<OriginTravelTimes> {
  const cached = cachedTravelTimes.get(stationId);
  if (cached) return cached;
  const resp = await fetch(`data/travel-times/${safeFilename(stationId)}.json`);
  if (!resp.ok) throw new Error(`Travel-time data request failed (${resp.status})`);
  const data: OriginTravelTimes = await resp.json();
  cachedTravelTimes.set(stationId, data);
  return data;
}
import type { MultiPolygon, Polygon } from "geojson";
