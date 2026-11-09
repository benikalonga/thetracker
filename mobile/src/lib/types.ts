export interface Profile {
  id: string; fullName: string; email: string; phone?: string | null; role: 'ADMIN' | 'MANAGER' | 'AGENT';
  dailyVisitTarget: number; manager?: { fullName: string; phone?: string | null } | null;
}
export interface Customer {
  id: string; code?: string; name: string; contactName?: string | null; phone?: string | null; email?: string | null;
  address?: string | null; city?: string | null; lat: number; lng: number;
  status: 'LEAD' | 'ACTIVE' | 'AT_RISK' | 'INACTIVE'; priority: 'LOW' | 'NORMAL' | 'HIGH';
  segment?: string | null; tags?: string[] | null; geofenceM?: number | null; visitEveryDays: number;
  lastVisitAt?: string | null; isFavorite?: boolean; assignedTo?: { id: string; fullName: string } | null;
}
export interface MiniCustomer { id: string; name: string; city?: string | null; lat: number; lng: number; address?: string | null; phone?: string | null; status?: string; priority?: string }
export interface Visit {
  id: string; status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; checkInAt: string; checkOutAt?: string | null;
  withinGeofence: boolean; checkInDistanceM?: number; overrideReason?: string | null; outcome?: string | null; summary?: string | null;
  orderCents: number; review?: string; customer: MiniCustomer; agent?: { id: string; fullName: string };
}
export interface Stop { id: string; customerId: string; position: number; status: 'PENDING' | 'VISITED' | 'SKIPPED'; skipReason?: string | null; customer: MiniCustomer }
export interface Plan { id: string; date: string; stops: Stop[]; summary?: { total: number; visited: number; skipped: number } }
export interface Task {
  id: string; title: string; details?: string | null; dueAt: string; priority: 'LOW' | 'NORMAL' | 'HIGH'; status: 'OPEN' | 'DONE' | 'CANCELLED';
  customerId?: string | null; customer?: MiniCustomer | null; createdBy?: { fullName: string };
}
export interface Today {
  date: string; shift: { id: string; startedAt: string; distanceKm?: number } | null; openVisit: Visit | null; plan: Plan | null; tasksDue: Task[]; unread: number;
  stats: { visits: number; target: number; orderCents: number; distanceKm: number; overdueTasks: number };
}
export interface Note { id: string; body: string; createdAt: string; author?: { id: string; fullName: string } }
export interface CustomerDetail extends Customer { notes: Note[]; visits: Visit[]; tasks: Task[]; totals: { visits: number; orderCents: number } }
export interface Position { lat: number; lng: number; accuracy?: number | null }
