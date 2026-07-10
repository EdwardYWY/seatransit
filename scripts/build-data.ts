import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { downloadAllAgencies } from "./gtfs-parser";
import { buildGraph, dijkstra } from "./graph";
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

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  function interpolateStations(id1: string, id2: string, lat1: number, lng1: number, lat2: number, lng2: number, steps: number, prefix: string, country: "MY" | "SG" | "TH", agency: Station["agency"]): Station[] {
    const result: Station[] = [];
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      result.push({
        id: `${prefix}:int-${id1}-${id2}-${i}`,
        name: "",
        lat: lerp(lat1, lat2, t),
        lng: lerp(lng1, lng2, t),
        country,
        agency,
      });
    }
    return result;
  }

  function addInterpolatedEdges(edges: Edge[], mainId: string, intPrefix: string, intSuffix: string, stepDuration: number, steps: number) {
    let prev = mainId;
    for (let i = 1; i < steps; i++) {
      const curr = `${intPrefix}:int-${intSuffix}-${i}`;
      edges.push({ fromId: prev, toId: curr, durationMinutes: stepDuration, source: "trip" });
      prev = curr;
    }
    edges.push({ fromId: prev, toId: mainId, durationMinutes: stepDuration, source: "trip" });
  }

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
    { id: "ktm:5001", name: "Sungai Petani", lat: 5.6470, lng: 100.4870, country: "MY", agency: "ktm" },
    { id: "ktm:5002", name: "Bukit Mertajam", lat: 5.3630, lng: 100.4670, country: "MY", agency: "ktm" },
    { id: "ktm:5003", name: "Nibong Tebal", lat: 5.1710, lng: 100.4800, country: "MY", agency: "ktm" },
    { id: "ktm:5004", name: "Parit Buntar", lat: 4.4760, lng: 100.6420, country: "MY", agency: "ktm" },
    { id: "ktm:5005", name: "Slim River", lat: 3.8300, lng: 101.4000, country: "MY", agency: "ktm" },
    { id: "ktm:5006", name: "Bidor", lat: 4.1140, lng: 101.2880, country: "MY", agency: "ktm" },
    { id: "ktm:5007", name: "Kuala Kangsar", lat: 4.7740, lng: 100.9360, country: "MY", agency: "ktm" },
    { id: "ktm:5008", name: "Arau", lat: 6.4300, lng: 100.2740, country: "MY", agency: "ktm" },
    { id: "ktm:5009", name: "Batang Kali", lat: 3.4680, lng: 101.6300, country: "MY", agency: "ktm" },
    { id: "ktm:5010", name: "Rawang", lat: 3.3220, lng: 101.5760, country: "MY", agency: "ktm" },
    { id: "ktm:5011", name: "Kepong", lat: 3.2100, lng: 101.6400, country: "MY", agency: "ktm" },
    { id: "ktm:5012", name: "Segambut", lat: 3.1800, lng: 101.6700, country: "MY", agency: "ktm" },
    { id: "ktm:5013", name: "Putra", lat: 3.1630, lng: 101.6900, country: "MY", agency: "ktm" },
    { id: "ktm:5014", name: "Mid Valley", lat: 3.1160, lng: 101.6760, country: "MY", agency: "ktm" },
    { id: "ktm:5015", name: "Seputeh", lat: 3.1020, lng: 101.6830, country: "MY", agency: "ktm" },
    { id: "ktm:5016", name: "Salak Selatan", lat: 3.0880, lng: 101.6910, country: "MY", agency: "ktm" },
    { id: "ktm:5017", name: "Bandar Tasik Selatan", lat: 3.0750, lng: 101.7120, country: "MY", agency: "ktm" },
    { id: "ktm:5018", name: "Serdang", lat: 3.0170, lng: 101.7140, country: "MY", agency: "ktm" },
    { id: "ktm:5019", name: "Kajang KTM", lat: 2.9900, lng: 101.7490, country: "MY", agency: "ktm" },
    { id: "ktm:5020", name: "Labu", lat: 2.7580, lng: 101.8290, country: "MY", agency: "ktm" },
    { id: "ktm:5021", name: "Tiroi", lat: 4.8690, lng: 100.7370, country: "MY", agency: "ktm" },
    { id: "ktm:5022", name: "Kuala Ketil", lat: 5.5830, lng: 100.6490, country: "MY", agency: "ktm" },
    { id: "ktm:5023", name: "Gurun", lat: 5.8170, lng: 100.4770, country: "MY", agency: "ktm" },
    { id: "ktm:5024", name: "Pulau Sebang", lat: 2.4530, lng: 102.2370, country: "MY", agency: "ktm" },
    { id: "ktm:5025", name: "Batu Gajah", lat: 4.4690, lng: 101.0370, country: "MY", agency: "ktm" },
    { id: "ktm:5026", name: "Menglembu", lat: 4.5490, lng: 101.0500, country: "MY", agency: "ktm" },
    { id: "ktm:5027", name: "Chemor", lat: 4.7190, lng: 101.1180, country: "MY", agency: "ktm" },
    { id: "ktm:5028", name: "Enggor", lat: 4.8250, lng: 100.9480, country: "MY", agency: "ktm" },
    { id: "ktm:5029", name: "Padang Rengas", lat: 4.7720, lng: 100.8490, country: "MY", agency: "ktm" },
    { id: "ktm:5030", name: "Changkat Jering", lat: 4.7850, lng: 100.7380, country: "MY", agency: "ktm" },
    { id: "ktm:5031", name: "Pintu Gerbang", lat: 4.8220, lng: 100.5620, country: "MY", agency: "ktm" },
    { id: "ktm:5032", name: "Rasa", lat: 3.4950, lng: 101.6280, country: "MY", agency: "ktm" },
    { id: "ktm:5033", name: "Kuala Kubu Bharu", lat: 3.5730, lng: 101.6570, country: "MY", agency: "ktm" },
    { id: "ktm:5034", name: "Kerling", lat: 3.5940, lng: 101.6080, country: "MY", agency: "ktm" },
    { id: "ktm:5035", name: "Kuala Selangor", lat: 3.3460, lng: 101.2530, country: "MY", agency: "ktm" },
    { id: "ktm:5036", name: "Bahau", lat: 2.8080, lng: 102.4020, country: "MY", agency: "ktm" },
    { id: "ktm:5037", name: "Serting", lat: 2.7470, lng: 102.3380, country: "MY", agency: "ktm" },
    { id: "ktm:5038", name: "Triang", lat: 2.6860, lng: 102.5180, country: "MY", agency: "ktm" },
    { id: "ktm:5039", name: "Kemayan", lat: 2.7020, lng: 102.6310, country: "MY", agency: "ktm" },
    { id: "ktm:5040", name: "Labis", lat: 2.3830, lng: 103.0210, country: "MY", agency: "ktm" },
    { id: "ktm:5041", name: "Yong Peng", lat: 2.0180, lng: 103.0680, country: "MY", agency: "ktm" },
    { id: "ktm:5042", name: "Ayer Hitam", lat: 1.9180, lng: 103.1810, country: "MY", agency: "ktm" },
    { id: "ktm:5043", name: "Rengam", lat: 1.8770, lng: 103.3980, country: "MY", agency: "ktm" },
    { id: "ktm:5044", name: "Layang-Layang", lat: 1.8110, lng: 103.4810, country: "MY", agency: "ktm" },
    { id: "ktm:5045", name: "Kulai", lat: 1.6640, lng: 103.6030, country: "MY", agency: "ktm" },
    { id: "ktm:5046", name: "Kempas Baru", lat: 1.5420, lng: 103.7170, country: "MY", agency: "ktm" },
  ];

  const rapidStations: Station[] = [
    { id: "rapidkl:KJ1", name: "Gombak", lat: 3.2000, lng: 101.7333, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ2", name: "Taman Melati", lat: 3.1920, lng: 101.7250, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ3", name: "Wangsa Maju", lat: 3.1850, lng: 101.7180, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ4", name: "Sri Rampai", lat: 3.1780, lng: 101.7170, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ5", name: "Setiawangsa", lat: 3.1720, lng: 101.7170, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ6", name: "Jelatek", lat: 3.1680, lng: 101.7170, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ7", name: "Dato' Keramat", lat: 3.1650, lng: 101.7180, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ8", name: "Damai", lat: 3.1620, lng: 101.7190, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ9", name: "Ampang Park", lat: 3.1580, lng: 101.7190, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ10", name: "KLCC", lat: 3.1500, lng: 101.7167, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ11", name: "Kampung Baru", lat: 3.1590, lng: 101.7070, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ12", name: "Dang Wangi", lat: 3.1550, lng: 101.7000, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ13", name: "Masjid Jamek", lat: 3.1430, lng: 101.6950, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ14", name: "Pasar Seni", lat: 3.1333, lng: 101.6833, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ15", name: "KL Sentral (Rapid)", lat: 3.1345, lng: 101.6860, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ16", name: "Bangsar", lat: 3.1250, lng: 101.6750, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ17", name: "Abdullah Hukum", lat: 3.1160, lng: 101.6690, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ18", name: "Kerinchi", lat: 3.1080, lng: 101.6640, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ19", name: "Pantai Dalam", lat: 3.0980, lng: 101.6590, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ20", name: "Taman Jaya", lat: 3.0850, lng: 101.6490, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ21", name: "Asia Jaya", lat: 3.0780, lng: 101.6430, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ22", name: "Taman Paramount", lat: 3.0710, lng: 101.6370, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ23", name: "Taman Bahagia", lat: 3.0640, lng: 101.6310, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:KJ24", name: "Kelana Jaya", lat: 3.0560, lng: 101.6230, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:MRT1", name: "Kajang", lat: 2.9833, lng: 101.7833, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:MRT2", name: "Muzium Negara", lat: 3.1350, lng: 101.6850, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:AG1", name: "Sentul Timur", lat: 3.1833, lng: 101.7000, country: "MY", agency: "rapidkl" },
    { id: "rapidkl:AG18", name: "Chan Sow Lin", lat: 3.1333, lng: 101.7167, country: "MY", agency: "rapidkl" },
  ];

  const sgStations: Station[] = [
    { id: "sgmrt:NS9", name: "Woodlands MRT", lat: 1.4360, lng: 103.7860, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:NS8", name: "Marsiling", lat: 1.4320, lng: 103.7740, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:NS7", name: "Kranji", lat: 1.4250, lng: 103.7620, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:NS6", name: "Yew Tee", lat: 1.4050, lng: 103.7490, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:NS5", name: "Choa Chu Kang", lat: 1.3850, lng: 103.7450, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:NS4", name: "Bukit Gombak", lat: 1.3590, lng: 103.7520, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:NS3", name: "Bukit Batok", lat: 1.3490, lng: 103.7490, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:NS2", name: "Jurong East", lat: 1.3330, lng: 103.7400, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:NS1", name: "Marina Bay", lat: 1.2790, lng: 103.8540, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:EW1", name: "Pasir Ris", lat: 1.3720, lng: 103.9490, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:EW2", name: "Tampines", lat: 1.3530, lng: 103.9450, country: "SG", agency: "sgmrt" },
    { id: "sgmrt:EW3", name: "Simei", lat: 1.3430, lng: 103.9530, country: "SG", agency: "sgmrt" },
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
  addTripEdge("ktm:19100", "ktm:5013", 3);
  addTripEdge("ktm:5013", "ktm:19700", 2);
  addTripEdge("ktm:19700", "ktm:5011", 5);
  addTripEdge("ktm:5011", "ktm:5010", 8);
  addTripEdge("ktm:5010", "ktm:5009", 6);
  addTripEdge("ktm:5009", "ktm:14600", 7);
  addTripEdge("ktm:14600", "ktm:5032", 5);
  addTripEdge("ktm:5032", "ktm:5033", 4);
  addTripEdge("ktm:5033", "ktm:5034", 3);
  addTripEdge("ktm:14600", "ktm:5005", 20);
  addTripEdge("ktm:5005", "ktm:5006", 12);
  addTripEdge("ktm:5006", "ktm:14000", 5);
  addTripEdge("ktm:14000", "ktm:10800", 8);
  addTripEdge("ktm:10800", "ktm:5025", 6);
  addTripEdge("ktm:5025", "ktm:5026", 3);
  addTripEdge("ktm:5026", "ktm:9000", 3);
  addTripEdge("ktm:9000", "ktm:5027", 5);
  addTripEdge("ktm:5027", "ktm:5007", 8);
  addTripEdge("ktm:5007", "ktm:5028", 3);
  addTripEdge("ktm:5028", "ktm:5029", 4);
  addTripEdge("ktm:5029", "ktm:5030", 4);
  addTripEdge("ktm:5030", "ktm:5021", 3);
  addTripEdge("ktm:5021", "ktm:5031", 5);
  addTripEdge("ktm:5031", "ktm:8100", 4);
  addTripEdge("ktm:8100", "ktm:100", 12);
  addTripEdge("ktm:100", "ktm:5002", 5);
  addTripEdge("ktm:5002", "ktm:5003", 8);
  addTripEdge("ktm:5003", "ktm:5004", 15);
  addTripEdge("ktm:5004", "ktm:9000", 20);
  addTripEdge("ktm:100", "ktm:5001", 15);
  addTripEdge("ktm:5001", "ktm:5022", 8);
  addTripEdge("ktm:5022", "ktm:5023", 8);
  addTripEdge("ktm:5023", "ktm:6000", 10);
  addTripEdge("ktm:6000", "ktm:5008", 15);
  addTripEdge("ktm:5008", "ktm:47300", 10);
  addTripEdge("ktm:19100", "ktm:5014", 5);
  addTripEdge("ktm:5014", "ktm:5015", 3);
  addTripEdge("ktm:5015", "ktm:5016", 4);
  addTripEdge("ktm:5016", "ktm:5017", 5);
  addTripEdge("ktm:5017", "ktm:5018", 5);
  addTripEdge("ktm:5018", "ktm:5019", 5);
  addTripEdge("ktm:5019", "ktm:24400", 8);
  addTripEdge("ktm:24400", "ktm:5020", 5);
  addTripEdge("ktm:5020", "ktm:26000", 8);
  addTripEdge("ktm:26000", "ktm:5036", 25);
  addTripEdge("ktm:5036", "ktm:5037", 5);
  addTripEdge("ktm:5037", "ktm:5038", 8);
  addTripEdge("ktm:5038", "ktm:5039", 5);
  addTripEdge("ktm:5039", "ktm:27800", 5);
  addTripEdge("ktm:27800", "ktm:35000", 15);
  addTripEdge("ktm:35000", "ktm:5040", 20);
  addTripEdge("ktm:5040", "ktm:34400", 12);
  addTripEdge("ktm:34400", "ktm:5024", 2);
  addTripEdge("ktm:5024", "ktm:26000", 10);
  addTripEdge("ktm:35000", "ktm:5041", 20);
  addTripEdge("ktm:5041", "ktm:5042", 10);
  addTripEdge("ktm:5042", "ktm:5043", 12);
  addTripEdge("ktm:5043", "ktm:5044", 8);
  addTripEdge("ktm:5044", "ktm:5045", 10);
  addTripEdge("ktm:5045", "ktm:5046", 8);
  addTripEdge("ktm:5046", "ktm:37500", 5);
  addTripEdge("ktm:37500", "ktm:37600", 5);

  addTripEdge("rapidkl:KJ1", "rapidkl:KJ2", 3);
  addTripEdge("rapidkl:KJ2", "rapidkl:KJ3", 2);
  addTripEdge("rapidkl:KJ3", "rapidkl:KJ4", 2);
  addTripEdge("rapidkl:KJ4", "rapidkl:KJ5", 2);
  addTripEdge("rapidkl:KJ5", "rapidkl:KJ6", 2);
  addTripEdge("rapidkl:KJ6", "rapidkl:KJ7", 2);
  addTripEdge("rapidkl:KJ7", "rapidkl:KJ8", 2);
  addTripEdge("rapidkl:KJ8", "rapidkl:KJ9", 2);
  addTripEdge("rapidkl:KJ9", "rapidkl:KJ10", 2);
  addTripEdge("rapidkl:KJ10", "rapidkl:KJ11", 3);
  addTripEdge("rapidkl:KJ11", "rapidkl:KJ12", 2);
  addTripEdge("rapidkl:KJ12", "rapidkl:KJ13", 3);
  addTripEdge("rapidkl:KJ13", "rapidkl:KJ14", 3);
  addTripEdge("rapidkl:KJ14", "rapidkl:KJ15", 2);
  addTripEdge("rapidkl:KJ15", "rapidkl:KJ16", 3);
  addTripEdge("rapidkl:KJ16", "rapidkl:KJ17", 2);
  addTripEdge("rapidkl:KJ17", "rapidkl:KJ18", 3);
  addTripEdge("rapidkl:KJ18", "rapidkl:KJ19", 3);
  addTripEdge("rapidkl:KJ19", "rapidkl:KJ20", 3);
  addTripEdge("rapidkl:KJ20", "rapidkl:KJ21", 2);
  addTripEdge("rapidkl:KJ21", "rapidkl:KJ22", 2);
  addTripEdge("rapidkl:KJ22", "rapidkl:KJ23", 2);
  addTripEdge("rapidkl:KJ23", "rapidkl:KJ24", 2);
  addTripEdge("rapidkl:MRT1", "rapidkl:MRT2", 25);
  addTripEdge("rapidkl:AG1", "rapidkl:AG18", 15);
  addTripEdge("rapidkl:AG18", "rapidkl:KJ10", 5);
  addTripEdge("rapidkl:KJ13", "rapidkl:AG18", 5);

  addTripEdge("sgmrt:NS9", "sgmrt:NS8", 3);
  addTripEdge("sgmrt:NS8", "sgmrt:NS7", 3);
  addTripEdge("sgmrt:NS7", "sgmrt:NS6", 5);
  addTripEdge("sgmrt:NS6", "sgmrt:NS5", 4);
  addTripEdge("sgmrt:NS5", "sgmrt:NS4", 5);
  addTripEdge("sgmrt:NS4", "sgmrt:NS3", 3);
  addTripEdge("sgmrt:NS3", "sgmrt:NS2", 4);
  addTripEdge("sgmrt:NS2", "sgmrt:NS1", 20);
  addTripEdge("sgmrt:NS1", "sgmrt:EW1", 30);
  addTripEdge("sgmrt:EW1", "sgmrt:EW2", 5);
  addTripEdge("sgmrt:EW2", "sgmrt:EW3", 3);
  addTripEdge("sgmrt:EW3", "sgmrt:EW24", 12);
  addTripEdge("sgmrt:EW24", "sgmrt:CC1", 5);
  addTripEdge("sgmrt:CC1", "sgmrt:NE1", 8);
  addTripEdge("sgmrt:DT1", "sgmrt:DT35", 35);
  addTripEdge("sgmrt:CG1", "sgmrt:DT35", 10);
  // Connect via Marina Bay
  addTripEdge("sgmrt:NS1", "sgmrt:CC1", 3);

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

  function safeFilename(id: string): string {
    return id.replace(/:/g, "-");
  }

  console.log("\nComputing per-origin travel times...");
  const travelTimesDir = join(PUBLIC_DIR, "travel-times");
  if (existsSync(travelTimesDir)) rmSync(travelTimesDir, { recursive: true, force: true });
  ensureDir(travelTimesDir);
  let count = 0;
  for (const station of stations) {
    const { distances } = dijkstra(station.id, graph, 2880);
    const times: Record<string, number> = {};
    for (const [id, dist] of distances) {
      if (id !== station.id) {
        times[id] = dist;
      }
    }
    writeFileSync(join(travelTimesDir, `${safeFilename(station.id)}.json`), JSON.stringify(times));
    count++;
    if (count % 10 === 0) console.log(`  ${count}/${stations.length} stations processed`);
  }
  console.log(`  Travel times for ${count} origin stations`);

  console.log("\n=== Build complete! ===");
  console.log(`Output: ${PUBLIC_DIR}`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
