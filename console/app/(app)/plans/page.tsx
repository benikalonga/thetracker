'use client';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Empty, Failed, FieldLabel, Input, PageTitle, SearchBox, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { todayKey } from '@/lib/format';
import { qs, useAction, useData } from '@/lib/hooks';
import { Route } from 'lucide-react';

export default function Plans() {
  const team = useData<any[]>((u) => api(u), '/manage/team');
  const customers = useData((u) => api(u), '/customers?all=1');
  const agents = useMemo(() => (team.data ?? []).filter((u) => u.role === 'AGENT' && u.isActive), [team.data]);
  const [agentId, setAgentId] = useState('');
  const [date, setDate] = useState(todayKey());
  const [q, setQ] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const { busy, run } = useAction();
  const plan = useData((u) => api(u), agentId ? `/plans${qs({ agentId, date })}` : null);

  useEffect(() => { if (!agentId && agents[0]) setAgentId(agents[0].id); }, [agents, agentId]);
  useEffect(() => { setIds((plan.data?.stops ?? []).filter((s: any) => s.status === 'PENDING').map((s: any) => s.customerId)); }, [plan.data]);

  const finished = (plan.data?.stops ?? []).filter((s: any) => s.status !== 'PENDING');
  const finishedIds = new Set(finished.map((s: any) => s.customerId));
  const all: any[] = customers.data?.items ?? [];
  const byId = new Map(all.map((c) => [c.id, c]));
  const needle = q.trim().toLowerCase();
  const options = all.filter((c) => !ids.includes(c.id) && !finishedIds.has(c.id) && (c.assignedTo?.id === agentId || !c.assignedTo) && (!needle || c.name.toLowerCase().includes(needle)));

  const save = async (optimize: boolean) => {
    const out = await run(() => api('/plans', { method: 'PUT', body: { agentId, date, customerIds: ids, optimize } }), optimize ? 'Route saved in the shortest order.' : 'Route saved.');
    if (out) plan.setData(out);
  };
  const move = (i: number, by: number) => setIds((list) => { const n = [...list]; const [x] = n.splice(i, 1); n.splice(i + by, 0, x); return n; });

  if (team.error) return <Failed message={team.error} retry={team.reload} />;
  return (
    <>
      <PageTitle title="Route plans" hint="Decide who each agent sees on a given day. Agents get it on their phone." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FieldLabel text="Agent"><Select className="!w-56" value={agentId} onChange={(e) => setAgentId(e.target.value)} options={agents.map((a) => ({ value: a.id, label: a.fullName }))} /></FieldLabel>
        <FieldLabel text="Day"><Input type="date" min={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} /></FieldLabel>
      </div>
      {!agents.length && !team.loading ? <Card><Empty icon={Route} title="No agents yet" hint="Add agents under Team first." /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="mb-3 font-bold">Stops ({ids.length + finished.length})</h2>
            {finished.map((s: any) => <div key={s.id} className="flex items-center justify-between border-b border-edge py-2 text-sm text-ink-3"><span>{s.customer.name}</span><Badge value={s.status === 'VISITED' ? 'COMPLETED' : 'INACTIVE'}>{s.status === 'VISITED' ? 'Visited' : 'Skipped'}</Badge></div>)}
            {ids.map((id, i) => (
              <div key={id} className="flex items-center gap-2 border-b border-edge py-2 text-sm last:border-0">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">{i + 1}</span>
                <span className="flex-1 truncate font-medium">{byId.get(id)?.name ?? 'Customer'}</span>
                <button aria-label="Move up" disabled={i === 0} className="px-1 disabled:opacity-30" onClick={() => move(i, -1)}>↑</button>
                <button aria-label="Move down" disabled={i === ids.length - 1} className="px-1 disabled:opacity-30" onClick={() => move(i, 1)}>↓</button>
                <button aria-label="Remove" className="px-1 text-red-600" onClick={() => setIds(ids.filter((x) => x !== id))}>✕</button>
              </div>
            ))}
            {!ids.length && !finished.length && <p className="py-8 text-center text-sm text-ink-3">Add customers from the list.</p>}
            <div className="mt-4 flex gap-2">
              <Button busy={busy} disabled={!agentId} className="flex-1" onClick={() => save(false)}>Save</Button>
              <Button busy={busy} disabled={ids.length < 2} variant="soft" className="flex-1" onClick={() => save(true)}>Save shortest route</Button>
            </div>
          </Card>
          <Card className="p-4">
            <div className="mb-3"><SearchBox value={q} onChange={setQ} placeholder="Find a customer" /></div>
            <div className="max-h-[440px] overflow-y-auto">
              {options.map((c) => (
                <button key={c.id} onClick={() => setIds([...ids, c.id])} className="flex w-full items-center justify-between gap-2 border-b border-edge py-2 text-left text-sm last:border-0 hover:bg-mist">
                  <span className="truncate">{c.name}<span className="ml-1 text-ink-3">{c.city}</span></span>
                  <Badge value={c.status} />
                </button>
              ))}
              {!options.length && <p className="py-8 text-center text-sm text-ink-3">No more customers for this agent.</p>}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
