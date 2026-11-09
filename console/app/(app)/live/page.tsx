'use client';
import clsx from 'clsx';
import { BatteryMedium } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, Failed, FieldLabel, Input, Loading, PageTitle } from '@/components/ui';
import type { Pin } from '@/components/MapView';
import { api } from '@/lib/api';
import { ago, time, todayKey } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { liveSocket } from '@/lib/socket';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function Live() {
  const { data, error, reload, setData } = useData<any[]>((u) => api(u), '/manage/live');
  const [selected, setSelected] = useState<string | null>(null);
  const [date, setDate] = useState(todayKey());
  const day = useData((u) => api(u), selected ? `/manage/agents/${selected}/day?date=${date}` : null);

  useEffect(() => {
    const socket = liveSocket();
    const onMove = (p: any) => setData((list) => list?.map((a) => (a.id === p.agentId ? { ...a, lastLat: p.lat, lastLng: p.lng, lastSeenAt: p.at, stale: false, battery: p.battery ?? a.battery } : a)) ?? list);
    const onChange = () => reload();
    socket?.on('agent:location', onMove);
    socket?.on('visit:started', onChange);
    socket?.on('visit:completed', onChange);
    const timer = setInterval(reload, 60_000);
    return () => { socket?.off('agent:location', onMove); socket?.off('visit:started', onChange); socket?.off('visit:completed', onChange); clearInterval(timer); };
  }, [reload, setData]);

  const pins: Pin[] = useMemo(() => {
    if (selected && day.data) {
      return day.data.visits.map((v: any) => ({ lat: v.customer.lat, lng: v.customer.lng, color: v.withinGeofence ? '#12A071' : '#D98A06', title: `${time(v.checkInAt)} · ${v.customer.name}` }));
    }
    return (data ?? []).filter((a) => a.lastLat != null).map((a) => ({ id: a.id, lat: a.lastLat, lng: a.lastLng, radius: 9, color: a.currentCustomer ? '#12A071' : a.stale ? '#7B7A90' : '#5B4BFF', title: `${a.fullName}${a.currentCustomer ? ` · at ${a.currentCustomer}` : ''}` }));
  }, [data, selected, day.data]);
  const trail = selected && day.data ? day.data.points.map((p: any) => [p.lat, p.lng] as [number, number]) : undefined;

  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;
  const on = data.filter((a) => a.onShift);
  return (
    <>
      <PageTitle title="Live map" hint={`${on.length} of ${data.length} agents on shift. Locations are visible only during a shift.`} actions={selected ? <FieldLabel text="Route on"><Input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} /></FieldLabel> : undefined} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="order-2 space-y-2 lg:order-1 lg:max-h-[620px] lg:overflow-y-auto">
          {selected && <button className="btn btn-soft w-full" onClick={() => setSelected(null)}>Back to everyone</button>}
          {data.map((a) => (
            <button key={a.id} onClick={() => { setSelected(a.id); setDate(todayKey()); }} className="block w-full text-left">
              <Card className={clsx('p-3', selected === a.id && 'border-brand-500 ring-1 ring-brand-500')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{a.fullName}</span>
                  {a.onShift ? <Badge tone={a.currentCustomer ? 'green' : 'teal'}>{a.currentCustomer ? 'On a visit' : 'On shift'}</Badge> : <Badge tone="gray">Off shift</Badge>}
                </div>
                {a.currentCustomer && <p className="mt-1 truncate text-sm text-ink-2">At {a.currentCustomer}</p>}
                <div className="mt-1.5 flex items-center justify-between text-xs text-ink-3">
                  <span>{a.visitsToday} / {a.dailyVisitTarget} visits{a.onShift ? ` · seen ${ago(a.lastSeenAt)}` : ''}</span>
                  {a.onShift && a.battery != null && <span className="flex items-center gap-1"><BatteryMedium size={13} />{a.battery}%</span>}
                </div>
              </Card>
            </button>
          ))}
          {!data.length && <p className="p-6 text-center text-sm text-ink-3">No agents yet. Add them under Team.</p>}
        </div>
        <div className="order-1 lg:order-2">
          <MapView pins={pins} trail={trail} height={620} key={selected ? `${selected}-${date}-${!!day.data}` : 'all'} />
          {selected && day.data && (
            <Card className="mt-3 p-4">
              <h2 className="mb-2 font-bold">{day.data.agent.fullName} · {date}</h2>
              <ol className="space-y-1.5 text-sm">
                {day.data.visits.map((v: any) => <li key={v.id} className="flex flex-wrap justify-between gap-2"><span>{time(v.checkInAt)} · {v.customer.name}</span><Badge value={v.outcome ?? v.status} /></li>)}
                {!day.data.visits.length && <li className="text-ink-3">No visits on this day.</li>}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
