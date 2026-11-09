export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A poor GPS fix earns some tolerance, but never enough to defeat the geofence. */
export function isInsideGeofence(distance: number, radiusM: number, accuracyM?: number | null): boolean {
  return distance <= radiusM + Math.min(Math.max(accuracyM ?? 0, 0), 30);
}

export function pathLengthM(path: Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceM(path[i - 1], path[i]);
  return total;
}

/**
 * Order stops for a shorter drive: nearest-neighbour from the start point, then 2-opt until no
 * swap helps. The route is open-ended because agents do not return to where they began.
 */
export function optimizeRoute<T extends Point>(start: Point | null, stops: T[]): T[] {
  if (stops.length < 3 && !start) return [...stops];
  const remaining = [...stops];
  const route: T[] = [];
  let from: Point = start ?? remaining[0];
  while (remaining.length) {
    let best = 0;
    let bestDistance = Infinity;
    remaining.forEach((stop, i) => {
      const d = distanceM(from, stop);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    from = remaining.splice(best, 1)[0];
    route.push(from as T);
  }

  const lengthOf = (r: T[]) => pathLengthM(start ? [start, ...r] : r);
  let improved = true;
  let currentLength = lengthOf(route);
  let rounds = 0;
  while (improved && rounds++ < 50) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
        const candidateLength = lengthOf(candidate);
        if (candidateLength + 0.5 < currentLength) {
          route.splice(0, route.length, ...candidate);
          currentLength = candidateLength;
          improved = true;
        }
      }
    }
  }
  return route;
}

/**
 * Add up a GPS trail in km. Points with a poor fix are ignored, and small moves are not counted
 * because a phone lying still drifts by a few metres on every fix.
 */
export function trailDistanceKm(points: (Point & { accuracy?: number | null })[], minStepM = 15, maxAccuracyM = 100): number {
  let last: Point | null = null;
  let total = 0;
  for (const p of points) {
    if (p.accuracy != null && p.accuracy > maxAccuracyM) continue;
    if (!last) {
      last = p;
      continue;
    }
    const step = distanceM(last, p);
    if (step >= minStepM) {
      total += step;
      last = p;
    }
  }
  return total / 1000;
}
