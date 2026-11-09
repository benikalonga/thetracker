'use client';
import { Badge, Bars, Card, Failed, Loading, PageTitle, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { ago, label, money, shortDate, statusColor } from '@/lib/format';
import { useData } from '@/lib/hooks';

export default function Overview() {
  const { data, error, reload } = useData((u) => api(u), '/manage/overview');
  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;
  const statuses = Object.entries<number>(data.customers);
  const totalCustomers = statuses.reduce((n, [, v]) => n + v, 0);
  return (
    <>
      <PageTitle title="Overview" hint="How your field team is doing today." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat title="On shift" value={`${data.onShift} / ${data.agents}`} hint="agents" />
        <Stat title="Visits today" value={data.visitsToday} />
        <Stat title="Orders today" value={money(data.ordersTodayCents)} tone="good" />
        <Stat title="To review" value={data.pendingReview} hint="off-site check-ins" tone={data.pendingReview ? 'danger' : undefined} />
        <Stat title="Overdue tasks" value={data.overdueTasks} tone={data.overdueTasks ? 'danger' : undefined} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-3 font-bold">Visits, last 14 days</h2>
          <Bars data={data.series.map((d: any) => ({ label: shortDate(d.date).split(' ')[0], value: d.count }))} format={(v) => `${v} visits`} />
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-bold">Customers ({totalCustomers})</h2>
          <div className="space-y-3">
            {statuses.map(([k, v]) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-sm"><span>{label(k)}</span><span className="font-semibold">{v}</span></div>
                <div className="h-2 rounded bg-mist"><div className="h-2 rounded" style={{ width: `${(v / Math.max(totalCustomers, 1)) * 100}%`, background: statusColor[k] }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card className="mt-4 p-4">
        <h2 className="mb-2 font-bold">Latest visits</h2>
        <ul className="divide-y divide-edge">
          {data.recent.map((v: any) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span><b>{v.agent.fullName}</b> at {v.customer.name}</span>
              <span className="flex items-center gap-3 text-ink-3"><Badge value={v.outcome} />{ago(v.checkOutAt)}</span>
            </li>
          ))}
          {!data.recent.length && <li className="py-6 text-center text-sm text-ink-3">No visits yet.</li>}
        </ul>
      </Card>
    </>
  );
}
