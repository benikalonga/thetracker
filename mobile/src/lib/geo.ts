import type { Position } from './types';

const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Must match the server's rule, so the phone can ask for a reason even when offline. */
export const insideGeofence = (distance: number, radius: number, accuracy?: number | null) =>
  distance <= radius + Math.min(Math.max(accuracy ?? 0, 0), 30);

export function regionFor(points: { lat: number; lng: number }[], fallback?: Position | null) {
  const list = points.length ? points : fallback ? [fallback] : [];
  if (!list.length) return { latitude: 0, longitude: 20, latitudeDelta: 60, longitudeDelta: 60 };
  const lats = list.map((p) => p.lat);
  const lngs = list.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.02),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.02),
  };
}
