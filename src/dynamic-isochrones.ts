import type { IsochroneCollection, IsochroneFeature, StationData, TravelTimes } from "./data-loader";

const TIME_BANDS = [60, 120, 180, 240, 360, 480, 720, 1440, 2160, 2880];
const LOCAL_ACCESS_SPEED_KM_PER_MIN = 0.04;
const INTERCHANGE_TIME = 10;
const CIRCLE_STEPS = 8;

export function buildDynamicIsochrones(
  origin: StationData,
  stations: StationData[],
  travelTimes: TravelTimes
): IsochroneCollection {
  const stationMap = new Map(stations.map((station) => [station.id, station]));
  const timesFromOrigin = travelTimes[origin.id] || {};
  const features: IsochroneFeature[] = [];

  for (let i = 0; i < TIME_BANDS.length; i++) {
    const minTime = i === 0 ? -1 : TIME_BANDS[i - 1];
    const maxTime = TIME_BANDS[i];
    const stationsInBand: Array<{ station: StationData; time: number }> = [];

    if (minTime < 0) stationsInBand.push({ station: origin, time: 0 });

    for (const [stationId, time] of Object.entries(timesFromOrigin)) {
      if (time <= minTime || time > maxTime) continue;
      const station = stationMap.get(stationId);
      if (station) stationsInBand.push({ station, time });
    }

    const polygons: number[][][][] = [];
    for (const { station, time } of stationsInBand) {
      const remaining = Math.max(maxTime - time, INTERCHANGE_TIME);
      const radius = Math.min(
        remaining * LOCAL_ACCESS_SPEED_KM_PER_MIN,
        maxStationBufferKm(maxTime, station.id === origin.id)
      );
      polygons.push(circlePolygon(station.lng, station.lat, radius));
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
  if (isOrigin) return duration <= 60 ? 5 : 8;
  if (duration <= 60) return 3;
  if (duration <= 240) return 5;
  if (duration <= 720) return 7;
  if (duration <= 1440) return 9;
  return 11;
}

function getColorForBand(duration: number): string {
  const colors: Record<number, string> = {
    60: "#D96B52",
    120: "#E8895E",
    180: "#F0A96B",
    240: "#F4C977",
    360: "#F6DA8A",
    480: "#F8E8A8",
    720: "#FAF0C4",
    1440: "#FBF5D6",
    2160: "#FCF8E6",
    2880: "#FEFBF1",
  };
  return colors[duration] || "#333333";
}
