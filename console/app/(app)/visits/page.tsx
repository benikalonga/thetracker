'use client';
import { useState } from 'react';
import { Badge, Button, Failed, FieldLabel, Input, Modal, PageTitle, Pager, Select, Table, TextArea } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, label, minutes, money } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { usePaged } from '@/lib/paged';

export default function Visits() {
  const list = usePaged('/visits', { review: '', date: '', status: '' });
  const [open, setOpen] = useState<any>(null);
  const [note, setNote] = useState('');
  const { busy, run } = useAction();

  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    const done = await run(() => api(`/visits/${open.id}/review`, { body: { decision, note: note || undefined } }), `Check-in ${decision.toLowerCase()}.`);
    if (done) { setOpen(null); setNote(''); list.reload(); }
  };

  return (
    <>
      <PageTitle title="Visits" hint="Every check-in, with off-site ones held for review." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Select aria-label="Review" className="!w-auto" value={list.filters.review} onChange={(e) => list.setFilter('review', e.target.value)} options={[{ value: '', label: 'All reviews' }, { value: 'PENDING', label: 'To review' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }]} />
        <Select aria-label="Status" className="!w-auto" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} options={[{ value: '', label: 'All statuses' }, 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']} />
        <Input aria-label="Date" type="date" className="!w-auto" value={list.filters.date} onChange={(e) => list.setFilter('date', e.target.value)} />
      </div>
      {list.error && <Failed message={list.error} retry={list.reload} />}
      <Table rows={list.items} loading={list.loading} empty="No visits match these filters." onRow={setOpen} columns={[
        { key: 'when', title: 'Checked in', render: (v) => dateTime(v.checkInAt) },
        { key: 'agent', title: 'Agent', render: (v) => v.agent.fullName },
        { key: 'customer', title: 'Customer', render: (v) => v.customer.name },
        { key: 'dist', title: 'Distance', right: true, render: (v) => `${v.checkInDistanceM} m` },
        { key: 'length', title: 'Length', right: true, render: (v) => minutes(v.checkInAt, v.checkOutAt) },
        { key: 'outcome', title: 'Outcome', render: (v) => (v.outcome ? <Badge value={v.outcome} /> : <Badge value={v.status} />) },
        { key: 'value', title: 'Value', right: true, render: (v) => (v.orderCents ? money(v.orderCents) : '—') },
        { key: 'review', title: 'Review', render: (v) => (v.review === 'NOT_NEEDED' ? <span className="text-ink-3">Verified</span> : <Badge value={v.review} />) },
      ]} />
      <Pager page={list.page} pages={list.data?.pages ?? 1} total={list.data?.total} onChange={list.setPage} />

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.customer.name ?? ''}>
        {open && (
          <div className="space-y-3 text-sm">
            <p><b>{open.agent.fullName}</b> checked in {dateTime(open.checkInAt)}, {open.checkInDistanceM} m from the customer.</p>
            {open.overrideReason && <p className="rounded-lg bg-amber-50 p-3 text-amber-800">Reason given: {open.overrideReason}</p>}
            {open.outcome && <p>Outcome: <b>{label(open.outcome)}</b>{open.orderCents ? ` · ${money(open.orderCents)}` : ''}</p>}
            {open.summary && <p className="text-ink-2">{open.summary}</p>}
            {open.reviewNote && <p className="text-ink-3">Review note: {open.reviewNote}</p>}
            {open.review === 'PENDING' && (
              <>
                <FieldLabel text="Note to the agent (optional)"><TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} /></FieldLabel>
                <div className="flex gap-2"><Button busy={busy} className="flex-1" onClick={() => decide('APPROVED')}>Approve</Button><Button busy={busy} variant="danger" className="flex-1" onClick={() => decide('REJECTED')}>Reject</Button></div>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
