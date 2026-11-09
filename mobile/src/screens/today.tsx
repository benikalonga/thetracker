import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, Card, Empty, Icon, Row, SectionTitle, StatusBadge, s } from '../components/ui';
import { distance, duration, greeting, kmValue, money, relativeDay } from '../lib/format';
import { distanceM } from '../lib/geo';
import { useData } from '../store/data';
import { colors, statusStyle } from '../theme';

export function SyncPill() {
  const nav = useNavigation<any>();
  const online = useData((x) => x.online);
  const pending = useData((x) => x.outbox.length);
  const failed = useData((x) => x.failed.length);
  if (online && !pending && !failed) return null;
  const [text, fg, bg, icon] = failed
    ? [`${failed} failed`, colors.bad, colors.badSoft, 'alert-circle']
    : !online ? [pending ? `Offline · ${pending}` : 'Offline', colors.warn, colors.warnSoft, 'cloud-offline']
    : [`Sending ${pending}`, colors.info, colors.infoSoft, 'cloud-upload'];
  return (
    <Pressable onPress={() => nav.navigate('Sync')} style={[st.pill, { backgroundColor: bg }]}>
      <Icon name={icon as any} size={13} color={fg} /><Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </Pressable>
  );
}

export function TodayScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const today = useData((x) => x.today);
  const profile = useData((x) => x.profile);
  const customers = useData((x) => x.customers);
  const recents = useData((x) => x.recents);
  const position = useData((x) => x.position);
  const units = useData((x) => x.units);
  const { startShift, endShift, refresh, setTaskDone } = useData.getState();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh().catch(() => {});
    setRefreshing(false);
  };

  const stops = today?.plan?.stops ?? [];
  const pending = stops.filter((x) => x.status === 'PENDING');
  const recentCustomers = useMemo(() => recents.map((id) => customers.find((c) => c.id === id)).filter(Boolean) as typeof customers, [recents, customers]);
  const stats = today?.stats;
  const progress = stats?.target ? Math.min(1, stats.visits / stats.target) : 0;
  const tasks = (today?.tasksDue ?? []).filter((t) => t.status === 'OPEN').slice(0, 4);

  const finishShift = () =>
    Alert.alert('End your shift?', 'Your location will stop being shared.', [
      { text: 'Keep working', style: 'cancel' },
      { text: 'End shift', style: 'destructive', onPress: endShift },
    ]);

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 10, paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Row style={{ marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={st.hello}>{greeting()}</Text>
          <Text style={st.name} numberOfLines={1}>{profile?.fullName.split(' ')[0]}</Text>
        </View>
        <SyncPill />
        <Pressable accessibilityLabel="Notifications" onPress={() => nav.navigate('Notifications')} style={st.bell}>
          <Icon name="notifications-outline" size={22} color={colors.ink} />
          {!!today?.unread && <View style={st.dot}><Text style={st.dotText}>{today.unread > 9 ? '9+' : today.unread}</Text></View>}
        </Pressable>
      </Row>

      {today?.openVisit && (
        <Pressable onPress={() => nav.navigate('Visit')} style={st.live}>
          <View style={st.pulse} />
          <View style={{ flex: 1 }}>
            <Text style={st.liveLabel}>Visit in progress · {duration(today.openVisit.checkInAt)}</Text>
            <Text style={st.liveName} numberOfLines={1}>{today.openVisit.customer.name}</Text>
          </View>
          <Icon name="chevron-forward" size={20} color="#fff" />
        </Pressable>
      )}

      <Card style={{ padding: 16 }}>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={st.cardLabel}>{today?.shift ? `On shift for ${duration(today.shift.startedAt)}` : 'You are off shift'}</Text>
            <Text style={st.big}>{stats?.visits ?? 0}<Text style={st.bigOf}> / {stats?.target ?? profile?.dailyVisitTarget ?? 0} visits</Text></Text>
          </View>
          {today?.shift
            ? <Button title="End" kind="ghost" onPress={finishShift} style={{ height: 40 }} disabled={!!today.openVisit} />
            : <Button title="Start shift" icon="play" onPress={startShift} style={{ height: 40 }} />}
        </Row>
        <View style={st.track}><View style={[st.fill, { width: `${progress * 100}%` }]} /></View>
        <Row style={{ marginTop: 14 }}>
          <Metric label="Driven" value={kmValue(stats?.distanceKm ?? 0, units)} />
          <Metric label="Orders" value={money(stats?.orderCents ?? 0)} />
          <Metric label="Overdue" value={String(stats?.overdueTasks ?? 0)} alert={!!stats?.overdueTasks} />
        </Row>
      </Card>

      <SectionTitle title={`Today's route${stops.length ? ` · ${stops.length - pending.length}/${stops.length}` : ''}`} action={stops.length ? 'Open route' : 'Plan'} onAction={() => nav.navigate('Route')} />
      {!stops.length && <Card><Empty icon="trail-sign-outline" title="No route yet" hint="Pick the customers you want to see today."><Button title="Plan my day" kind="soft" onPress={() => nav.navigate('Route')} style={{ marginTop: 14 }} /></Empty></Card>}
      {stops.length > 0 && !pending.length && <Card><Text style={s.name}>Route finished</Text><Text style={s.sub}>Every stop today has been handled.</Text></Card>}
      {pending.slice(0, 3).map((stop, i) => (
        <Card key={stop.id} style={{ marginBottom: 8 }} onPress={() => nav.navigate('Customer', { id: stop.customerId })}>
          <Row>
            <View style={st.num}><Text style={st.numText}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{stop.customer.name}</Text>
              <Text style={s.sub} numberOfLines={1}>{stop.customer.address ?? stop.customer.city ?? ''}</Text>
            </View>
            {position && <Text style={st.far}>{distance(distanceM(position, stop.customer), units)}</Text>}
          </Row>
        </Card>
      ))}

      {tasks.length > 0 && <SectionTitle title="Due today" action="All tasks" onAction={() => nav.navigate('Tasks')} />}
      {tasks.map((t) => (
        <Card key={t.id} style={{ marginBottom: 8 }}>
          <Row>
            <Pressable accessibilityLabel="Complete task" onPress={() => setTaskDone(t.id, true)} hitSlop={8} style={{ marginRight: 10 }}><Icon name="ellipse-outline" size={24} color={colors.ink4} /></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{t.title}</Text>
              {t.customer && <Text style={s.sub} numberOfLines={1}>{t.customer.name}</Text>}
            </View>
          </Row>
        </Card>
      ))}

      {recentCustomers.length > 0 && <SectionTitle title="Recently viewed" />}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {recentCustomers.map((c) => {
          const tone = statusStyle[c.status];
          return (
            <Card key={c.id} style={{ width: 138 }} onPress={() => nav.navigate('Customer', { id: c.id })}>
              <Avatar name={c.name} color={tone.fg} soft={tone.bg} size={38} />
              <Text style={[s.name, { marginTop: 8 }]} numberOfLines={1}>{c.name}</Text>
              <Text style={s.sub}>{relativeDay(c.lastVisitAt)}</Text>
              <View style={{ marginTop: 6 }}><StatusBadge status={c.status} /></View>
            </Card>
          );
        })}
      </ScrollView>
    </ScrollView>
  );
}

const Metric = ({ label, value, alert }: { label: string; value: string; alert?: boolean }) => (
  <View style={{ flex: 1 }}>
    <Text style={[st.metric, alert && { color: colors.bad }]}>{value}</Text>
    <Text style={st.metricLabel}>{label}</Text>
  </View>
);

const st = StyleSheet.create({
  hello: { fontSize: 14, color: colors.ink3, fontWeight: '600' },
  name: { fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, marginRight: 8 },
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.edge, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.bad, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  live: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.brand, borderRadius: 16, padding: 14, marginBottom: 12, gap: 12 },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7CF5C4' },
  liveLabel: { color: '#D9D5FF', fontSize: 12, fontWeight: '600' },
  liveName: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 1 },
  cardLabel: { fontSize: 13, color: colors.ink3, fontWeight: '600' },
  big: { fontSize: 32, fontWeight: '800', color: colors.ink, marginTop: 2 },
  bigOf: { fontSize: 15, fontWeight: '600', color: colors.ink3 },
  track: { height: 8, backgroundColor: colors.brandSoft, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.brand, borderRadius: 4 },
  metric: { fontSize: 16, fontWeight: '800', color: colors.ink },
  metricLabel: { fontSize: 12, color: colors.ink3, marginTop: 1 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  numText: { color: colors.brand, fontWeight: '800', fontSize: 13 },
  far: { fontSize: 13, fontWeight: '700', color: colors.ink2, marginLeft: 8 },
});
