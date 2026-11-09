'use client';
import { Failed, PageTitle, Pager, Table } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { usePaged } from '@/lib/paged';

export default function Audit() {
  const list = usePaged('/manage/audit');
  return (
    <>
      <PageTitle title="Audit log" hint="Who changed what." />
      {list.error && <Failed message={list.error} retry={list.reload} />}
      <Table rows={list.items} loading={list.loading} empty="Nothing recorded yet." columns={[
        { key: 'at', title: 'When', render: (a) => dateTime(a.createdAt) },
        { key: 'actor', title: 'Who', render: (a) => a.actor?.fullName ?? 'System' },
        { key: 'action', title: 'Action' },
        { key: 'entity', title: 'Record' },
        { key: 'data', title: 'Details', render: (a) => <code className="text-xs text-ink-3">{a.data ? JSON.stringify(a.data) : '—'}</code> },
      ]} />
      <Pager page={list.page} pages={list.data?.pages ?? 1} total={list.data?.total} onChange={list.setPage} />
    </>
  );
}
