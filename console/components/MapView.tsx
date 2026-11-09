'use client';
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';

export interface Pin { id?: string; lat: number; lng: number; color: string; title: string; radius?: number }

/**
 * Pins that change position move smoothly, without resetting the view the manager has zoomed to.
 * Leaflet needs `window`, so it is imported on mount.
 */
export default function MapView({ pins, trail, height = 480 }: { pins: Pin[]; trail?: [number, number][]; height?: number | string }) {
  const el = useRef<HTMLDivElement>(null);
  const state = useRef<{ L: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup; fitted: boolean } | null>(null);
  const render = useRef<() => void>(() => undefined);

  render.current = () => {
    const s = state.current;
    if (!s) return;
    s.layer.clearLayers();
    if (trail && trail.length > 1) s.L.polyline(trail, { color: '#5B4BFF', weight: 4, opacity: 0.7 }).addTo(s.layer);
    pins.forEach((p) => s.L.circleMarker([p.lat, p.lng], { radius: p.radius ?? 7, color: '#fff', weight: 2, fillColor: p.color, fillOpacity: 1 }).bindTooltip(p.title).addTo(s.layer));
    const points: [number, number][] = [...pins.map((p) => [p.lat, p.lng] as [number, number]), ...(trail ?? [])];
    if (!s.fitted && points.length) {
      s.map.fitBounds(s.L.latLngBounds(points).pad(0.15), { maxZoom: 15 });
      s.fitted = true;
    }
  };

  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | undefined;
    import('leaflet').then((L) => {
      if (cancelled || !el.current) return;
      map = L.map(el.current).setView([0, 20], 3);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
      state.current = { L, map, layer: L.layerGroup().addTo(map), fitted: false };
      render.current();
    });
    return () => { cancelled = true; map?.remove(); state.current = null; };
  }, []);

  const key = JSON.stringify([pins, trail]);
  useEffect(() => { render.current(); }, [key]);

  return <div ref={el} style={{ height }} className="z-0 w-full rounded-2xl border border-edge" />;
}
