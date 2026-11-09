const CURRENCY = process.env.EXPO_PUBLIC_CURRENCY || 'USD';

export const money = (cents: number) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  } catch {
    return `${CURRENCY} ${(cents / 100).toFixed(2)}`;
  }
};

export type Units = 'km' | 'mi';
export const distance = (metres: number, units: Units = 'km') => {
  if (units === 'mi') {
    const miles = metres / 1609.34;
    return miles < 0.1 ? `${Math.round(metres * 3.281)} ft` : `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  return metres < 1000 ? `${Math.round(metres)} m` : `${metres < 10_000 ? (metres / 1000).toFixed(1) : Math.round(metres / 1000)} km`;
};
export const kmValue = (km: number, units: Units = 'km') => `${(units === 'mi' ? km / 1.60934 : km).toFixed(1)} ${units}`;

const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const daysFromToday = (iso: string) => Math.round((startOf(new Date(iso)) - startOf(new Date())) / 864e5);

export const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
export const dateTime = (iso: string) => `${shortDate(iso)}, ${time(iso)}`;

export function relativeDay(iso?: string | null): string {
  if (!iso) return 'Never';
  const days = -daysFromToday(iso);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days === -1) return 'Tomorrow';
  if (days < 0) return `In ${-days} days`;
  return days < 45 ? `${days} days ago` : shortDate(iso);
}

export const duration = (fromIso: string, to: Date | string = new Date()) => {
  const mins = Math.max(0, Math.floor((new Date(to).getTime() - new Date(fromIso).getTime()) / 60_000));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
};

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
export const isVisitDue = (c: { lastVisitAt?: string | null; visitEveryDays: number; status: string }) =>
  c.status !== 'INACTIVE' && (!c.lastVisitAt || Date.now() - new Date(c.lastVisitAt).getTime() > c.visitEveryDays * 864e5);
