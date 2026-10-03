import type { IsochroneCollection, IsochroneFeature, OriginTravelTimes, RailSegment, StationData } from "./data-loader";

const TIME_BANDS = [60, 120, 180, 240, 360, 480, 720, 1440, 2160, 2880];
const CIRCLE_STEPS = 24;

// Only places a train actually stops are reachable. Around each stop, the time left in
// the band is spent getting around locally:
//  - on foot (strong area): ~4.2 km/h, capped at 45 minutes of walking
//  - by local transit/road (faint area): ~18 km/h effective, capped at 40 minutes
// Nothing between two distant stations is shaded; the train line itself is drawn thin.
const WALK_KM_PER_MIN = 0.07;
const WALK_CAP_MIN = 45;
const LOCAL_KM_PER_MIN = 0.3;
const LOCAL_CAP_MIN = 40;
const EXIT_MIN = 5; // getting out of the station
const MIN_RADIUS_KM = 0.4;

export function buildDynamicIsochrones(
  origin: StationData,
  stations: StationData[],
  railSegments: RailSegment[],
  timesFromOrigin: OriginTravelTimes
): IsochroneCollection {
  const stationMap = new Map(stations.map((station) => [station.id, station]));
  const features: IsochroneFeature[] = [];

  for (const maxTime of TIME_BANDS) {
    const reachableStations: Array<{ station: StationData; time: number }> = [
      { station: origin, time: 0 },
    ];

    for (const [stationId, time] of Object.entries(timesFromOrigin)) {
      if (time > maxTime) continue;
      const station = stationMap.get(stationId);
      if (station) reachableStations.push({ station, time });
    }

    const walk: number[][][][] = [];
    const local: number[][][][] = [];
    for (const { station, time } of reachableStations) {
      const spare = Math.max(maxTime - time - EXIT_MIN, 0);
      const walkKm = Math.max(MIN_RADIUS_KM, Math.min(spare, WALK_CAP_MIN) * WALK_KM_PER_MIN);
      const localKm = Math.max(walkKm, Math.min(spare, LOCAL_CAP_MIN) * LOCAL_KM_PER_MIN);
      walk.push(circlePolygon(station.lng, station.lat, walkKm));
      local.push(circlePolygon(station.lng, station.lat, localKm));
    }

    const railLines: number[][][] = [];
    for (const segment of railSegments) {
      const from = stationMap.get(segment.fromId);
      const to = stationMap.get(segment.toId);
      if (!from || !to) continue;
      const fromTime = from.id === origin.id ? 0 : timesFromOrigin[from.id];
      const toTime = to.id === origin.id ? 0 : timesFromOrigin[to.id];
      if (fromTime === undefined || toTime === undefined) continue;
      if (Math.max(fromTime, toTime) > maxTime) continue;
      railLines.push([[from.lng, from.lat], [to.lng, to.lat]]);
    }

    features.push({
      type: "Feature",
      geometry: { type: "MultiPolygon", coordinates: walk },
      properties: {
        duration: maxTime,
        fillColor: "#4a8799",
        stationCount: reachableCountFor(timesFromOrigin, maxTime),
        localPolygons: local,
        railLines,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

function reachableCountFor(timesFromOrigin: Record<string, number>, maxTime: number): number {
  return 1 + Object.values(timesFromOrigin).filter((time) => time <= maxTime).length;
}

function circlePolygon(lng: number, lat: number, radiusKm: number): number[][][] {
  const earthRadiusKm = 6371;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const angular = radiusKm / earthRadiusKm;
  const ring: number[][] = [];

  for (let i = 0; i <= CIRCLE_STEPS; i++) {
    const bearing = (2 * Math.PI * i) / CIRCLE_STEPS;
    const pointLat = Math.asin(
      Math.sin(latRad) * Math.cos(angular) +
        Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing)
    );
    const pointLng = lngRad + Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
      Math.cos(angular) - Math.sin(latRad) * Math.sin(pointLat)
    );
    ring.push([
      Math.round(((pointLng * 180) / Math.PI) * 1e5) / 1e5,
      Math.round(((pointLat * 180) / Math.PI) * 1e5) / 1e5,
    ]);
  }

  return [ring];
}
