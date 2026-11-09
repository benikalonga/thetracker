'use client';
import { useEffect, useState } from 'react';
import { useMe } from '@/components/Shell';
import { Button, Card, Failed, FieldLabel, Input, Loading, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';

const FIELDS = [
  { key: 'geofenceMeters', text: 'Default check-in radius (m)', hint: 'How close an agent must be for a visit to count as on site.' },
  { key: 'pingSeconds', text: 'Location update interval (seconds)', hint: 'Shorter is more live but uses more battery.' },
  { key: 'retentionDays', text: 'Keep location history (days)', hint: 'Older route points are deleted automatically.' },
  { key: 'atRiskMultiplier', text: 'At-risk multiplier', hint: 'A customer becomes at risk after this many missed visit cycles.' },
];

export default function Settings() {
  const me = useMe();
  const canEdit = me.role === 'ADMIN';
  const { data, error, reload } = useData((u) => api(u), '/manage/settings');
  const [form, setForm] = useState<Record<string, string>>({});
  const { busy, run } = useAction();
  useEffect(() => { if (data) setForm(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))); }, [data]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => api('/manage/settings', { method: 'PUT', body: Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)])) }), 'Settings saved.');
  };

  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageTitle title="Settings" hint={canEdit ? undefined : 'Only an admin can change these.'} />
      <Card className="max-w-lg p-5">
        <form onSubmit={save} className="space-y-4">
          {FIELDS.map((f) => <FieldLabel key={f.key} text={f.text} hint={f.hint}><Input required type="number" step="any" disabled={!canEdit} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} /></FieldLabel>)}
          {canEdit && <Button busy={busy}>Save settings</Button>}
        </form>
      </Card>
    </>
  );
}
