import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Icon, type IconName } from './components/ui';
import { CustomerDetailScreen } from './screens/customerDetail';
import { CustomerFormScreen } from './screens/customerForm';
import { CustomersScreen } from './screens/customers';
import { MapScreen } from './screens/map';
import { AboutScreen, MoreScreen, NotificationsScreen, PerformanceScreen, SettingsScreen, SyncScreen } from './screens/more';
import { RouteScreen } from './screens/route';
import { TasksScreen } from './screens/tasks';
import { TodayScreen } from './screens/today';
import { VisitScreen } from './screens/visit';
import { colors } from './theme';

const Tabs = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const ICONS: Record<string, [IconName, IconName]> = {
  Today: ['today', 'today-outline'],
  Customers: ['people', 'people-outline'],
  Map: ['map', 'map-outline'],
  Tasks: ['checkbox', 'checkbox-outline'],
  More: ['person-circle', 'person-circle-outline'],
};

const Home = () => (
  <Tabs.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.brand,
      tabBarInactiveTintColor: colors.ink3,
      tabBarLabelStyle: { fontWeight: '600' },
      tabBarIcon: ({ focused, color, size }) => <Icon name={ICONS[route.name][focused ? 0 : 1]} size={size} color={color} />,
    })}>
    <Tabs.Screen name="Today" component={TodayScreen} />
    <Tabs.Screen name="Customers" component={CustomersScreen} />
    <Tabs.Screen name="Map" component={MapScreen} />
    <Tabs.Screen name="Tasks" component={TasksScreen} />
    <Tabs.Screen name="More" component={MoreScreen} />
  </Tabs.Navigator>
);

export const RootNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Home" component={Home} />
    <Stack.Screen name="Customer" component={CustomerDetailScreen} />
    <Stack.Screen name="CustomerForm" component={CustomerFormScreen} />
    <Stack.Screen name="Visit" component={VisitScreen} options={{ gestureEnabled: false }} />
    <Stack.Screen name="Route" component={RouteScreen} />
    <Stack.Screen name="Notifications" component={NotificationsScreen} />
    <Stack.Screen name="Performance" component={PerformanceScreen} />
    <Stack.Screen name="Sync" component={SyncScreen} />
    <Stack.Screen name="Settings" component={SettingsScreen} />
    <Stack.Screen name="About" component={AboutScreen} />
  </Stack.Navigator>
);
