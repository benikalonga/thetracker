'use client';
import { Download, Upload } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { Badge, Button, Failed, FieldLabel, Input, Modal, PageTitle, Pager, SearchBox, Select, Table, Tabs } from '@/components/ui';
import { api, download } from '@/lib/api';
import { ago, statusColor } from '@/lib/format';
import { useAction, useData } from '@/lib/hooks';
import { usePaged } from '@/lib/paged';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });
const STATUS = ['LEAD', 'ACTIVE', 'AT_RISK', 'INACTIVE'];
const blank = { name: '', contactName: '', phone: '', email: '', address: '', city: '', lat: '', lng: '', status: 'LEAD', priority: 'NORMAL', assignedToId: '', visitEveryDays: '30' };

export default function Customers() {
  const list = usePaged('/customers', { q: '', status: '', agentId: '' });
  const team = useData<any[]>((u) => api(u), '/manage/team');
  const all = useData((u) => api(u), '/customers?all=1');
  const [view, setView] = useState('list');
  const [selected, setSelected] = useState<string[]>([]);
  const [assignTo, setAssignTo] = useState('');
  const [form, setForm] = useState<any>(null);
  const [imported, setImported] = useState<any>(null);
  const file = useRef<HTMLInputElement>(null);
  const { busy, run } = useAction();

  const agents = (team.data ?? []).filter((u) => u.role === 'AGENT' && u.isActive);
  const agentOptions = agents.map((a) => ({ value: a.id, label: a.fullName }));
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));
  const refresh = () => { list.reload(); all.reload(); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { name: form.name, contactName: form.contactName, phone: form.phone, email: form.email, address: form.address, city: form.city, lat: Number(form.lat), lng: Number(form.lng), status: form.status, priority: form.priority, visitEveryDays: Number(form.visitEveryDays), assignedToId: form.assignedToId || null };
    const done = await run(() => (form.id ? api(`/customers/${form.id}`, { method: 'PATCH', body }) : api('/customers', { body })), 'Customer saved.');
    if (done) { setForm(null); refresh(); }
  };

  const assign = async () => {
    const done = await run(() => api('/customers/bulk-assign', { body: { ids: selected, agentId: assignTo || null } }), 'Customers reassigned.');
    if (done) { setSelected([]); refresh(); }
  };

  const archive = async () => {
    const done = await run(() => api(`/customers/${form.id}/archive`, { body: {} }), 'Customer archived.');
    if (done) { setForm(null); refresh(); }
  };

  const onImport = async (f?: File) => {
    if (!f) return;
    const csv = await f.text();
    const result = await run(() => api('/customers/import', { body: { csv } }));
    if (result) { setImported(result); refresh(); }
    if (file.current) file.current.value = '';
  };

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const pins = (all.data?.items ?? []).map((c: any) => ({ lat: c.lat, lng: c.lng, color: statusColor[c.status], title: c.name }));

  return (
    <>
      <PageTitle title="Customers" hint={`${list.data?.total ?? '…'} customers`} actions={<>
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        <Button variant="ghost" busy={busy} onClick={() => file.current?.click()}><Upload size={15} /> Import CSV</Button>
        <Button variant="ghost" onClick={() => run(() => download('/customers/export.csv', 'customers.csv'))}><Download size={15} /> Export</Button>
        <Button onClick={() => setForm(blank)}>Add customer</Button>
      </>} />
      <Tabs value={view} onChange={setView} tabs={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]} />
      {view === 'map' ? <MapView pins={pins} height={560} /> : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <SearchBox value={list.filters.q} onChange={(v) => list.setFilter('q', v)} placeholder="Name, code, city or phone" />
            <Select aria-label="Status" className="!w-auto" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} options={[{ value: '', label: 'All statuses' }, ...STATUS.map((s) => ({ value: s, label: s[0] + s.slice(1).replace('_', ' ').toLowerCase() }))]} />
            <Select aria-label="Agent" className="!w-auto" value={list.filters.agentId} onChange={(e) => list.setFilter('agentId', e.target.value)} options={[{ value: '', label: 'All agents' }, { value: 'none', label: 'Unassigned' }, ...agentOptions]} />
          </div>
          {selected.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm">
              <b>{selected.length} selected</b>
              <Select aria-label="Assign to" className="!w-auto" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} options={[{ value: '', label: 'Unassigned' }, ...agentOptions]} />
              <Button busy={busy} onClick={assign}>Assign</Button>
            </div>
          )}
          {list.error && <Failed message={list.error} retry={list.reload} />}
          <Table rows={list.items} loading={list.loading} empty="No customers match." onRow={(c) => setForm({ ...blank, ...c, contactName: c.contactName ?? '', phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', city: c.city ?? '', lat: String(c.lat), lng: String(c.lng), assignedToId: c.assignedTo?.id ?? '', visitEveryDays: String(c.visitEveryDays) })} columns={[
            { key: 'pick', title: '', render: (c) => <input aria-label={`Select ${c.name}`} type="checkbox" checked={selected.includes(c.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(c.id)} /> },
            { key: 'name', title: 'Customer', render: (c) => <div><p className="font-semibold">{c.name}</p><p className="text-xs text-ink-3">{c.code}</p></div> },
            { key: 'city', title: 'City' },
            { key: 'status', title: 'Status', render: (c) => <Badge value={c.status} /> },
            { key: 'priority', title: 'Priority', render: (c) => <Badge value={c.priority} /> },
            { key: 'agent', title: 'Agent', render: (c) => c.assignedTo?.fullName ?? <span className="text-ink-3">Unassigned</span> },
            { key: 'last', title: 'Last visit', render: (c) => ago(c.lastVisitAt) },
          ]} />
          <Pager page={list.page} pages={list.data?.pages ?? 1} total={list.data?.total} onChange={list.setPage} />
        </>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit customer' : 'Add customer'} wide>
        {form && (
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><FieldLabel text="Name"><Input required minLength={2} value={form.name} onChange={(e) => set('name', e.target.value)} /></FieldLabel></div>
            <FieldLabel text="Contact person"><Input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} /></FieldLabel>
            <FieldLabel text="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></FieldLabel>
            <FieldLabel text="Email"><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></FieldLabel>
            <FieldLabel text="City"><Input value={form.city} onChange={(e) => set('city', e.target.value)} /></FieldLabel>
            <div className="sm:col-span-2"><FieldLabel text="Address"><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></FieldLabel></div>
            <FieldLabel text="Latitude"><Input required type="number" step="any" min={-90} max={90} value={form.lat} onChange={(e) => set('lat', e.target.value)} /></FieldLabel>
            <FieldLabel text="Longitude"><Input required type="number" step="any" min={-180} max={180} value={form.lng} onChange={(e) => set('lng', e.target.value)} /></FieldLabel>
            <FieldLabel text="Status"><Select value={form.status} onChange={(e) => set('status', e.target.value)} options={STATUS} /></FieldLabel>
            <FieldLabel text="Priority"><Select value={form.priority} onChange={(e) => set('priority', e.target.value)} options={['LOW', 'NORMAL', 'HIGH']} /></FieldLabel>
            <FieldLabel text="Agent"><Select value={form.assignedToId} onChange={(e) => set('assignedToId', e.target.value)} options={[{ value: '', label: 'Unassigned' }, ...agentOptions]} /></FieldLabel>
            <FieldLabel text="Visit every (days)"><Input required type="number" min={1} max={365} value={form.visitEveryDays} onChange={(e) => set('visitEveryDays', e.target.value)} /></FieldLabel>
            <div className="flex gap-2 sm:col-span-2">
              <Button busy={busy} className="flex-1">Save</Button>
              {form.id && <Button type="button" variant="ghost" busy={busy} onClick={archive}>Archive</Button>}
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!imported} onClose={() => setImported(null)} title="Import finished">
        {imported && (
          <div className="space-y-2 text-sm">
            <p><b>{imported.imported}</b> imported, <b>{imported.failed}</b> skipped.</p>
            {imported.errors.map((e: any) => <p key={e.row} className="text-red-600">Row {e.row}: {e.message}</p>)}
            <p className="text-ink-3">Columns: name, lat and lng are required. contactName, phone, email, address, city, status, priority, segment and visitEveryDays are optional.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
