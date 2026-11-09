import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Badge, Chip, Empty, Icon, Row, ScreenHeader, StatusBadge, s } from '../components/ui';
import { distance, isVisitDue, relativeDay } from '../lib/format';
import { distanceM } from '../lib/geo';
import type { Customer } from '../lib/types';
import { useData } from '../store/data';
import { colors, statusStyle } from '../theme';
import { SyncPill } from './today';

type Sort = 'near' | 'name' | 'stale';
const STATUS_FILTERS = ['ALL', 'ACTIVE', 'LEAD', 'AT_RISK', 'INACTIVE'];

export function filterCustomers(list: Customer[], q: string, status: string, favorites: boolean, dueOnly: boolean) {
  const needle = q.trim().toLowerCase();
  return list.filter((c) =>
    (status === 'ALL' || c.status === status) && (!favorites || c.isFavorite) && (!dueOnly || isVisitDue(c)) &&
    (!needle || [c.name, c.city, c.contactName, c.phone, c.code].some((v) => v?.toLowerCase().includes(needle))));
}

export function CustomersScreen() {
  const nav = useNavigation<any>();
  const customers = useData((x) => x.customers);
  const position = useData((x) => x.position);
  const units = useData((x) => x.units);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('near');
  const [status, setStatus] = useState('ALL');
  const [favorites, setFavorites] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const rows = useMemo(() => {
    const out = filterCustomers(customers, q, status, favorites, dueOnly).map((c) => ({ ...c, away: position ? distanceM(position, c) : null }));
    if (sort === 'near' && position) out.sort((a, b) => a.away! - b.away!);
    else if (sort === 'stale') out.sort((a, b) => (a.lastVisitAt ?? '').localeCompare(b.lastVisitAt ?? ''));
    else out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [customers, q, status, favorites, dueOnly, position, sort]);

  return (
    <View style={s.page}>
      <ScreenHeader title="Customers" right={<SyncPill />} />
      <View style={{ paddingHorizontal: 16 }}>
        <View style={st.search}>
          <Icon name="search" size={18} color={colors.ink3} />
          <TextInput accessibilityLabel="Search customers" value={q} onChangeText={setQ} placeholder="Name, city, phone or code" placeholderTextColor={colors.ink4} style={st.searchInput} autoCorrect={false} clearButtonMode="while-editing" />
        </View>
      </View>
      <View style={{ height: 46 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
          <Chip label="Nearest" icon="navigate-outline" active={sort === 'near'} onPress={() => setSort('near')} />
          <Chip label="A–Z" active={sort === 'name'} onPress={() => setSort('name')} />
          <Chip label="Least recent" active={sort === 'stale'} onPress={() => setSort('stale')} />
          <View style={st.sep} />
          <Chip label="Favorites" icon="star-outline" active={favorites} onPress={() => setFavorites(!favorites)} />
          <Chip label="Visit due" icon="alarm-outline" active={dueOnly} onPress={() => setDueOnly(!dueOnly)} />
          <View style={st.sep} />
          {STATUS_FILTERS.map((f) => <Chip key={f} label={f === 'ALL' ? 'All' : statusStyle[f].label} active={status === f} onPress={() => setStatus(f)} />)}
        </ScrollView>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 90 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await useData.getState().refresh().catch(() => {}); setRefreshing(false); }} />}
        ListEmptyComponent={<Empty icon="people-outline" title="No customers found" hint={q ? 'Try a different search.' : 'Add your first customer with the + button.'} />}
        renderItem={({ item: c }) => {
          const tone = statusStyle[c.status];
          return (
            <Pressable onPress={() => nav.navigate('Customer', { id: c.id })} style={({ pressed }) => [st.row, pressed && { opacity: 0.7 }]}>
              <Avatar name={c.name} color={tone.fg} soft={tone.bg} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Row>
                  <Text style={[s.name, { flexShrink: 1 }]} numberOfLines={1}>{c.name}</Text>
                  {c.isFavorite && <Icon name="star" size={13} color={colors.warn} style={{ marginLeft: 4 }} />}
                </Row>
                <Text style={s.sub} numberOfLines={1}>{[c.city, `Visited ${relativeDay(c.lastVisitAt).toLowerCase()}`].filter(Boolean).join(' · ')}</Text>
                <Row style={{ gap: 6, marginTop: 6 }}>
                  <StatusBadge status={c.status} />
                  {isVisitDue(c) && <Badge text="Visit due" fg={colors.brand} bg={colors.brandSoft} />}
                  {c.priority === 'HIGH' && <Badge text="High priority" fg={colors.bad} bg={colors.badSoft} />}
                </Row>
              </View>
              {c.away != null && <Text style={st.far}>{distance(c.away, units)}</Text>}
            </Pressable>
          );
        }}
      />
      <Pressable accessibilityLabel="Add customer" onPress={() => nav.navigate('CustomerForm')} style={st.fab}><Icon name="add" size={30} color="#fff" /></Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 13, borderWidth: 1, borderColor: colors.edge, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink },
  chips: { gap: 8, paddingHorizontal: 16, alignItems: 'center' },
  sep: { width: 1, height: 20, backgroundColor: colors.edge },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: colors.edge, padding: 12, marginBottom: 8 },
  far: { fontSize: 13, fontWeight: '700', color: colors.ink2, marginLeft: 8 },
  fab: { position: 'absolute', right: 18, bottom: 18, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: colors.brand, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
});
