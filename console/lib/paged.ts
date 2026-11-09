'use client';
import { useState } from 'react';
import { api } from './api';
import { qs, useData, useDebounced } from './hooks';

export function usePaged(path: string, initial: Record<string, string> = {}) {
  const [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(1);
  const debounced = useDebounced(filters);
  const result = useData((u) => api(u), `${path}${qs({ ...debounced, page })}`);
  const setFilter = (k: string, v: string) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v }));
  };
  return { ...result, filters, setFilter, page, setPage, items: (result.data?.items ?? []) as any[] };
}
