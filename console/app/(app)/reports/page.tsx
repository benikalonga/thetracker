'use client';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button, Failed, FieldLabel, Input, PageTitle, Table } from '@/components/ui';
import { api } from '@/lib/api';
import { money, todayKey } from '@/lib/format';
import { qs, useData } from '@/lib/hooks';

const before = (days: number) => {
  const d = new Date(Date.now() - days * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const pct = (v: number | null) => (v == null ? '—' : `${v}%`);

export default function Reports() {
  const [from, setFrom] = useState(before(29));
  const [to, setTo] = useState(todayKey());
  const { data, error, loading, reload } = useData((u) => api(u), `/manage/reports/agents${qs({ from, to })}`);
  const rows: any[] = data?.rows ?? [];

  const exportCsv = () => {
    const head = ['Agent', 'Days worked', 'Visits', 'Unique customers', 'Target %', 'Verified %', 'Avg minutes', 'Orders', 'Distance km', 'Tasks done'];
    const body = rows.map((r) => [`"${r.agent.replace(/"/g, '""')}"`, r.daysWorked, r.visits, r.uniqueCustomers, r.targetPct ?? '', r.verifiedPct ?? '', r.avgMinutes ?? '', (r.orderCents / 100).toFixed(2), r.distanceKm, r.tasksDone].join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageTitle title="Agent performance" actions={<Button variant="ghost" disabled={!rows.length} onClick={exportCsv}><Download size={15} /> Export CSV</Button>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <FieldLabel text="From"><Input type="date" max={to} value={from} onChange={(e) => setFrom(e.target.value)} /></FieldLabel>
        <FieldLabel text="To"><Input type="date" min={from} max={todayKey()} value={to} onChange={(e) => setTo(e.target.value)} /></FieldLabel>
      </div>
      {error && <Failed message={error} retry={reload} />}
      <Table rows={rows} rowKey={(r) => r.agentId} loading={loading} empty="No agents in this report." columns={[
        { key: 'agent', title: 'Agent', render: (r) => <b>{r.agent}</b> },
        { key: 'daysWorked', title: 'Days', right: true },
        { key: 'visits', title: 'Visits', right: true },
        { key: 'uniqueCustomers', title: 'Customers', right: true },
        { key: 'target', title: 'Target', right: true, render: (r) => pct(r.targetPct) },
        { key: 'verified', title: 'On site', right: true, render: (r) => pct(r.verifiedPct) },
        { key: 'avg', title: 'Avg. visit', right: true, render: (r) => (r.avgMinutes == null ? '—' : `${r.avgMinutes} min`) },
        { key: 'orders', title: 'Orders', right: true, render: (r) => money(r.orderCents) },
        { key: 'distanceKm', title: 'Km', right: true },
        { key: 'tasksDone', title: 'Tasks', right: true },
      ]} />
    </>
  );
}
