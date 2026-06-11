export interface StationData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: "MY" | "SG";
}

export interface IsochroneFeature {
  type: "Feature";
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
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

export interface TravelTimes {
  [fromId: string]: {
    [toId: string]: number;
  };
}

export interface StationLookup {
  [name: string]: string;
}

let cachedStations: StationData[] | null = null;
let cachedIsochrones: Map<string, IsochroneCollection> = new Map();
let cachedTravelTimes: TravelTimes | null = null;
let cachedLookup: StationLookup | null = null;

function safeFilename(id: string): string {
  return id.replace(/:/g, "-");
}

export async function loadStations(): Promise<StationData[]> {
  if (cachedStations) return cachedStations;
  const resp = await fetch("data/stations.json");
  cachedStations = await resp.json();
  return cachedStations!;
}

export async function loadIsochrones(stationId: string): Promise<IsochroneCollection> {
  const cached = cachedIsochrones.get(stationId);
  if (cached) return cached;
  const resp = await fetch(`data/${safeFilename(stationId)}.json`);
  if (!resp.ok) {
    return { type: "FeatureCollection", features: [] };
  }
  const data: IsochroneCollection = await resp.json();
  cachedIsochrones.set(stationId, data);
  return data;
}

export async function loadTravelTimes(): Promise<TravelTimes> {
  if (cachedTravelTimes) return cachedTravelTimes;
  const resp = await fetch("data/travel-times.json");
  cachedTravelTimes = await resp.json();
  return cachedTravelTimes!;
}

export async function loadStationLookup(): Promise<StationLookup> {
  if (cachedLookup) return cachedLookup;
  const resp = await fetch("data/station-lookup.json");
  cachedLookup = await resp.json();
  return cachedLookup!;
}
