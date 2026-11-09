import { useNavigation, useRoute } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Field, Icon, Label, Row, ScreenHeader, s } from '../components/ui';
import type { Customer } from '../lib/types';
import { useData } from '../store/data';
import { colors, statusStyle } from '../theme';
import { currentPosition } from './customerDetail';

const emailOk = (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function CustomerFormScreen() {
  const nav = useNavigation<any>();
  const id = useRoute<any>().params?.id as string | undefined;
  const insets = useSafeAreaInsets();
  const existing = useData((x) => x.customers.find((c) => c.id === id));
  const position = useData((x) => x.position);
  const map = useRef<MapView>(null);

  const [name, setName] = useState(existing?.name ?? '');
  const [contactName, setContactName] = useState(existing?.contactName ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [segment, setSegment] = useState(existing?.segment ?? '');
  const [status, setStatus] = useState<Customer['status']>(existing?.status ?? 'LEAD');
  const [priority, setPriority] = useState<Customer['priority']>(existing?.priority ?? 'NORMAL');
  const [every, setEvery] = useState(String(existing?.visitEveryDays ?? 30));
  const [point, setPoint] = useState(existing ? { lat: existing.lat, lng: existing.lng } : position ? { lat: position.lat, lng: position.lng } : null);
  const [error, setError] = useState('');
  const touched = useRef(false);

  const fillAddress = async (lat: number, lng: number) => {
    if (existing && !touched.current) return;
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (!place) return;
      const street = [place.streetNumber, place.street].filter(Boolean).join(' ') || place.name;
      if (street) setAddress(street);
      if (place.city ?? place.subregion) setCity((place.city ?? place.subregion)!);
    } catch {
      // Without a connection the address can be typed in.
    }
  };

  const onRegion = (r: Region) => {
    if (!touched.current) return;
    setPoint({ lat: r.latitude, lng: r.longitude });
    void fillAddress(r.latitude, r.longitude);
  };

  const useMine = async () => {
    const pos = await currentPosition();
    if (!pos) return Alert.alert('Location needed', 'Turn on location to use your current position.');
    touched.current = true;
    setPoint(pos);
    map.current?.animateToRegion({ latitude: pos.lat, longitude: pos.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 300);
    void fillAddress(pos.lat, pos.lng);
  };

  const save = () => {
    const cadence = Number(every);
    if (name.trim().length < 2) return setError('Enter the customer name.');
    if (!emailOk(email.trim())) return setError('Enter a valid email address.');
    if (!Number.isInteger(cadence) || cadence < 1 || cadence > 365) return setError('Visit frequency must be 1 to 365 days.');
    if (!point) return setError('Choose the location on the map.');
    useData.getState().saveCustomer({
      name: name.trim(), contactName: contactName.trim() || null, phone: phone.trim() || null, email: email.trim() || null,
      address: address.trim() || null, city: city.trim() || null, segment: segment.trim() || null,
      status, priority, visitEveryDays: cadence, lat: point.lat, lng: point.lng,
    }, id);
    nav.goBack();
  };

  const start = point ?? { lat: 0, lng: 20 };
  return (
    <View style={s.page}>
      <ScreenHeader title={id ? 'Edit customer' : 'New customer'} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Field label="Business or customer name *" value={name} onChangeText={setName} placeholder="Corner Shop" />
        <Label>Location *</Label>
        <View style={st.mapBox} onTouchStart={() => { touched.current = true; }}>
          <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={{ latitude: start.lat, longitude: start.lng, latitudeDelta: point ? 0.008 : 60, longitudeDelta: point ? 0.008 : 60 }} onRegionChangeComplete={onRegion} showsUserLocation />
          <View pointerEvents="none" style={st.pin}><Icon name="location" size={38} color={colors.brand} /></View>
          <Pressable accessibilityLabel="Use my location" onPress={useMine} style={st.mine}><Icon name="locate" size={20} color={colors.brand} /></Pressable>
        </View>
        <Text style={st.hint}>{point ? 'Drag the map to place the pin on the entrance.' : 'Drag the map or tap the target button.'}</Text>
        <Field label="Address" value={address} onChangeText={setAddress} />
        <Field label="City" value={city} onChangeText={setCity} />
        <Field label="Contact person" value={contactName} onChangeText={setContactName} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Field label="Segment" value={segment} onChangeText={setSegment} placeholder="Retail, pharmacy, food service…" />
        <Label>Status</Label>
        <Row style={st.chips}>{(Object.keys(statusStyle) as Customer['status'][]).map((v) => <Chip key={v} label={statusStyle[v].label} active={status === v} onPress={() => setStatus(v)} />)}</Row>
        <Label>Priority</Label>
        <Row style={st.chips}>{(['LOW', 'NORMAL', 'HIGH'] as const).map((v) => <Chip key={v} label={v[0] + v.slice(1).toLowerCase()} active={priority === v} onPress={() => setPriority(v)} />)}</Row>
        <Field label="Visit every (days)" value={every} onChangeText={setEvery} keyboardType="number-pad" />
        {!!error && <Text style={st.error}>{error}</Text>}
        <Button title={id ? 'Save changes' : 'Add customer'} onPress={save} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  mapBox: { height: 220, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.edge },
  pin: { position: 'absolute', top: '50%', left: '50%', marginLeft: -19, marginTop: -36 },
  mine: { position: 'absolute', right: 10, bottom: 10, width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 12, color: colors.ink3, marginTop: 6, marginBottom: 14 },
  chips: { gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  error: { color: colors.bad, fontSize: 14, marginBottom: 12 },
});
