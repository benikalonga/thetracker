export const colors = {
  ink: '#14122B',
  ink2: '#4A4866',
  ink3: '#85839C',
  ink4: '#B9B8C9',
  brand: '#5B4BFF',
  brandDark: '#4436D6',
  brandSoft: '#EEECFF',
  bg: '#F6F6FA',
  card: '#FFFFFF',
  edge: '#E7E6F0',
  good: '#12A071',
  goodSoft: '#E2F6EF',
  warn: '#D98A06',
  warnSoft: '#FDF2DC',
  bad: '#DE3B4B',
  badSoft: '#FDE8EA',
  info: '#2478E0',
  infoSoft: '#E3EFFD',
  mute: '#7B7A90',
  muteSoft: '#EEEEF3',
};

export const statusStyle: Record<string, { fg: string; bg: string; label: string }> = {
  LEAD: { fg: colors.info, bg: colors.infoSoft, label: 'Lead' },
  ACTIVE: { fg: colors.good, bg: colors.goodSoft, label: 'Active' },
  AT_RISK: { fg: colors.warn, bg: colors.warnSoft, label: 'At risk' },
  INACTIVE: { fg: colors.mute, bg: colors.muteSoft, label: 'Inactive' },
};

export const outcomes = [
  { value: 'ORDER_TAKEN', label: 'Order taken', icon: 'cart-outline', money: true },
  { value: 'PAYMENT_COLLECTED', label: 'Payment collected', icon: 'cash-outline', money: true },
  { value: 'SERVICE_DONE', label: 'Service done', icon: 'construct-outline' },
  { value: 'FOLLOW_UP', label: 'Needs follow-up', icon: 'calendar-outline' },
  { value: 'NOT_AVAILABLE', label: 'Not available', icon: 'person-remove-outline' },
  { value: 'NOT_INTERESTED', label: 'Not interested', icon: 'close-circle-outline' },
  { value: 'OTHER', label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
] as const;

export const outcomeLabel = (v?: string | null) => outcomes.find((o) => o.value === v)?.label ?? '—';
