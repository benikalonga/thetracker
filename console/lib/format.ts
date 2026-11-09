const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || 'USD';
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY, maximumFractionDigits: cents % 100 ? 2 : 0 }).format((cents ?? 0) / 100);
export const dateTime = (v?: string | null) => (v ? new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const shortDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—');
export const time = (v?: string | null) => (v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
export const ago = (v?: string | null) => {
  if (!v) return 'Never';
  const mins = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
};
export const minutes = (a: string, b?: string | null) => (b ? `${Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000))} min` : '—');
export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const label = (v?: string | null) => {
  if (!v) return '—';
  const text = v.replace(/_/g, ' ').toLowerCase();
  return text[0].toUpperCase() + text.slice(1);
};

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'teal';
const TONES: Record<string, Tone> = {
  ACTIVE: 'green', COMPLETED: 'green', APPROVED: 'green', DONE: 'green', ORDER_TAKEN: 'green', PAYMENT_COLLECTED: 'green', SERVICE_DONE: 'green',
  AT_RISK: 'amber', PENDING: 'amber', IN_PROGRESS: 'blue', FOLLOW_UP: 'blue', LEAD: 'blue', OPEN: 'blue', ADMIN: 'teal', MANAGER: 'teal',
  REJECTED: 'red', HIGH: 'red', NOT_INTERESTED: 'red',
};
export const toneOf = (v?: string | null): Tone => TONES[v ?? ''] ?? 'gray';
export const statusColor: Record<string, string> = { LEAD: '#2478E0', ACTIVE: '#12A071', AT_RISK: '#D98A06', INACTIVE: '#7B7A90' };
