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
    // Unofficial Singapore GTFS feed listed by Transitland as f-w21z-lta.
    // LTA DataMall does not publish an official complete static GTFS zip.
    url: "https://cdn.rushowl.app/rushtrail-app/gtfs-feed/gtfs-feed-lta.zip",
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
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().replace(/^\uFEFF/, ""));
  return rows.slice(1).map((values) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    return record;
  });
}

export function timeToMinutes(t: string): number {
  const parts = t.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]) + (parts[2] ? parseInt(parts[2]) / 60 : 0);
}
