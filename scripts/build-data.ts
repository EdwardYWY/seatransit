import { writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { downloadAllAgencies } from "./gtfs-parser";
import { buildGraph, dijkstra } from "./graph";
import { computeIsochrones } from "./isochrone-compute";
import { type Station, type Edge } from "./utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "..", "data");
const PUBLIC_DIR = join(__dirname, "..", "public", "data");

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function generateSampleData(): { stations: Station[]; edges: Edge[] } {
  console.log("Generating sample station data for demo...\n");

  const myStations: Station[] = [
    { id: "ktm:19100", name: "KL Sentral", lat: 3.1342, lng: 101.6865, country: "MY", agency: "ktm" },
    { id: "ktm:9000", name: "Ipoh", lat: 4.5971, lng: 101.0751, country: "MY", agency: "ktm" },
    { id: "ktm:47300", name: "Padang Besar", lat: 6.6628, lng: 100.3241, country: "MY", agency: "ktm" },
    { id: "ktm:100", name: "Butterworth", lat: 5.3983, lng: 100.3698, country: "MY", agency: "ktm" },
    { id: "ktm:27800", name: "Gemas", lat: 2.5833, lng: 102.6167, country: "MY", agency: "ktm" },
    { id: "ktm:37500", name: "JB Sentral", lat: 1.4624, lng: 103.7646, country: "MY", agency: "ktm" },
    { id: "ktm:37600", name: "Woodlands", lat: 1.4433, lng: 103.7720, country: "MY", agency: "ktm" },
    { id: "ktm:26000", name: "Seremban", lat: 2.7249, lng: 101.9409, country: "MY", agency: "ktm" },
    { id: "ktm:14600", name: "Tanjung Malim", lat: 3.6833, lng: 101.5167, country: "MY", agency: "ktm" },
    { id: "ktm:24400", name: "Nilai", lat: 2.8167, lng: 101.8000, country: "MY", agency: "ktm" },
    { id: "ktm:24900", name: "Batu Caves", lat: 3.2333, lng: 101.6833, country: "MY", agency: "ktm" },
    { id: "ktm:6000", name: "Alor Setar", lat: 6.1167, lng: 100.3667, country: "MY", agency: "ktm" },
    { id: "ktm:14000", name: "Tapah Road", lat: 4.1667, lng: 101.2000, country: "MY", agency: "ktm" },
    { id: "ktm:8100", name: "Taiping", lat: 4.8500, lng: 100.7333, country: "MY", agency: "ktm" },
    { id: "ktm:19700", name: "Kuala Lumpur", lat: 3.1390, lng: 101.6869, country: "MY", agency: "ktm" },
    { id: "ktm:17600", name: "Shah Alam", lat: 3.0833, lng: 101.5333, country: "MY", agency: "ktm" },
    { id: "ktm:25400", name: "Port Klang", lat: 3.0000, lng: 101.3833, country: "MY", agency: "ktm" },
    { id: "ktm:10800", name: "Kampar", lat: 4.3000, lng: 101.1500, country: "MY", agency: "ktm" },
    { id: "ktm:35000", name: "Segamat", lat: 2.5000, lng: 102.8167, country: "MY", agency: "ktm" },
    { id: "ktm:34400", name: "Tampin", lat: 2.4667, lng: 102.2333, country: "MY", agency: "ktm" },
  ];

  const rapidStations: Station[] = [
    { id: "rapidkl:KJ1", name: "Gombak", lat: 3.2000, lng: 101.7333, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ15", name: "KL Sentral (Rapid)", lat: 3.1345, lng: 101.6860, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ24", name: "Pasar Seni", lat: 3.1333, lng: 101.6833, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ13", name: "KLCC", lat: 3.1500, lng: 101.7167, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ10", name: "Damai", lat: 3.1667, lng: 101.7167, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:MRT1", name: "Kajang", lat: 2.9833, lng: 101.7833, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:MRT2", name: "Muzium Negara", lat: 3.1350, lng: 101.6850, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:AG1", name: "Sentul Timur", lat: 3.1833, lng: 101.7000, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:AG18", name: "Chan Sow Lin", lat: 3.1333, lng: 101.7167, country: "MY", agency: "rapidkl" },
  ];

  const sgStations: Station[] = [
    { id: "sgmrt:NS9", name: "Woodlands MRT", lat: 1.4360, lng: 103.7860, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:NS1", name: "Jurong East", lat: 1.3330, lng: 103.7400, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:NS27", name: "Marina Bay", lat: 1.2790, lng: 103.8540, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:EW1", name: "Pasir Ris", lat: 1.3720, lng: 103.9490, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:EW24", name: "Outram Park", lat: 1.2810, lng: 103.8390, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:CC1", name: "Dhoby Ghaut", lat: 1.2990, lng: 103.8460, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:NE1", name: "HarbourFront", lat: 1.2650, lng: 103.8220, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:NE17", name: "Punggol", lat: 1.4050, lng: 103.9020, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:DT1", name: "Bukit Panjang", lat: 1.3780, lng: 103.7640, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:DT35", name: "Expo", lat: 1.3350, lng: 103.9620, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:CG1", name: "Changi Airport", lat: 1.3570, lng: 103.9890, country: "SG", agency: "sgmrt" },
  ];

  const allStations = [...myStations, ...rapidStations, ...sgStations];
  const edges: Edge[] = [];

  function addTripEdge(fromId: string, toId: string, dur: number) {
    edges.push({ fromId, toId, durationMinutes: dur, source: "trip" });
  }

  addTripEdge("ktm:19100", "ktm:9000", 150);
  addTripEdge("ktm:9000", "ktm:47300", 90);
  addTripEdge("ktm:9000", "ktm:100", 30);
  addTripEdge("ktm:19100", "ktm:26000", 45);
  addTripEdge("ktm:26000", "ktm:27800", 30);
  addTripEdge("ktm:27800", "ktm:37500", 90);
  addTripEdge("ktm:37500", "ktm:37600", 5);
  addTripEdge("ktm:19100", "ktm:14600", 60);
  addTripEdge("ktm:14600", "ktm:9000", 90);
  addTripEdge("ktm:19100", "ktm:19700", 5);
  addTripEdge("ktm:19700", "ktm:17600", 15);
  addTripEdge("ktm:17600", "ktm:25400", 30);
  addTripEdge("ktm:26000", "ktm:24400", 15);
  addTripEdge("ktm:24400", "ktm:19100", 30);
  addTripEdge("ktm:9000", "ktm:10800", 20);
  addTripEdge("ktm:10800", "ktm:14000", 15);
  addTripEdge("ktm:14000", "ktm:8100", 25);
  addTripEdge("ktm:8100", "ktm:100", 20);
  addTripEdge("ktm:47300", "ktm:6000", 30);
  addTripEdge("ktm:26000", "ktm:34400", 20);
  addTripEdge("ktm:27800", "ktm:35000", 40);
  addTripEdge("ktm:24900", "ktm:19100", 20);

  addTripEdge("rapidkl:KJ1", "rapidkl:KJ10", 15);
  addTripEdge("rapidkl:KJ10", "rapidkl:KJ13", 8);
  addTripEdge("rapidkl:KJ13", "rapidkl:KJ15", 10);
  addTripEdge("rapidkl:KJ15", "rapidkl:KJ24", 3);
  addTripEdge("rapidkl:MRT1", "rapidkl:MRT2", 25);
  addTripEdge("rapidkl:AG1", "rapidkl:AG18", 15);
  addTripEdge("rapidkl:AG18", "rapidkl:KJ15", 10);
  addTripEdge("rapidkl:KJ24", "rapidkl:AG18", 5);

  addTripEdge("sgmrt:NS9", "sgmrt:NS1", 20);
  addTripEdge("sgmrt:NS1", "sgmrt:NS27", 25);
  addTripEdge("sgmrt:NS1", "sgmrt:EW1", 30);
  addTripEdge("sgmrt:EW1", "sgmrt:EW24", 20);
  addTripEdge("sgmrt:EW24", "sgmrt:CC1", 5);
  addTripEdge("sgmrt:CC1", "sgmrt:NS27", 5);
  addTripEdge("sgmrt:CC1", "sgmrt:NE1", 8);
  addTripEdge("sgmrt:NS27", "sgmrt:NE17", 20);
  addTripEdge("sgmrt:DT1", "sgmrt:DT35", 35);
  addTripEdge("sgmrt:CG1", "sgmrt:DT35", 10);

  return { stations: allStations, edges };
}

async function main() {
  console.log("=== SEA Transit Data Builder ===\n");

  ensureDir(DATA_DIR);
  ensureDir(PUBLIC_DIR);

  let stations: Station[];
  let edges: Edge[];

  console.log("Attempting to download GTFS data...\n");

  try {
    const result = await downloadAllAgencies(DATA_DIR);
    stations = result.stations;
    edges = result.edges;

    if (stations.length === 0) {
      console.warn("\nNo GTFS data downloaded. Using sample data instead.\n");
      const sample = generateSampleData();
      stations = sample.stations;
      edges = sample.edges;
    }
  } catch (err) {
    console.warn(`\nGTFS download failed: ${err}`);
    console.log("Falling back to sample data.\n");
    const sample = generateSampleData();
    stations = sample.stations;
    edges = sample.edges;
  }

  console.log(`\nTotal stations: ${stations.length}`);
  console.log(`Total edges: ${edges.length}`);

  console.log("\nBuilding graph...");
  const graph = buildGraph(stations, edges);
  console.log(`Graph has ${graph.size} nodes`);

  console.log("\nWriting stations.json...");
  const stationsOutput = stations.map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    country: s.country,
  }));
  writeFileSync(join(PUBLIC_DIR, "stations.json"), JSON.stringify(stationsOutput));

  console.log("Writing station-lookup.json...");
  const lookup: Record<string, string> = {};
  for (const s of stations) {
    const key = s.name.toLowerCase();
    if (!lookup[key]) lookup[key] = s.id;
  }
  writeFileSync(join(PUBLIC_DIR, "station-lookup.json"), JSON.stringify(lookup));

  function safeFilename(id: string): string {
    return id.replace(/:/g, "-");
  }

  const defaultStation = stations.find((s) => s.id === "ktm:19100") || stations[0];
  console.log(`\nComputing isochrones for ${defaultStation.name} (${defaultStation.id})...`);
  const isochrones = computeIsochrones(defaultStation.id, defaultStation.name, graph, stations);
  writeFileSync(
    join(PUBLIC_DIR, `${safeFilename(defaultStation.id)}.json`),
    JSON.stringify(isochrones)
  );
  console.log(`  ${isochrones.features.length} isochrone bands written`);

  console.log("\nComputing travel-times.json...");
  const travelTimes: Record<string, Record<string, number>> = {};
  let count = 0;
  for (const station of stations) {
    const { distances } = dijkstra(station.id, graph, 2880, 12);
    const times: Record<string, number> = {};
    for (const [id, dist] of distances) {
      if (id !== station.id) {
        times[id] = dist;
      }
    }
    travelTimes[station.id] = times;
    count++;
    if (count % 10 === 0) console.log(`  ${count}/${stations.length} stations processed`);
  }
  writeFileSync(join(PUBLIC_DIR, "travel-times.json"), JSON.stringify(travelTimes));
  console.log(`  Travel times for ${Object.keys(travelTimes).length} origin stations`);

  console.log("\n=== Build complete! ===");
  console.log(`Output: ${PUBLIC_DIR}`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
