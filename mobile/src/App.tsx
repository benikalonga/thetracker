import NetInfo from '@react-native-community/netinfo';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { probeApi } from './lib/api';
import { RootNavigator } from './navigation';
import { SignInScreen } from './screens/auth';
import { useData } from './store/data';
import { colors } from './theme';

export const navRef = createNavigationContainerRef<any>();

/** Keeps data fresh and streams position in the foreground. Off-shift positions never leave the phone. */
function useFieldWork(active: boolean) {
  const pingSeconds = useData((s) => s.settings.pingSeconds);
  const lastPingAt = useRef(0);

  useEffect(() => NetInfo.addEventListener((n) => {
    if (n.isConnected === false) void probeApi();
    else useData.getState().setOnline(true);
  }), []);

  useEffect(() => {
    if (!active) return;
    let watcher: Location.LocationSubscription | undefined;
    let stopped = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || stopped) return;
      watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 20, timeInterval: 15_000 }, (loc) => {
        const state = useData.getState();
        const p = { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy };
        state.setPosition(p);
        const elapsed = loc.timestamp - lastPingAt.current;
        if (state.today?.shift && state.shareLocation && elapsed >= Math.min(pingSeconds, 30) * 1000) {
          lastPingAt.current = loc.timestamp;
          state.addPing({ ...p, speed: loc.coords.speed, recordedAt: new Date(loc.timestamp).toISOString() });
        }
      });
      if (stopped) watcher.remove();
    })();
    return () => {
      stopped = true;
      watcher?.remove();
    };
  }, [active, pingSeconds]);

  useEffect(() => {
    if (!active) return;
    const tick = async () => {
      const level = await Battery.getBatteryLevelAsync().catch(() => -1);
      await useData.getState().flushPings(level >= 0 ? Math.round(level * 100) : null);
    };
    const pings = setInterval(tick, pingSeconds * 1000);
    const data = setInterval(() => void useData.getState().refresh().catch(() => {}), 120_000);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void useData.getState().refresh().catch(() => {});
    });
    return () => {
      clearInterval(pings);
      clearInterval(data);
      app.remove();
    };
  }, [active, pingSeconds]);
}

export default function App() {
  const ready = useData((s) => s.ready);
  const signedIn = useData((s) => s.signedIn);
  useFieldWork(signedIn);

  useEffect(() => {
    const start = () => void useData.getState().boot();
    if (useData.persist.hasHydrated()) start();
    else return useData.persist.onFinishHydration(start);
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.ink, justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>;
  return (
    <SafeAreaProvider>
      <StatusBar style={signedIn ? 'dark' : 'light'} />
      {signedIn ? <NavigationContainer ref={navRef}><RootNavigator /></NavigationContainer> : <SignInScreen />}
    </SafeAreaProvider>
  );
}
