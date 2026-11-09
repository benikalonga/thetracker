import { useNavigation, useRoute } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Badge, Button, Card, Chip, Empty, Field, Icon, Row, Sheet, StatusBadge, s, type IconName } from '../components/ui';
import { dateTime, distance, duration, money, relativeDay, shortDate } from '../lib/format';
import { distanceM, insideGeofence } from '../lib/geo';
import type { MiniCustomer, Position } from '../lib/types';
import { useData } from '../store/data';
import { colors, outcomeLabel, statusStyle } from '../theme';

export const openNavigation = (c: { lat: number; lng: number }) =>
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`);

export async function currentPosition(): Promise<Position | null> {
  const fresh = useData.getState().position;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy };
  } catch {
    return fresh;
  }
}

const Tabs = ['Overview', 'Visits', 'Notes', 'Tasks'] as const;

export function CustomerDetailScreen() {
  const nav = useNavigation<any>();
  const { id } = useRoute<any>().params as { id: string };
  const insets = useSafeAreaInsets();
  const customer = useData((x) => x.customers.find((c) => c.id === id));
  const detail = useData((x) => x.details[id]);
  const openVisit = useData((x) => x.today?.openVisit);
  const position = useData((x) => x.position);
  const units = useData((x) => x.units);
  const geofenceDefault = useData((x) => x.settings.geofenceMeters);
  const { loadDetail, viewed, toggleFavorite, addNote, checkIn } = useData.getState();
  const [tab, setTab] = useState<(typeof Tabs)[number]>('Overview');
  const [note, setNote] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [away, setAway] = useState<{ pos: Position; metres: number; radius: number } | null>(null);
  const [reason, setReason] = useState('');
  const c = customer ?? detail;

  useEffect(() => {
    viewed(id);
    loadDetail(id).catch(() => {});
  }, [id]);

  if (!c) return <View style={s.page}><Empty icon="alert-circle-outline" title="Customer not found" hint="They may have been reassigned."><Button title="Go back" kind="soft" onPress={() => nav.goBack()} style={{ marginTop: 14 }} /></Empty></View>;

  const tone = statusStyle[c.status];
  const mini: MiniCustomer = { id: c.id, name: c.name, city: c.city, lat: c.lat, lng: c.lng, address: c.address, phone: c.phone };
  const here = openVisit?.customer.id === id;

  const begin = (pos: Position, why?: string, inside = true) => {
    checkIn(mini, pos, why, inside);
    setAway(null);
    setReason('');
    nav.navigate('Visit');
  };

  const onCheckIn = async () => {
    if (here) return nav.navigate('Visit');
    if (openVisit) return Alert.alert('Visit in progress', `Finish your visit at ${openVisit.customer.name} first.`, [{ text: 'Open it', onPress: () => nav.navigate('Visit') }, { text: 'Close', style: 'cancel' }]);
    setLocating(true);
    const pos = await currentPosition();
    setLocating(false);
    if (!pos) return Alert.alert('Location needed', 'Turn on location for TheTracker to check in.', [{ text: 'Open settings', onPress: () => Linking.openSettings() }, { text: 'Close', style: 'cancel' }]);
    const metres = distanceM(pos, c);
    const radius = c.geofenceM ?? geofenceDefault;
    if (insideGeofence(Math.round(metres), radius, pos.accuracy)) begin(pos);
    else setAway({ pos, metres, radius });
  };

  const share = () =>
    Share.share({ message: [c.name, c.contactName, c.phone, c.address, c.city, `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`].filter(Boolean).join('\n') });

  const digits = c.phone?.replace(/[^\d+]/g, '') ?? '';
  const actions: { icon: IconName; label: string; onPress: () => void; off?: boolean }[] = [
    { icon: 'call-outline', label: 'Call', onPress: () => Linking.openURL(`tel:${digits}`), off: !digits },
    { icon: 'chatbubble-outline', label: 'Text', onPress: () => Linking.openURL(`sms:${digits}`), off: !digits },
    { icon: 'logo-whatsapp', label: 'WhatsApp', onPress: () => Linking.openURL(`https://wa.me/${digits.replace('+', '')}`), off: !digits },
    { icon: 'mail-outline', label: 'Email', onPress: () => Linking.openURL(`mailto:${c.email}`), off: !c.email },
    { icon: 'navigate-outline', label: 'Directions', onPress: () => openNavigation(c) },
    { icon: 'share-outline', label: 'Share', onPress: share },
  ];

  const saveNote = () => {
    if (!note.trim()) return;
    addNote(id, note.trim());
    setNote('');
  };

  return (
    <View style={s.page}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadDetail(id).catch(() => {}); setRefreshing(false); }} />}>
        <View style={{ height: 210 }}>
          <MapView style={StyleSheet.absoluteFill} region={{ latitude: c.lat, longitude: c.lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }} scrollEnabled={false} zoomEnabled={false} pitchEnabled={false} rotateEnabled={false}>
            <Marker coordinate={{ latitude: c.lat, longitude: c.lng }} pinColor={tone.fg} tracksViewChanges={false} />
          </MapView>
          <Row style={{ ...st.overlay, top: insets.top + 8 }}>
            <Round icon="chevron-back" label="Back" onPress={() => nav.goBack()} />
            <View style={{ flex: 1 }} />
            <Round icon={c.isFavorite ? 'star' : 'star-outline'} tint={c.isFavorite ? colors.warn : colors.ink} label="Favorite" onPress={() => toggleFavorite(id)} />
            <Round icon="create-outline" label="Edit" onPress={() => nav.navigate('CustomerForm', { id })} />
          </Row>
        </View>

        <View style={{ padding: 16 }}>
          <Row>
            <Avatar name={c.name} color={tone.fg} soft={tone.bg} size={52} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={st.title} numberOfLines={2}>{c.name}</Text>
              <Text style={s.sub} numberOfLines={1}>{[c.address, c.city].filter(Boolean).join(', ') || 'No address yet'}</Text>
            </View>
          </Row>
          <Row style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <StatusBadge status={c.status} />
            {c.priority === 'HIGH' && <Badge text="High priority" fg={colors.bad} bg={colors.badSoft} />}
            {!!c.segment && <Badge text={c.segment} fg={colors.ink2} bg={colors.muteSoft} />}
            {position && <Badge text={`${distance(distanceM(position, c), units)} away`} fg={colors.brand} bg={colors.brandSoft} />}
          </Row>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16, marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {actions.map((a) => (
              <Pressable key={a.label} accessibilityLabel={a.label} disabled={a.off} onPress={a.onPress} style={[st.action, a.off && { opacity: 0.35 }]}>
                <Icon name={a.icon} size={20} color={colors.brand} />
                <Text style={st.actionText}>{a.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Row style={{ gap: 8, marginTop: 18, marginBottom: 12 }}>
            {Tabs.map((t) => <Chip key={t} label={t} active={tab === t} onPress={() => setTab(t)} />)}
          </Row>

          {tab === 'Overview' && (
            <Card>
              <Info label="Contact" value={c.contactName} />
              <Info label="Phone" value={c.phone} />
              <Info label="Email" value={c.email} />
              <Info label="Customer code" value={c.code} />
              <Info label="Last visit" value={relativeDay(c.lastVisitAt)} />
              <Info label="Visit every" value={`${c.visitEveryDays} days`} />
              <Info label="Check-in radius" value={distance(c.geofenceM ?? geofenceDefault, units)} />
              <Info label="Total visits" value={detail ? String(detail.totals.visits) : undefined} />
              <Info label="Total orders" value={detail ? money(detail.totals.orderCents) : undefined} last />
            </Card>
          )}

          {tab === 'Visits' && (detail?.visits.length ? detail.visits.map((v) => (
            <Card key={v.id} style={{ marginBottom: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={s.name}>{v.status === 'COMPLETED' ? outcomeLabel(v.outcome) : v.status === 'CANCELLED' ? 'Cancelled' : 'In progress'}</Text>
                {!v.withinGeofence && <Badge text="Off-site" fg={colors.warn} bg={colors.warnSoft} />}
              </Row>
              <Text style={s.sub}>{dateTime(v.checkInAt)}{v.checkOutAt ? ` · ${duration(v.checkInAt, v.checkOutAt)}` : ''}{v.agent ? ` · ${v.agent.fullName}` : ''}</Text>
              {v.orderCents > 0 && <Text style={st.money}>{money(v.orderCents)}</Text>}
              {!!v.summary && <Text style={st.body}>{v.summary}</Text>}
            </Card>
          )) : <Empty icon="footsteps-outline" title="No visits yet" />)}

          {tab === 'Notes' && (
            <>
              <TextInput accessibilityLabel="New note" value={note} onChangeText={setNote} placeholder="Add a note about this customer" placeholderTextColor={colors.ink4} multiline style={[s.input, { minHeight: 70 }]} />
              <Button title="Save note" kind="soft" onPress={saveNote} disabled={!note.trim()} style={{ marginTop: 8, marginBottom: 12 }} />
              {detail?.notes.map((n) => (
                <Card key={n.id} style={{ marginBottom: 8 }}>
                  <Text style={st.bodyTop}>{n.body}</Text>
                  <Text style={[s.sub, { marginTop: 6 }]}>{n.author?.fullName} · {dateTime(n.createdAt)}</Text>
                </Card>
              ))}
            </>
          )}

          {tab === 'Tasks' && (detail?.tasks.length ? detail.tasks.map((t) => (
            <Card key={t.id} style={{ marginBottom: 8 }}>
              <Text style={s.name}>{t.title}</Text>
              <Text style={s.sub}>Due {shortDate(t.dueAt)}</Text>
            </Card>
          )) : <Empty icon="checkbox-outline" title="No open tasks" />)}
        </View>
      </ScrollView>

      <View style={[st.footer, { paddingBottom: insets.bottom + 10 }]}>
        <Button title={here ? 'Continue visit' : 'Check in'} icon="location" onPress={onCheckIn} busy={locating} />
      </View>

      <Sheet open={!!away} onClose={() => setAway(null)} title="You are not at this customer">
        {away && (
          <>
            <Text style={st.bodyTop}>You are {distance(away.metres, units)} away. Check-ins are verified within {distance(away.radius, units)}. You can still check in, but your manager will review this visit.</Text>
            <View style={{ height: 14 }} />
            <Field label="Why are you checking in from here?" value={reason} onChangeText={setReason} placeholder="For example: the shop has moved next door" maxLength={255} />
            <Button title="Check in anyway" onPress={() => begin(away.pos, reason.trim(), false)} disabled={reason.trim().length < 3} />
          </>
        )}
      </Sheet>
    </View>
  );
}

const Round = ({ icon, label, onPress, tint = colors.ink }: { icon: IconName; label: string; onPress: () => void; tint?: string }) => (
  <Pressable accessibilityLabel={label} onPress={onPress} style={st.round}><Icon name={icon} size={21} color={tint} /></Pressable>
);
const Info = ({ label, value, last }: { label: string; value?: string | null; last?: boolean }) => (
  <Row style={{ justifyContent: 'space-between', paddingVertical: 9, ...(last ? {} : { borderBottomWidth: 1, borderBottomColor: colors.edge }) }}>
    <Text style={{ color: colors.ink3, fontSize: 14 }}>{label}</Text>
    <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600', flexShrink: 1, marginLeft: 16 }} numberOfLines={1}>{value || '—'}</Text>
  </Row>
);

const st = StyleSheet.create({
  overlay: { position: 'absolute', left: 14, right: 14, gap: 8 },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  title: { fontSize: 21, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  action: { width: 76, paddingVertical: 11, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.edge, alignItems: 'center', gap: 4 },
  actionText: { fontSize: 11, fontWeight: '600', color: colors.ink2 },
  money: { fontSize: 15, fontWeight: '800', color: colors.good, marginTop: 6 },
  body: { fontSize: 14, color: colors.ink2, marginTop: 6, lineHeight: 20 },
  bodyTop: { fontSize: 14, color: colors.ink2, lineHeight: 20 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.edge },
});
