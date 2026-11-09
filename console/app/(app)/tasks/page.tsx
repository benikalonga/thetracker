'use client';
import { useState } from 'react';
import { Badge, Button, Failed, FieldLabel, Input, Modal, PageTitle, Pager, Select, Table, TextArea } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, shortDate } from '@/lib/format';
import { useAction, useData } from '@/lib/hooks';
import { usePaged } from '@/lib/paged';

export default function Tasks() {
  const list = usePaged('/tasks', { status: 'OPEN', agentId: '' });
  const team = useData<any[]>((u) => api(u), '/manage/team');
  const [form, setForm] = useState<any>(null);
  const { busy, run } = useAction();
  const agents = (team.data ?? []).filter((u) => u.role === 'AGENT' && u.isActive).map((a) => ({ value: a.id, label: a.fullName }));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const done = await run(() => api('/tasks', { body: { ...form, dueAt: new Date(form.dueAt).toISOString() } }), 'Task assigned.');
    if (done) { setForm(null); list.reload(); }
  };
  const cancel = async (t: any) => { if (await run(() => api(`/tasks/${t.id}/cancel`, { body: {} }), 'Task cancelled.')) list.reload(); };

  return (
    <>
      <PageTitle title="Tasks" actions={<Button disabled={!agents.length} onClick={() => setForm({ title: '', details: '', dueAt: '', priority: 'NORMAL', assignedToId: agents[0]?.value })}>Assign task</Button>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Select aria-label="Status" className="!w-auto" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} options={[{ value: '', label: 'All' }, 'OPEN', 'DONE', 'CANCELLED']} />
        <Select aria-label="Agent" className="!w-auto" value={list.filters.agentId} onChange={(e) => list.setFilter('agentId', e.target.value)} options={[{ value: '', label: 'All agents' }, ...agents]} />
      </div>
      {list.error && <Failed message={list.error} retry={list.reload} />}
      <Table rows={list.items} loading={list.loading} empty="No tasks." columns={[
        { key: 'title', title: 'Task', render: (t) => <div><p className="font-medium">{t.title}</p>{t.customer && <p className="text-xs text-ink-3">{t.customer.name}</p>}</div> },
        { key: 'agent', title: 'Agent', render: (t) => t.assignedTo.fullName },
        { key: 'due', title: 'Due', render: (t) => <span className={t.status === 'OPEN' && new Date(t.dueAt) < new Date() ? 'font-semibold text-red-600' : ''}>{shortDate(t.dueAt)}</span> },
        { key: 'priority', title: 'Priority', render: (t) => <Badge value={t.priority} /> },
        { key: 'status', title: 'Status', render: (t) => <Badge value={t.status} /> },
        { key: 'done', title: 'Completed', render: (t) => dateTime(t.completedAt) },
        { key: 'act', title: '', right: true, render: (t) => (t.status === 'OPEN' ? <button className="text-xs font-semibold text-red-600" onClick={() => cancel(t)}>Cancel</button> : null) },
      ]} />
      <Pager page={list.page} pages={list.data?.pages ?? 1} total={list.data?.total} onChange={list.setPage} />
      <Modal open={!!form} onClose={() => setForm(null)} title="Assign task">
        {form && (
          <form onSubmit={create} className="space-y-3">
            <FieldLabel text="Title"><Input required minLength={2} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></FieldLabel>
            <FieldLabel text="Details"><TextArea value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} /></FieldLabel>
            <FieldLabel text="Agent"><Select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })} options={agents} /></FieldLabel>
            <FieldLabel text="Due"><Input required type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></FieldLabel>
            <FieldLabel text="Priority"><Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} options={['LOW', 'NORMAL', 'HIGH']} /></FieldLabel>
            <Button busy={busy} className="w-full">Assign</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
