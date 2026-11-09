'use client';
import { useState } from 'react';
import { useMe } from '@/components/Shell';
import { Badge, Button, Failed, FieldLabel, Input, Modal, PageTitle, Select, Table } from '@/components/ui';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';
import { useAction, useData } from '@/lib/hooks';

export default function Team() {
  const me = useMe();
  const isAdmin = me.role === 'ADMIN';
  const { data, error, loading, reload } = useData<any[]>((u) => api(u), '/manage/team');
  const [form, setForm] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const { busy, run } = useAction();
  const rows = data ?? [];
  const managers = rows.filter((u) => u.role !== 'AGENT' && u.isActive).map((u) => ({ value: u.id, label: u.fullName }));
  const set = (k: string, v: unknown) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(form.dailyVisitTarget);
    const shared: any = { fullName: form.fullName, phone: form.phone || null, dailyVisitTarget: target };
    if (isAdmin) { shared.role = form.role; shared.managerId = form.managerId || null; }
    const done = await run(() => (form.id
      ? api(`/manage/team/${form.id}`, { method: 'PATCH', body: shared })
      : api('/manage/team', { body: { ...shared, email: form.email, password: form.password } })), 'Saved.');
    if (done) { setForm(null); reload(); }
  };
  const toggle = async () => { if (await run(() => api(`/manage/team/${form.id}`, { method: 'PATCH', body: { isActive: !form.isActive } }), form.isActive ? 'Account deactivated.' : 'Account reactivated.')) { setForm(null); reload(); } };
  const reset = async () => { if (await run(() => api(`/manage/team/${form.id}/password`, { body: { password: newPassword } }), 'Password changed. They have been signed out.')) setNewPassword(''); };

  return (
    <>
      <PageTitle title="Team" actions={<Button onClick={() => setForm({ fullName: '', email: '', phone: '', password: '', role: 'AGENT', managerId: me.role === 'MANAGER' ? me.id : '', dailyVisitTarget: 8 })}>Add person</Button>} />
      {error && <Failed message={error} retry={reload} />}
      <Table rows={rows} loading={loading} onRow={(u) => u.id !== me.id && setForm({ ...u, phone: u.phone ?? '', managerId: u.managerId ?? '' })} columns={[
        { key: 'fullName', title: 'Name', render: (u) => <div><p className="font-semibold">{u.fullName}</p><p className="text-xs text-ink-3">{u.email}</p></div> },
        { key: 'role', title: 'Role', render: (u) => <Badge value={u.role} /> },
        { key: 'manager', title: 'Reports to', render: (u) => u.manager?.fullName ?? '—' },
        { key: 'dailyVisitTarget', title: 'Daily target', right: true },
        { key: 'seen', title: 'Last seen', render: (u) => ago(u.lastSeenAt) },
        { key: 'active', title: 'Status', render: (u) => (u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Deactivated</Badge>) },
      ]} />
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? form.fullName : 'Add person'}>
        {form && (
          <div className="space-y-4">
            <form onSubmit={save} className="space-y-3">
              <FieldLabel text="Full name"><Input required minLength={2} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></FieldLabel>
              {!form.id && <FieldLabel text="Work email"><Input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></FieldLabel>}
              {!form.id && <FieldLabel text="Temporary password" hint="At least 10 characters."><Input required minLength={10} type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} /></FieldLabel>}
              <FieldLabel text="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></FieldLabel>
              {isAdmin && <FieldLabel text="Role"><Select value={form.role} onChange={(e) => set('role', e.target.value)} options={['AGENT', 'MANAGER', 'ADMIN']} /></FieldLabel>}
              {isAdmin && <FieldLabel text="Reports to"><Select value={form.managerId} onChange={(e) => set('managerId', e.target.value)} options={[{ value: '', label: 'Nobody' }, ...managers.filter((m) => m.value !== form.id)]} /></FieldLabel>}
              <FieldLabel text="Daily visit target"><Input required type="number" min={0} max={100} value={form.dailyVisitTarget} onChange={(e) => set('dailyVisitTarget', e.target.value)} /></FieldLabel>
              <Button busy={busy} className="w-full">Save</Button>
            </form>
            {form.id && (
              <div className="space-y-3 border-t border-edge pt-4">
                <FieldLabel text="Set a new password"><div className="flex gap-2"><Input type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /><Button type="button" variant="ghost" busy={busy} disabled={newPassword.length < 10} onClick={reset}>Set</Button></div></FieldLabel>
                <Button type="button" variant={form.isActive ? 'danger' : 'soft'} busy={busy} className="w-full" onClick={toggle}>{form.isActive ? 'Deactivate account' : 'Reactivate account'}</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
