import type { IsochroneCollection, IsochroneFeature, OriginTravelTimes, RailSegment, StationData } from "./data-loader";

const TIME_BANDS = [60, 120, 180, 240, 360, 480, 720, 1440, 2160, 2880];
const LOCAL_ACCESS_SPEED_KM_PER_MIN = 0.12;
const INTERCHANGE_TIME = 10;
const CIRCLE_STEPS = 20;

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

    const polygons: number[][][][] = [];
    for (const { station, time } of reachableStations) {
      const remaining = Math.max(maxTime - time, INTERCHANGE_TIME);
      const radius = Math.min(
        remaining * LOCAL_ACCESS_SPEED_KM_PER_MIN,
        maxStationBufferKm(maxTime, station.id === origin.id)
      );
      polygons.push(circlePolygon(station.lng, station.lat, radius));
    }

    for (const segment of railSegments) {
      const from = stationMap.get(segment.fromId);
      const to = stationMap.get(segment.toId);
      if (!from || !to) continue;
      const fromTime = from.id === origin.id ? 0 : timesFromOrigin[from.id];
      const toTime = to.id === origin.id ? 0 : timesFromOrigin[to.id];
      if (fromTime === undefined || toTime === undefined) continue;
      const segmentTime = Math.max(fromTime, toTime);
      if (segmentTime > maxTime) continue;
      const corridor = corridorPolygon(from, to, corridorBufferKm(maxTime));
      if (corridor) polygons.push(corridor);
    }

    if (polygons.length === 0) continue;

    features.push({
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: polygons,
      },
      properties: {
        duration: maxTime,
        fillColor: getColorForBand(maxTime),
        stationCount: reachableCountFor(timesFromOrigin, maxTime),
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

function maxStationBufferKm(duration: number, isOrigin = false): number {
  if (isOrigin) return duration <= 60 ? 10 : 14;
  if (duration <= 60) return 8;
  if (duration <= 240) return 11;
  if (duration <= 720) return 15;
  if (duration <= 1440) return 19;
  return 23;
}

function corridorBufferKm(duration: number): number {
  if (duration <= 60) return 5;
  if (duration <= 240) return 7;
  if (duration <= 720) return 10;
  if (duration <= 1440) return 13;
  return 16;
}

function corridorPolygon(from: StationData, to: StationData, radiusKm: number): number[][][] | null {
  const kmPerLatDegree = 111.32;
  const avgLatRad = ((from.lat + to.lat) * Math.PI) / 360;
  const kmPerLngDegree = Math.max(20, kmPerLatDegree * Math.cos(avgLatRad));
  const dx = (to.lng - from.lng) * kmPerLngDegree;
  const dy = (to.lat - from.lat) * kmPerLatDegree;
  const length = Math.hypot(dx, dy);
  if (length < 0.05) return null;

  const heading = Math.atan2(dy, dx);
  const capSteps = 8;
  const ring: number[][] = [];
  const appendPoint = (centerX: number, centerY: number, angle: number) => {
    const x = centerX + Math.cos(angle) * radiusKm;
    const y = centerY + Math.sin(angle) * radiusKm;
    ring.push([
      Math.round((from.lng + x / kmPerLngDegree) * 1e5) / 1e5,
      Math.round((from.lat + y / kmPerLatDegree) * 1e5) / 1e5,
    ]);
  };

  for (let i = 0; i <= capSteps; i++) {
    appendPoint(0, 0, heading + Math.PI / 2 + (i * Math.PI) / capSteps);
  }
  for (let i = 0; i <= capSteps; i++) {
    appendPoint(dx, dy, heading - Math.PI / 2 + (i * Math.PI) / capSteps);
  }
  ring.push([...ring[0]]);
  return [ring];
}

function getColorForBand(duration: number): string {
  const colors: Record<number, string> = {
    60: "#6D214F",
    120: "#8D2F57",
    180: "#AE3E5C",
    240: "#CA5361",
    360: "#DF6D65",
    480: "#EC896A",
    720: "#F2A66F",
    1440: "#F5C27A",
    2160: "#F6D78B",
    2880: "#F7E8A5",
  };
  return colors[duration] || "#333333";
}
