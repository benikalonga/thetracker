import { useNavigation } from '@react-navigation/native';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, Chip, Icon, Row, StatusBadge, s } from '../components/ui';
import { distance, relativeDay } from '../lib/format';
import { distanceM, regionFor } from '../lib/geo';
import { useData } from '../store/data';
import { colors, statusStyle } from '../theme';
import { openNavigation } from './customerDetail';

const FILTERS = ['ALL', 'ACTIVE', 'LEAD', 'AT_RISK', 'INACTIVE'];

export function MapScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const customers = useData((x) => x.customers);
  const position = useData((x) => x.position);
  const units = useData((x) => x.units);
  const [filter, setFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const map = useRef<MapView>(null);

  const shown = useMemo(() => customers.filter((c) => filter === 'ALL' || c.status === filter), [customers, filter]);
  const selected = shown.find((c) => c.id === selectedId);
  const [initial] = useState(() => regionFor(customers, position));

  const recenter = () => {
    if (position) map.current?.animateToRegion({ latitude: position.lat, longitude: position.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 300);
  };

  return (
    <View style={s.page}>
      <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={initial} showsUserLocation onPress={(e) => { if (e.nativeEvent.action !== 'marker-press') setSelectedId(null); }}>
        {shown.map((c) => (
          <Marker key={`${c.id}-${c.status}`} identifier={c.id} coordinate={{ latitude: c.lat, longitude: c.lng }} pinColor={statusStyle[c.status].fg} tracksViewChanges={false} onPress={() => setSelectedId(c.id)} />
        ))}
      </MapView>

      <View style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}>
          {FILTERS.map((f) => <Chip key={f} label={f === 'ALL' ? `All (${customers.length})` : statusStyle[f].label} active={filter === f} onPress={() => setFilter(f)} />)}
        </ScrollView>
      </View>

      <Pressable accessibilityLabel="Center on me" onPress={recenter} style={[st.locate, { bottom: selected ? 200 : 20 }]}><Icon name="locate" size={22} color={colors.brand} /></Pressable>

      {selected && (
        <View style={st.card}>
          <Row>
            <Avatar name={selected.name} color={statusStyle[selected.status].fg} soft={statusStyle[selected.status].bg} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.name} numberOfLines={1}>{selected.name}</Text>
              <Text style={s.sub} numberOfLines={1}>{[selected.city, position && `${distance(distanceM(position, selected), units)} away`].filter(Boolean).join(' · ')}</Text>
            </View>
            <StatusBadge status={selected.status} />
          </Row>
          <Text style={[s.sub, { marginTop: 8 }]}>Last visit: {relativeDay(selected.lastVisitAt)}</Text>
          <Row style={{ gap: 8, marginTop: 12 }}>
            <Button title="Directions" kind="soft" icon="navigate-outline" onPress={() => openNavigation(selected)} style={{ flex: 1 }} />
            <Button title="Open" onPress={() => nav.navigate('Customer', { id: selected.id })} style={{ flex: 1 }} />
          </Row>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  locate: { position: 'absolute', right: 14, width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  card: { position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: '#fff', borderRadius: 18, padding: 14, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
});
