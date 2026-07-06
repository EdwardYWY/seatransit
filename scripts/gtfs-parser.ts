import { existsSync, mkdirSync } from "fs";
import { basename, join } from "path";
import AdmZip from "adm-zip";
import { parseCSV, timeToMinutes, type Station, type Edge, type AgencyConfig, AGENCIES } from "./utils";

interface RawStop {
  stop_id: string;
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
  stop_desc?: string;
}

interface RawStopTime {
  trip_id: string;
  stop_id: string;
  stop_sequence: string;
  arrival_time: string;
  departure_time: string;
}

interface RawTrip {
  route_id: string;
  trip_id: string;
  direction_id?: string;
}

interface RawRoute {
  route_id: string;
  route_type: string;
  agency_id?: string;
}

interface RawFrequency {
  trip_id: string;
  start_time: string;
  end_time: string;
  headway_secs: string;
}

function parseGTFSZip(zipPath: string): Record<string, Record<string, string>[]> {
  const files: Record<string, Record<string, string>[]> = {};
  const zip = new AdmZip(zipPath);

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (!entry.entryName.toLowerCase().endsWith(".txt")) continue;
    if (entry.entryName.includes("__MACOSX/") || basename(entry.entryName).startsWith("._")) continue;

    const key = basename(entry.entryName, ".txt");
    files[key] = parseCSV(entry.getData().toString("utf-8"));
  }

  return files;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const { default: fetch } = await import("node-fetch");
  const { createWriteStream } = await import("fs");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  const body = response.body;
  if (!body) throw new Error("No response body");
  const fileStream = createWriteStream(dest);
  await new Promise((resolve, reject) => {
    body.pipe(fileStream);
    body.on("error", reject);
    fileStream.on("finish", resolve);
  });
}

export async function downloadAndParseAgency(config: AgencyConfig, dataDir: string): Promise<{ stations: Station[]; edges: Edge[] }> {
  const zipPath = join(dataDir, `${config.id}.zip`);

  console.log(`Downloading ${config.name} from ${config.url}...`);
  try {
    await downloadFile(config.url, zipPath);
  } catch (err) {
    console.warn(`Failed to download ${config.name}: ${err}. Trying cached if exists...`);
    if (!existsSync(zipPath)) {
      console.error(`No cached data for ${config.name}, skipping.`);
      return { stations: [], edges: [] };
    }
  }

  console.log(`Parsing ${config.name}...`);
  return parseAgencyZip(zipPath, config);
}

export function parseAgencyZip(zipPath: string, config: AgencyConfig): { stations: Station[]; edges: Edge[] } {
  const files = parseGTFSZip(zipPath);
  const stops = files["stops"] as RawStop[] | undefined;
  const stopTimes = files["stop_times"] as RawStopTime[] | undefined;
  const trips = files["trips"] as RawTrip[] | undefined;
  const routes = files["routes"] as RawRoute[] | undefined;
  const frequencies = files["frequencies"] as RawFrequency[] | undefined;

  if (!stops || !stopTimes || !trips || !routes) {
    console.warn(`Missing required GTFS files in ${config.name}`);
    return { stations: [], edges: [] };
  }

  const routeTypeMap = new Map<string, number>();
  for (const r of routes) {
    routeTypeMap.set(r.route_id, parseInt(r.route_type));
  }

  if (config.routeTypeFilter !== undefined) {
    const filteredTripIds = new Set(
      trips.filter((t) => routeTypeMap.get(t.route_id) === config.routeTypeFilter).map((t) => t.trip_id)
    );
  }

  const stations: Station[] = [];
  const stationMap = new Map<string, Station>();

  for (const s of stops) {
    const station: Station = {
      id: `${config.id}:${s.stop_id}`,
      name: s.stop_name,
      lat: parseFloat(s.stop_lat),
      lng: parseFloat(s.stop_lon),
      country: config.country,
      agency: config.id,
    };
    stations.push(station);
    stationMap.set(s.stop_id, station);
  }

  const edges: Edge[] = [];

  const hasFrequencies = frequencies && frequencies.length > 0;

  const tripStopTimes = new Map<string, RawStopTime[]>();
  for (const st of stopTimes) {
    if (config.routeTypeFilter !== undefined) {
      const trip = trips.find((t) => t.trip_id === st.trip_id);
      if (!trip) continue;
      const rt = routeTypeMap.get(trip.route_id);
      if (rt !== config.routeTypeFilter) continue;
    }
    if (!tripStopTimes.has(st.trip_id)) tripStopTimes.set(st.trip_id, []);
    tripStopTimes.get(st.trip_id)!.push(st);
  }

  for (const [tripId, times] of tripStopTimes) {
    times.sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
    for (let i = 0; i < times.length - 1; i++) {
      const cur = times[i];
      const next = times[i + 1];
      if (!cur.arrival_time || !next.arrival_time) continue;
      const dur = timeToMinutes(next.arrival_time) - timeToMinutes(cur.departure_time || cur.arrival_time);
      if (dur <= 0 || dur > 1440) continue;
      const fromStation = stationMap.get(cur.stop_id);
      const toStation = stationMap.get(next.stop_id);
      if (!fromStation || !toStation) continue;
      edges.push({
        fromId: fromStation.id,
        toId: toStation.id,
        durationMinutes: Math.round(dur),
        source: "trip",
      });
    }
  }

  console.log(`  ${config.name}: ${stations.length} stations, ${edges.length} trip edges`);
  return { stations, edges };
}

export async function downloadAllAgencies(dataDir: string): Promise<{ stations: Station[]; edges: Edge[] }> {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  let allStations: Station[] = [];
  let allEdges: Edge[] = [];

  for (const agency of AGENCIES) {
    const result = await downloadAndParseAgency(agency, dataDir);
    allStations.push(...result.stations);
    allEdges.push(...result.edges);
  }

  return { stations: allStations, edges: allEdges };
}
