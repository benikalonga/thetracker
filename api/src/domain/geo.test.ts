import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceM, isInsideGeofence, optimizeRoute, pathLengthM, trailDistanceKm } from './geo';

test('distance matches a known length', () => {
  // One degree of latitude is about 111.2 km.
  assert.ok(Math.abs(distanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111_195) < 50);
  assert.equal(distanceM({ lat: 5, lng: 5 }, { lat: 5, lng: 5 }), 0);
});

test('geofence tolerance is capped at 30 m', () => {
  assert.equal(isInsideGeofence(150, 150), true);
  assert.equal(isInsideGeofence(151, 150), false);
  assert.equal(isInsideGeofence(170, 150, 25), true);
  assert.equal(isInsideGeofence(190, 150, 500), false);
  assert.equal(isInsideGeofence(151, 150, -40), false);
});

test('route optimizer shortens a zig-zag and keeps every stop', () => {
  const stops = [0, 4, 1, 5, 2, 3].map((i) => ({ id: i, lat: 0, lng: i * 0.01 }));
  const start = { lat: 0, lng: -0.01 };
  const route = optimizeRoute(start, stops);
  assert.deepEqual(route.map((s) => s.id), [0, 1, 2, 3, 4, 5]);
  assert.ok(pathLengthM([start, ...route]) < pathLengthM([start, ...stops]));
});

test('route optimizer copes with empty and single lists', () => {
  assert.deepEqual(optimizeRoute(null, []), []);
  assert.equal(optimizeRoute({ lat: 0, lng: 0 }, [{ lat: 1, lng: 1 }]).length, 1);
});

test('trail distance ignores drift and bad fixes', () => {
  const still = Array.from({ length: 20 }, (_, i) => ({ lat: 1 + (i % 2) * 0.00003, lng: 1 }));
  assert.equal(trailDistanceKm(still), 0);
  const trail = [{ lat: 0, lng: 0 }, { lat: 5, lng: 5, accuracy: 900 }, { lat: 0.01, lng: 0 }];
  assert.ok(Math.abs(trailDistanceKm(trail) - 1.112) < 0.01);
});
