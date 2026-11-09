import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { api, ApiError, restoreTokens, setExpiredHandler, signIn as apiSignIn, setReachabilityHandler, signOutRemote } from '../lib/api';
import type { Units } from '../lib/format';
import type { Customer, CustomerDetail, MiniCustomer, Position, Profile, Task, Today, Visit } from '../lib/types';

export interface Op { id: string; method: string; path: string; body?: any; label: string; createdAt: string; error?: string }
export interface Ping { lat: number; lng: number; accuracy?: number | null; speed?: number | null; recordedAt: string }

interface State {
  profile: Profile | null;
  settings: { geofenceMeters: number; pingSeconds: number };
  customers: Customer[];
  tasks: Task[];
  today: Today | null;
  details: Record<string, CustomerDetail>;
  recents: string[];
  outbox: Op[];
  failed: Op[];
  pings: Ping[];
  lastSyncAt: string | null;
  units: Units;
  shareLocation: boolean;

  // Not persisted
  ready: boolean;
  signedIn: boolean;
  online: boolean;
  syncing: boolean;
  position: Position | null;

  boot(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
  flush(): Promise<void>;
  flushPings(battery?: number | null): Promise<void>;
  loadDetail(id: string): Promise<void>;
  viewed(id: string): void;
  setOnline(v: boolean): void;
  setPosition(p: Position): void;
  addPing(p: Ping): void;
  setPrefs(p: Partial<Pick<State, 'units' | 'shareLocation'>>): void;
  retryFailed(id: string): void;
  discardFailed(id: string): void;

  saveCustomer(values: Partial<Customer>, id?: string): Customer;
  toggleFavorite(id: string): void;
  addNote(customerId: string, body: string): void;
  startShift(): void;
  endShift(): void;
  checkIn(customer: MiniCustomer, pos: Position, reason?: string, withinGeofence?: boolean): Visit;
  checkOut(input: { outcome: string; summary?: string; orderCents?: number; followUpAt?: string | null }): void;
  cancelVisit(): void;
  addTask(input: { title: string; details?: string; dueAt: string; priority: Task['priority']; customer?: MiniCustomer | null }): void;
  setTaskDone(id: string, done: boolean): void;
  skipStop(id: string, reason: string): void;
  restoreStop(id: string): void;
}

const now = () => new Date().toISOString();
const MAX_PINGS = 2000;
const blank = {
  profile: null, customers: [], tasks: [], today: null, details: {}, recents: [], outbox: [], failed: [], pings: [], lastSyncAt: null,
};

export const useData = create<State>()(
  persist(
    (set, get) => {
      const enqueue = (method: string, path: string, body: any, label: string) => {
        const op: Op = { id: Crypto.randomUUID(), method, path, body, label, createdAt: now() };
        set((s) => ({ outbox: [...s.outbox, op] }));
        void get().flush();
      };
      const patchToday = (fn: (t: Today) => Partial<Today>) => set((s) => (s.today ? { today: { ...s.today, ...fn(s.today) } } : {}));
      const patchCustomer = (id: string, patch: Partial<Customer>) =>
        set((s) => ({
          customers: s.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          details: s.details[id] ? { ...s.details, [id]: { ...s.details[id], ...patch } } : s.details,
        }));
      const here = () => {
        const p = get().position;
        return p ? { lat: p.lat, lng: p.lng } : {};
      };

      return {
        ...blank,
        settings: { geofenceMeters: 150, pingSeconds: 60 },
        units: 'km',
        shareLocation: true,
        ready: false,
        signedIn: false,
        online: true,
        syncing: false,
        position: null,

        async boot() {
          setExpiredHandler(() => {
            set({ ...blank, signedIn: false });
          });
          setReachabilityHandler((reachable) => get().setOnline(reachable));
          const hasSession = await restoreTokens();
          set({ signedIn: hasSession && !!get().profile, ready: true });
          if (get().signedIn) void get().refresh();
        },

        async signIn(email, password) {
          const profile = await apiSignIn(email, password);
          set({ ...blank, profile, signedIn: true });
          await get().refresh();
        },

        async signOut() {
          await signOutRemote();
          set({ ...blank, signedIn: false });
        },

        /** Send queued work first; server data only replaces local data once nothing is left to send. */
        async refresh() {
          await get().flush();
          if (get().outbox.length) return;
          try {
            const [customers, tasks, today, me] = await Promise.all([
              api<{ items: Customer[] }>('/customers?all=1'),
              api<{ items: Task[] }>('/tasks?all=1&status=OPEN'),
              api<Today>('/agent/today'),
              api<{ profile: Profile; settings: State['settings'] }>('/auth/me'),
            ]);
            if (get().outbox.length || !get().signedIn) return;
            set({ customers: customers.items, tasks: tasks.items, today, profile: me.profile, settings: me.settings, lastSyncAt: now() });
          } catch (err) {
            if (!(err instanceof ApiError) || !err.retryable) throw err;
          }
        },

        async flush() {
          if (get().syncing || !get().signedIn) return;
          set({ syncing: true });
          try {
            while (get().outbox.length) {
              const op = get().outbox[0];
              try {
                await api(op.path, { method: op.method, body: op.body });
                set((s) => ({ outbox: s.outbox.filter((o) => o.id !== op.id) }));
              } catch (err) {
                const e = err as ApiError;
                if (e.retryable || e.status === 401) break; // try again later, in order
                set((s) => ({ outbox: s.outbox.filter((o) => o.id !== op.id), failed: [...s.failed, { ...op, error: e.message }] }));
              }
            }
          } finally {
            set({ syncing: false });
          }
        },

        /** Positions go after queued actions so a shift always reaches the server before its trail. */
        async flushPings(battery) {
          const { pings, outbox, signedIn } = get();
          if (!signedIn || outbox.length || !pings.length) return;
          const batch = pings.slice(0, 500);
          try {
            await api('/agent/locations', { body: { points: batch, battery } });
            const sent = new Set(batch.map((p) => p.recordedAt));
            set((s) => ({ pings: s.pings.filter((p) => !sent.has(p.recordedAt)) }));
          } catch (err) {
            if (err instanceof ApiError && !err.retryable) set({ pings: [] });
          }
        },

        async loadDetail(id) {
          const detail = await api<CustomerDetail>(`/customers/${id}`);
          if (get().signedIn) set((s) => {
            const keep = Object.values(s.details).slice(-29).reduce<Record<string, CustomerDetail>>((acc, d) => ({ ...acc, [d.id]: d }), {});
            return { details: { ...keep, [id]: detail } };
          });
        },

        viewed: (id) => set((s) => ({ recents: [id, ...s.recents.filter((r) => r !== id)].slice(0, 5) })),
        setOnline: (online) => {
          const was = get().online;
          if (online === was) return;
          set({ online });
          if (online) void get().refresh();
        },
        setPosition: (position) => set({ position }),
        addPing: (p) => set((s) => ({ pings: [...s.pings, p].slice(-MAX_PINGS) })),
        setPrefs: (p) => set(p),
        retryFailed: (id) => {
          const op = get().failed.find((o) => o.id === id);
          if (!op) return;
          set((s) => ({ failed: s.failed.filter((o) => o.id !== id), outbox: [...s.outbox, { ...op, error: undefined }] }));
          void get().flush();
        },
        discardFailed: (id) => {
          set((s) => ({ failed: s.failed.filter((o) => o.id !== id) }));
          void get().refresh();
        },

        saveCustomer(values, id) {
          if (id) {
            patchCustomer(id, values);
            enqueue('PATCH', `/customers/${id}`, values, `Update ${values.name ?? 'customer'}`);
            return get().customers.find((c) => c.id === id)!;
          }
          const created = { status: 'LEAD', priority: 'NORMAL', visitEveryDays: 30, ...values, id: Crypto.randomUUID() } as Customer;
          set((s) => ({ customers: [...s.customers, created] }));
          enqueue('POST', '/customers', created, `Add ${created.name}`);
          return created;
        },

        toggleFavorite(id) {
          const on = !get().customers.find((c) => c.id === id)?.isFavorite;
          patchCustomer(id, { isFavorite: on });
          enqueue(on ? 'PUT' : 'DELETE', `/customers/${id}/favorite`, undefined, on ? 'Add favorite' : 'Remove favorite');
        },

        addNote(customerId, body) {
          const id = Crypto.randomUUID();
          const { profile } = get();
          set((s) => {
            const d = s.details[customerId];
            return d ? { details: { ...s.details, [customerId]: { ...d, notes: [{ id, body, createdAt: now(), author: { id: profile!.id, fullName: profile!.fullName } }, ...d.notes] } } } : {};
          });
          enqueue('POST', `/customers/${customerId}/notes`, { id, body }, 'Add note');
        },

        startShift() {
          patchToday(() => ({ shift: { id: 'local', startedAt: now() } }));
          enqueue('POST', '/agent/shift/start', { ...here(), occurredAt: now() }, 'Start shift');
        },

        endShift() {
          patchToday(() => ({ shift: null }));
          enqueue('POST', '/agent/shift/end', { ...here(), occurredAt: now() }, 'End shift');
        },

        checkIn(customer, pos, reason, withinGeofence = true) {
          const visit: Visit = { id: Crypto.randomUUID(), status: 'IN_PROGRESS', checkInAt: now(), withinGeofence, orderCents: 0, customer };
          patchToday((t) => ({ openVisit: visit, shift: t.shift ?? { id: 'local', startedAt: visit.checkInAt } }));
          enqueue('POST', '/visits/check-in', { id: visit.id, customerId: customer.id, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, overrideReason: reason, occurredAt: visit.checkInAt }, `Check in at ${customer.name}`);
          return visit;
        },

        checkOut({ outcome, summary, orderCents, followUpAt }) {
          const visit = get().today?.openVisit;
          if (!visit) return;
          const customerId = visit.customer.id;
          const followUpTaskId = followUpAt ? Crypto.randomUUID() : undefined;
          patchToday((t) => ({
            openVisit: null,
            stats: { ...t.stats, visits: t.stats.visits + 1, orderCents: t.stats.orderCents + (orderCents ?? 0) },
            plan: t.plan ? { ...t.plan, stops: t.plan.stops.map((s) => (s.customerId === customerId && s.status === 'PENDING' ? { ...s, status: 'VISITED' as const } : s)) } : null,
          }));
          if (outcome !== 'NOT_AVAILABLE') patchCustomer(customerId, { lastVisitAt: now() });
          if (followUpAt && followUpTaskId) {
            set((s) => ({ tasks: [...s.tasks, { id: followUpTaskId, title: `Follow up with ${visit.customer.name}`, details: summary, dueAt: followUpAt, priority: 'NORMAL', status: 'OPEN', customerId, customer: visit.customer }] }));
          }
          enqueue('POST', `/visits/${visit.id}/check-out`, { ...here(), outcome, summary, orderCents, followUpAt, followUpTaskId, occurredAt: now() }, `Check out of ${visit.customer.name}`);
        },

        cancelVisit() {
          const visit = get().today?.openVisit;
          if (!visit) return;
          patchToday(() => ({ openVisit: null }));
          enqueue('POST', `/visits/${visit.id}/cancel`, undefined, 'Cancel visit');
        },

        addTask({ title, details, dueAt, priority, customer }) {
          const task: Task = { id: Crypto.randomUUID(), title, details, dueAt, priority, status: 'OPEN', customerId: customer?.id ?? null, customer };
          set((s) => ({ tasks: [...s.tasks, task] }));
          enqueue('POST', '/tasks', { id: task.id, title, details, dueAt, priority, customerId: customer?.id }, `Add task: ${title}`);
        },

        setTaskDone(id, done) {
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: done ? 'DONE' : 'OPEN' } : t)) }));
          patchToday((t) => ({ tasksDue: t.tasksDue.map((x) => (x.id === id ? { ...x, status: done ? 'DONE' : 'OPEN' } : x)) }));
          enqueue('POST', `/tasks/${id}/${done ? 'complete' : 'reopen'}`, undefined, done ? 'Complete task' : 'Reopen task');
        },

        skipStop(id, reason) {
          patchToday((t) => ({ plan: t.plan ? { ...t.plan, stops: t.plan.stops.map((s) => (s.id === id ? { ...s, status: 'SKIPPED', skipReason: reason } : s)) } : null }));
          enqueue('POST', `/plans/stops/${id}/skip`, { reason }, 'Skip stop');
        },

        restoreStop(id) {
          patchToday((t) => ({ plan: t.plan ? { ...t.plan, stops: t.plan.stops.map((s) => (s.id === id ? { ...s, status: 'PENDING', skipReason: null } : s)) } : null }));
          enqueue('POST', `/plans/stops/${id}/restore`, undefined, 'Restore stop');
        },
      };
    },
    {
      name: 'thetracker.data',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ ready, signedIn, online, syncing, position, ...keep }) =>
        Object.fromEntries(Object.entries(keep).filter(([, v]) => typeof v !== 'function')) as any,
    },
  ),
);

export const refreshApp = () => useData.getState().refresh();
