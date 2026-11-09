import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, statusStyle } from '../theme';
import { initials } from '../lib/format';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export const Icon = Ionicons;

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.7 }]}>{children}</Pressable>;
  return <View style={[s.card, style]}>{children}</View>;
}

type Kind = 'primary' | 'soft' | 'ghost' | 'danger';
export function Button({ title, onPress, kind = 'primary', icon, busy, disabled, style }: { title: string; onPress: () => void; kind?: Kind; icon?: IconName; busy?: boolean; disabled?: boolean; style?: ViewStyle }) {
  const palette = { primary: [colors.brand, '#fff'], soft: [colors.brandSoft, colors.brand], ghost: ['transparent', colors.ink2], danger: [colors.badSoft, colors.bad] }[kind];
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={busy || disabled} style={({ pressed }) => [s.button, { backgroundColor: palette[0] }, kind === 'ghost' && s.ghost, (pressed || disabled) && { opacity: 0.6 }, style]}>
      {busy ? <ActivityIndicator color={palette[1]} /> : <>{icon && <Icon name={icon} size={18} color={palette[1]} />}<Text style={[s.buttonText, { color: palette[1] }]}>{title}</Text></>}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipOn]}>
      {icon && <Icon name={icon} size={14} color={active ? '#fff' : colors.ink2} />}
      <Text style={[s.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export const Badge = ({ text, fg, bg }: { text: string; fg: string; bg: string }) => (
  <View style={[s.badge, { backgroundColor: bg }]}><Text style={[s.badgeText, { color: fg }]}>{text}</Text></View>
);
export const StatusBadge = ({ status }: { status: string }) => {
  const st = statusStyle[status] ?? statusStyle.INACTIVE;
  return <Badge text={st.label} fg={st.fg} bg={st.bg} />;
};

export const Avatar = ({ name, color = colors.brand, soft = colors.brandSoft, size = 44 }: { name: string; color?: string; soft?: string; size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color, fontWeight: '700', fontSize: size * 0.36 }}>{initials(name)}</Text>
  </View>
);

export function Field({ label, hint, ...p }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.ink4} {...p} style={[s.input, p.multiline && { minHeight: 84, textAlignVertical: 'top' }, p.style]} />
      {hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
}

export const Label = ({ children }: { children: ReactNode }) => <Text style={s.label}>{children}</Text>;

export const SectionTitle = ({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) => (
  <View style={s.section}>
    <Text style={s.sectionTitle}>{title}</Text>
    {action && <Pressable onPress={onAction} hitSlop={10}><Text style={s.sectionAction}>{action}</Text></Pressable>}
  </View>
);

export const Empty = ({ icon, title, hint, children }: { icon: IconName; title: string; hint?: string; children?: ReactNode }) => (
  <View style={s.empty}>
    <Icon name={icon} size={36} color={colors.ink4} />
    <Text style={s.emptyTitle}>{title}</Text>
    {hint && <Text style={s.emptyHint}>{hint}</Text>}
    {children}
  </View>
);

export function ScreenHeader({ title, right, onBack }: { title: string; right?: ReactNode; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 10 }]}>
      {onBack && <Pressable accessibilityLabel="Back" onPress={onBack} hitSlop={12} style={{ marginRight: 10 }}><Icon name="chevron-back" size={26} color={colors.ink} /></Pressable>}
      <Text numberOfLines={1} style={s.headerTitle}>{title}</Text>
      {right}
    </View>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.sheetHead}>
          <Text style={s.sheetTitle}>{title}</Text>
          <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={10}><Icon name="close" size={24} color={colors.ink3} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>{children}</ScrollView>
      </View>
    </Modal>
  );
}

export const Row = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
export const Spinner = () => <View style={{ padding: 40 }}><ActivityIndicator color={colors.brand} /></View>;

export const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.edge, padding: 14 },
  button: { height: 48, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  ghost: { borderWidth: 1, borderColor: colors.edge },
  buttonText: { fontSize: 15, fontWeight: '700' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.edge },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700', color: colors.ink2, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.ink3, marginTop: 4 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.edge, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, color: colors.ink },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  sectionAction: { fontSize: 13, fontWeight: '700', color: colors.brand },
  empty: { alignItems: 'center', paddingVertical: 42, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 10 },
  emptyHint: { fontSize: 13, color: colors.ink3, textAlign: 'center', marginTop: 4 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.bg },
  headerTitle: { flex: 1, fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,18,43,0.45)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, maxHeight: '86%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  page: { flex: 1, backgroundColor: colors.bg },
});
