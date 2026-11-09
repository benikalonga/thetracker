import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, Card, Empty, Field, Icon, Row, ScreenHeader, Sheet, s } from '../components/ui';
import { api } from '../lib/api';
import { distance, kmValue } from '../lib/format';
import { distanceM } from '../lib/geo';
import type { Plan } from '../lib/types';
import { useData } from '../store/data';
import { colors } from '../theme';

export function RouteScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const today = useData((x) => x.today);
  const customers = useData((x) => x.customers);
  const position = useData((x) => x.position);
  const units = useData((x) => x.units);
  const online = useData((x) => x.online);
  const { skipStop, restoreStop } = useData.getState();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [skipping, setSkipping] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState('');

  const stops = today?.plan?.stops ?? [];
  const pending = stops.filter((x) => x.status === 'PENDING');
  const planned = useMemo(() => new Set(stops.map((x) => x.customerId)), [stops]);
  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers
      .filter((c) => !planned.has(c.id) && (!q || c.name.toLowerCase().includes(q)))
      .map((c) => ({ ...c, away: position ? distanceM(position, c) : Infinity }))
      .sort((a, b) => a.away - b.away)
      .slice(0, 60);
  }, [customers, planned, search, position]);

  const setPlan = (plan: Plan) => useData.setState((x) => (x.today ? { today: { ...x.today, plan } } : {}));
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      Alert.alert('Could not update the route', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const savePlan = (customerIds: string[], optimize = false) =>
    run(async () => {
      setPlan(await api<Plan>('/plans', { method: 'PUT', body: { date: today!.date, customerIds, optimize, lat: position?.lat, lng: position?.lng } }));
    });

  const optimize = () =>
    run(async () => {
      const res = await api<{ plan: Plan; beforeKm: number; afterKm: number }>(`/plans/${today!.plan!.id}/optimize`, { body: { lat: position?.lat, lng: position?.lng } });
      setPlan(res.plan);
      const savedKm = res.beforeKm - res.afterKm;
      setSaved(savedKm > 0.05 ? `Route shortened by ${kmValue(savedKm, units)}. About ${kmValue(res.afterKm, units)} to drive.` : `This is already the shortest order. About ${kmValue(res.afterKm, units)} to drive.`);
    });

  const pendingIds = pending.map((x) => x.customerId);
  const move = (index: number, by: number) => {
    const next = [...pendingIds];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    void savePlan(next);
  };

  const addChosen = () => {
    setPicking(false);
    const ids = [...pendingIds, ...chosen];
    setChosen([]);
    void savePlan(ids);
  };

  const openFullRoute = () => {
    const coords = pending.slice(0, 10).map((x) => `${x.customer.lat},${x.customer.lng}`);
    const destination = coords.pop();
    const waypoints = coords.length ? `&waypoints=${coords.join('%7C')}` : '';
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}${waypoints}&travelmode=driving`);
  };

  const confirmSkip = () => {
    if (skipping) skipStop(skipping, reason.trim());
    setSkipping(null);
    setReason('');
  };

  return (
    <View style={s.page}>
      <ScreenHeader title="Today's route" onBack={() => nav.goBack()} right={<Pressable accessibilityLabel="Add stops" onPress={() => setPicking(true)} hitSlop={10}><Icon name="add-circle" size={30} color={colors.brand} /></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {!online && <Card style={{ backgroundColor: colors.warnSoft, borderColor: colors.warnSoft, marginBottom: 12 }}><Text style={{ color: colors.warn, fontWeight: '600' }}>You can skip stops offline. Reordering needs a connection.</Text></Card>}
        {!stops.length && <Empty icon="trail-sign-outline" title="No stops planned" hint="Add the customers you want to see today, then let TheTracker find the shortest order."><Button title="Add stops" onPress={() => setPicking(true)} style={{ marginTop: 14 }} /></Empty>}

        {pending.length > 1 && (
          <Row style={{ gap: 8, marginBottom: 12 }}>
            <Button title="Shortest route" icon="sparkles-outline" onPress={optimize} busy={busy} disabled={!online} style={{ flex: 1 }} />
            <Button title="Open in Maps" kind="soft" icon="navigate-outline" onPress={openFullRoute} style={{ flex: 1 }} />
          </Row>
        )}
        {!!saved && <Text style={st.saved}>{saved}</Text>}

        {stops.map((stop) => {
          const index = pending.indexOf(stop);
          const isPending = stop.status === 'PENDING';
          return (
            <Card key={stop.id} style={{ marginBottom: 8, opacity: isPending ? 1 : 0.65 }} onPress={() => nav.navigate('Customer', { id: stop.customerId })}>
              <Row>
                <View style={[st.num, stop.status === 'VISITED' && { backgroundColor: colors.goodSoft }, stop.status === 'SKIPPED' && { backgroundColor: colors.muteSoft }]}>
                  {isPending ? <Text style={st.numText}>{index + 1}</Text> : <Icon name={stop.status === 'VISITED' ? 'checkmark' : 'remove'} size={16} color={stop.status === 'VISITED' ? colors.good : colors.mute} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{stop.customer.name}</Text>
                  <Text style={s.sub} numberOfLines={1}>{stop.status === 'SKIPPED' ? `Skipped: ${stop.skipReason}` : [stop.customer.address, position && distance(distanceM(position, stop.customer), units)].filter(Boolean).join(' · ')}</Text>
                </View>
                {isPending && (
                  <Row style={{ gap: 12 }}>
                    <Pressable accessibilityLabel="Move up" disabled={index === 0 || busy || !online} onPress={() => move(index, -1)} hitSlop={6}><Icon name="chevron-up" size={22} color={index === 0 || !online ? colors.ink4 : colors.ink2} /></Pressable>
                    <Pressable accessibilityLabel="Move down" disabled={index === pending.length - 1 || busy || !online} onPress={() => move(index, 1)} hitSlop={6}><Icon name="chevron-down" size={22} color={index === pending.length - 1 || !online ? colors.ink4 : colors.ink2} /></Pressable>
                    <Pressable accessibilityLabel="Skip stop" onPress={() => setSkipping(stop.id)} hitSlop={6}><Icon name="close" size={22} color={colors.ink3} /></Pressable>
                  </Row>
                )}
                {stop.status === 'SKIPPED' && <Pressable onPress={() => restoreStop(stop.id)} hitSlop={8}><Badge text="Restore" fg={colors.brand} bg={colors.brandSoft} /></Pressable>}
              </Row>
            </Card>
          );
        })}
      </ScrollView>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Add stops">
        <TextInput accessibilityLabel="Search customers to add" value={search} onChangeText={setSearch} placeholder="Search customers" placeholderTextColor={colors.ink4} style={[s.input, { marginBottom: 10 }]} />
        {options.map((c) => {
          const on = chosen.includes(c.id);
          return (
            <Pressable key={c.id} onPress={() => setChosen(on ? chosen.filter((x) => x !== c.id) : [...chosen, c.id])} style={st.option}>
              <Icon name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.brand : colors.ink4} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.name} numberOfLines={1}>{c.name}</Text>
                {Number.isFinite(c.away) && <Text style={s.sub}>{distance(c.away, units)} away</Text>}
              </View>
            </Pressable>
          );
        })}
        <Button title={chosen.length ? `Add ${chosen.length} stop${chosen.length === 1 ? '' : 's'}` : 'Choose customers'} disabled={!chosen.length || !online} onPress={addChosen} style={{ marginTop: 10 }} />
      </Sheet>

      <Sheet open={!!skipping} onClose={() => setSkipping(null)} title="Skip this stop">
        <Field label="Reason" value={reason} onChangeText={setReason} placeholder="For example: closed today" maxLength={255} />
        <Button title="Skip stop" onPress={confirmSkip} disabled={reason.trim().length < 2} />
      </Sheet>
    </View>
  );
}

const st = StyleSheet.create({
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  numText: { color: colors.brand, fontWeight: '800', fontSize: 13 },
  saved: { fontSize: 13, color: colors.good, fontWeight: '600', marginBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.edge },
});
