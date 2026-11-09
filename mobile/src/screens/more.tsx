import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, Card, Chip, Empty, Icon, Label, Row, ScreenHeader, Spinner, s, type IconName } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, kmValue, money, relativeDay } from '../lib/format';
import { useData } from '../store/data';
import { colors, outcomeLabel } from '../theme';

const Item = ({ icon, title, hint, onPress, last }: { icon: IconName; title: string; hint?: string; onPress: () => void; last?: boolean }) => (
  <Pressable onPress={onPress} style={[st.item, !last && st.line]}>
    <View style={st.itemIcon}><Icon name={icon} size={19} color={colors.brand} /></View>
    <Text style={st.itemText}>{title}</Text>
    {!!hint && <Text style={st.itemHint}>{hint}</Text>}
    <Icon name="chevron-forward" size={18} color={colors.ink4} />
  </Pressable>
);

export function MoreScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const profile = useData((x) => x.profile);
  const unread = useData((x) => x.today?.unread ?? 0);
  const pending = useData((x) => x.outbox.length + x.failed.length);

  const signOut = () => {
    const message = pending ? `You have ${pending} unsent change${pending === 1 ? '' : 's'} that will be lost.` : 'You will need your password to sign back in.';
    Alert.alert('Sign out?', message, [{ text: 'Stay', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => void useData.getState().signOut() }]);
  };

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 14 }}>
      <Row style={{ marginBottom: 20 }}>
        <Avatar name={profile?.fullName ?? ''} size={60} />
        <View style={{ marginLeft: 14, flex: 1 }}>
          <Text style={st.name} numberOfLines={1}>{profile?.fullName}</Text>
          <Text style={s.sub} numberOfLines={1}>{profile?.email}</Text>
          {profile?.manager && <Text style={s.sub} numberOfLines={1}>Reports to {profile.manager.fullName}</Text>}
        </View>
      </Row>
      <Card style={{ padding: 0, marginBottom: 14 }}>
        <Item icon="stats-chart-outline" title="My performance" onPress={() => nav.navigate('Performance')} />
        <Item icon="notifications-outline" title="Notifications" hint={unread ? String(unread) : undefined} onPress={() => nav.navigate('Notifications')} />
        <Item icon="cloud-upload-outline" title="Sync center" hint={pending ? String(pending) : undefined} onPress={() => nav.navigate('Sync')} last />
      </Card>
      <Card style={{ padding: 0, marginBottom: 20 }}>
        <Item icon="settings-outline" title="Settings" onPress={() => nav.navigate('Settings')} />
        <Item icon="information-circle-outline" title="About" onPress={() => nav.navigate('About')} last />
      </Card>
      <Button title="Sign out" kind="danger" icon="log-out-outline" onPress={signOut} />
    </ScrollView>
  );
}

export function PerformanceScreen() {
  const nav = useNavigation<any>();
  const units = useData((x) => x.units);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api(`/agent/stats?days=${days}`).then(setData).catch((e) => setError(e.message));
  }, [days]);

  const peak = data ? Math.max(data.target, ...data.series.map((d: any) => d.count), 1) : 1;
  const outcomes = data ? Object.entries<number>(data.outcomes).sort((a, b) => b[1] - a[1]) : [];
  return (
    <View style={s.page}>
      <ScreenHeader title="My performance" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Row style={{ gap: 8, marginBottom: 14 }}>{[7, 30, 90].map((d) => <Chip key={d} label={`${d} days`} active={days === d} onPress={() => setDays(d)} />)}</Row>
        {!!error && <Empty icon="cloud-offline-outline" title="Not available offline" hint={error} />}
        {!data && !error && <Spinner />}
        {data && !error && (
          <>
            <View style={st.grid}>
              <Tile label="Visits" value={String(data.visits)} />
              <Tile label="Orders" value={money(data.orderCents)} />
              <Tile label="Verified on site" value={`${data.verifiedPct}%`} />
              <Tile label="Avg. visit" value={`${data.avgMinutes} min`} />
              <Tile label="Driven" value={kmValue(data.distanceKm, units)} />
              <Tile label="Daily target" value={String(data.target)} />
            </View>
            <Card style={{ marginTop: 10 }}>
              <Text style={s.name}>Visits per day</Text>
              <View style={st.chart}>
                {data.series.map((d: any) => <View key={d.date} style={[st.bar, { height: `${Math.max((d.count / peak) * 100, 2)}%`, backgroundColor: d.count >= data.target ? colors.good : colors.brand }]} />)}
              </View>
              <Text style={[s.sub, { marginTop: 8 }]}>Green days reached the target of {data.target}.</Text>
            </Card>
            {outcomes.length > 0 && (
              <Card style={{ marginTop: 10 }}>
                <Text style={[s.name, { marginBottom: 6 }]}>Outcomes</Text>
                {outcomes.map(([k, v]) => <Row key={k} style={{ justifyContent: 'space-between', paddingVertical: 6 }}><Text style={{ color: colors.ink2 }}>{outcomeLabel(k)}</Text><Text style={{ fontWeight: '700', color: colors.ink }}>{v}</Text></Row>)}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const Tile = ({ label, value }: { label: string; value: string }) => (
  <View style={st.tile}><Text style={st.tileValue} numberOfLines={1}>{value}</Text><Text style={st.tileLabel}>{label}</Text></View>
);

export function NotificationsScreen() {
  const nav = useNavigation<any>();
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: any[] }>('/agent/notifications');
      setItems(res.items);
      setError('');
      await api('/agent/notifications/read', { body: {} });
      useData.setState((x) => (x.today ? { today: { ...x.today, unread: 0 } } : {}));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <View style={s.page}>
      <ScreenHeader title="Notifications" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {!!error && <Empty icon="cloud-offline-outline" title="Could not load notifications" hint={error} />}
        {!items && !error && <Spinner />}
        {items?.length === 0 && <Empty icon="notifications-off-outline" title="Nothing yet" />}
        {items?.map((n) => (
          <Card key={n.id} style={{ marginBottom: 8, ...(n.readAt ? {} : { borderColor: colors.brand }) }}>
            <Text style={s.name}>{n.title}</Text>
            <Text style={{ color: colors.ink2, fontSize: 14, marginTop: 3, lineHeight: 20 }}>{n.body}</Text>
            <Text style={[s.sub, { marginTop: 6 }]}>{dateTime(n.createdAt)}</Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

export function SyncScreen() {
  const nav = useNavigation<any>();
  const outbox = useData((x) => x.outbox);
  const failed = useData((x) => x.failed);
  const pings = useData((x) => x.pings.length);
  const online = useData((x) => x.online);
  const syncing = useData((x) => x.syncing);
  const lastSyncAt = useData((x) => x.lastSyncAt);
  const { refresh, retryFailed, discardFailed } = useData.getState();
  return (
    <View style={s.page}>
      <ScreenHeader title="Sync center" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card style={{ marginBottom: 14 }}>
          <Row style={{ gap: 8 }}><Icon name={online ? 'cloud-done-outline' : 'cloud-offline-outline'} size={22} color={online ? colors.good : colors.warn} /><Text style={s.name}>{online ? 'Connected' : 'Offline'}</Text></Row>
          <Text style={s.sub}>Last synced {lastSyncAt ? `${relativeDay(lastSyncAt).toLowerCase()}, ${dateTime(lastSyncAt).split(', ')[1]}` : 'never'}</Text>
          <Text style={s.sub}>{pings} location point{pings === 1 ? '' : 's'} waiting</Text>
          <Button title="Sync now" kind="soft" icon="sync-outline" busy={syncing} onPress={() => void refresh().catch((e) => Alert.alert('Sync failed', e.message))} style={{ marginTop: 12 }} />
        </Card>
        {failed.length > 0 && <Text style={st.head}>Needs your attention</Text>}
        {failed.map((op) => (
          <Card key={op.id} style={{ marginBottom: 8, borderColor: colors.bad }}>
            <Text style={s.name}>{op.label}</Text>
            <Text style={{ color: colors.bad, fontSize: 13, marginTop: 3 }}>{op.error}</Text>
            <Row style={{ gap: 8, marginTop: 10 }}>
              <Button title="Retry" kind="soft" onPress={() => retryFailed(op.id)} style={{ flex: 1, height: 40 }} />
              <Button title="Discard" kind="ghost" onPress={() => discardFailed(op.id)} style={{ flex: 1, height: 40 }} />
            </Row>
          </Card>
        ))}
        {outbox.length > 0 && <Text style={st.head}>Waiting to send</Text>}
        {outbox.map((op) => <Card key={op.id} style={{ marginBottom: 8 }}><Text style={s.name}>{op.label}</Text><Text style={s.sub}>{dateTime(op.createdAt)}</Text></Card>)}
        {!outbox.length && !failed.length && <Empty icon="checkmark-done-outline" title="Everything is up to date" />}
      </ScrollView>
    </View>
  );
}

export function SettingsScreen() {
  const nav = useNavigation<any>();
  const units = useData((x) => x.units);
  const shareLocation = useData((x) => x.shareLocation);
  const { setPrefs } = useData.getState();
  return (
    <View style={s.page}>
      <ScreenHeader title="Settings" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Label>Distance units</Label>
        <Row style={{ gap: 8, marginBottom: 18 }}>
          <Chip label="Kilometres" active={units === 'km'} onPress={() => setPrefs({ units: 'km' })} />
          <Chip label="Miles" active={units === 'mi'} onPress={() => setPrefs({ units: 'mi' })} />
        </Row>
        <Card>
          <Row>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={s.name}>Share my route on shift</Text>
              <Text style={s.sub}>Your manager sees your position only while you are on shift. Nothing is recorded off shift.</Text>
            </View>
            <Switch accessibilityLabel="Share my route on shift" value={shareLocation} onValueChange={(v) => setPrefs({ shareLocation: v })} trackColor={{ true: colors.brand }} />
          </Row>
        </Card>
        <Button title="Open device settings" kind="ghost" onPress={() => Linking.openSettings()} style={{ marginTop: 14 }} />
      </ScrollView>
    </View>
  );
}

export function AboutScreen() {
  const nav = useNavigation<any>();
  return (
    <View style={s.page}>
      <ScreenHeader title="About" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
        <View style={st.logo}><Icon name="navigate" size={32} color="#fff" /></View>
        <Text style={[st.name, { marginTop: 14 }]}>TheTracker</Text>
        <Text style={s.sub}>Version 1.0.0</Text>
        <Text style={st.about}>TheTracker helps field teams plan their day, verify every customer visit on site, and keep working when the network drops.</Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  name: { fontSize: 21, fontWeight: '800', color: colors.ink },
  item: { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 12 },
  line: { borderBottomWidth: 1, borderBottomColor: colors.edge },
  itemIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  itemHint: { fontSize: 13, fontWeight: '700', color: colors.brand },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48.8%', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.edge, padding: 13 },
  tileValue: { fontSize: 20, fontWeight: '800', color: colors.ink },
  tileLabel: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  chart: { height: 110, flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: 12 },
  bar: { flex: 1, borderRadius: 2 },
  head: { fontSize: 13, fontWeight: '800', color: colors.ink3, marginBottom: 8, marginTop: 6 },
  logo: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  about: { fontSize: 15, color: colors.ink2, textAlign: 'center', marginTop: 18, lineHeight: 22 },
});
