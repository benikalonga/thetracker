import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, Card, Chip, Empty, Field, Icon, Label, Row, ScreenHeader, s } from '../components/ui';
import { duration, time } from '../lib/format';
import { useData } from '../store/data';
import { colors, outcomes } from '../theme';

const FOLLOW_UPS = [{ label: 'Tomorrow', days: 1 }, { label: 'In 3 days', days: 3 }, { label: 'Next week', days: 7 }, { label: 'In 2 weeks', days: 14 }];
const at9am = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};

/** Accepts "1,250.50" or "1250" and returns cents, or null when it cannot be read. */
export const parseAmount = (text: string): number | null => {
  const clean = text.replace(/[,\s]/g, '');
  if (!clean) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
};

export function VisitScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const visit = useData((x) => x.today?.openVisit);
  const { checkOut, cancelVisit } = useData.getState();
  const [outcome, setOutcome] = useState('');
  const [summary, setSummary] = useState('');
  const [amount, setAmount] = useState('');
  const [followIn, setFollowIn] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!visit) return <View style={s.page}><ScreenHeader title="Visit" onBack={() => nav.goBack()} /><Empty icon="checkmark-circle-outline" title="No visit in progress" /></View>;

  const selected = outcomes.find((o) => o.value === outcome);
  const takesMoney = !!selected && 'money' in selected;

  const finish = () => {
    if (!outcome) return setError('Choose how the visit went.');
    if (outcome === 'FOLLOW_UP' && followIn == null) return setError('Choose when to follow up.');
    const orderCents = takesMoney ? parseAmount(amount) : 0;
    if (orderCents == null) return setError('Enter the amount as a number, like 1250.50.');
    checkOut({ outcome, summary: summary.trim() || undefined, orderCents, followUpAt: followIn != null ? at9am(followIn) : null });
    nav.goBack();
  };

  const abandon = () =>
    Alert.alert('Cancel this visit?', 'It will not count towards your visits.', [
      { text: 'Keep visit', style: 'cancel' },
      { text: 'Cancel visit', style: 'destructive', onPress: () => { cancelVisit(); nav.goBack(); } },
    ]);

  return (
    <View style={s.page}>
      <ScreenHeader title="Visit" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Card style={{ backgroundColor: colors.ink, borderColor: colors.ink, marginBottom: 18 }}>
          <Text style={st.live}>In progress since {time(visit.checkInAt)}</Text>
          <Text style={st.name} numberOfLines={2}>{visit.customer.name}</Text>
          <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
            <Row style={{ gap: 6 }}><Icon name="time-outline" size={16} color="#B5B2D6" /><Text style={st.meta}>{duration(visit.checkInAt)}</Text></Row>
            {visit.withinGeofence ? <Badge text="Verified on site" fg="#7CF5C4" bg="rgba(124,245,196,0.14)" /> : <Badge text="Needs review" fg="#FFC46B" bg="rgba(255,196,107,0.14)" />}
          </Row>
        </Card>

        <Label>How did it go? *</Label>
        <View style={st.grid}>
          {outcomes.map((o) => {
            const on = outcome === o.value;
            return (
              <Pressable key={o.value} onPress={() => { setOutcome(o.value); setError(''); }} style={[st.outcome, on && st.outcomeOn]}>
                <Icon name={o.icon} size={20} color={on ? colors.brand : colors.ink3} />
                <Text style={[st.outcomeText, on && { color: colors.brand }]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {takesMoney && <Field label={outcome === 'ORDER_TAKEN' ? 'Order value' : 'Amount collected'} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />}
        <Field label="Visit notes" value={summary} onChangeText={setSummary} multiline placeholder="What was discussed?" />

        <Label>{outcome === 'FOLLOW_UP' ? 'Follow up *' : 'Follow up (optional)'}</Label>
        <Row style={{ gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {FOLLOW_UPS.map((f) => <Chip key={f.days} label={f.label} active={followIn === f.days} onPress={() => setFollowIn(followIn === f.days ? null : f.days)} />)}
        </Row>

        {!!error && <Text style={st.error}>{error}</Text>}
        <Button title="Check out" icon="log-out-outline" onPress={finish} />
        <Button title="Cancel visit" kind="ghost" onPress={abandon} style={{ marginTop: 10 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  live: { color: '#B5B2D6', fontSize: 13, fontWeight: '600' },
  name: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 3 },
  meta: { color: '#fff', fontSize: 14, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  outcome: { width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.edge, borderRadius: 13, padding: 12 },
  outcomeOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  outcomeText: { fontSize: 13, fontWeight: '600', color: colors.ink2, flexShrink: 1 },
  error: { color: colors.bad, fontSize: 14, marginBottom: 12 },
});
