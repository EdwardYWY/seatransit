export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: "MY" | "SG";
  agency: "ktm" | "rapidkl" | "sgmrt";
}

export interface Edge {
  fromId: string;
  toId: string;
  durationMinutes: number;
  source: "trip" | "walk" | "transfer";
}

export type Graph = Map<string, Map<string, number>>;

export interface AgencyConfig {
  id: "ktm" | "rapidkl" | "sgmrt";
  name: string;
  url: string;
  country: "MY" | "SG";
  routeTypeFilter?: number;
}

export const AGENCIES: AgencyConfig[] = [
  {
    id: "ktm",
    name: "KTM",
    url: "https://api.data.gov.my/gtfs-static/ktmb",
    country: "MY",
  },
  {
    id: "rapidkl",
    name: "Rapid KL",
    url: "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl",
    country: "MY",
  },
  {
    id: "sgmrt",
    name: "Singapore MRT",
    url: "https://storage.googleapis.com/sg-mrt-gtfs/gtfs-static.zip",
    country: "SG",
    routeTypeFilter: 1,
  },
];

export const TIME_BANDS = [60, 120, 180, 240, 360, 480, 720, 1440, 2160, 2880];

export const TIME_BAND_COLORS: Record<number, string> = {
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

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = vals[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

export function timeToMinutes(t: string): number {
  const parts = t.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]) + (parts[2] ? parseInt(parts[2]) / 60 : 0);
}
