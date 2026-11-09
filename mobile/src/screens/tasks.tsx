import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Chip, Empty, Field, Icon, Label, Row, ScreenHeader, Sheet, s } from '../components/ui';
import { daysFromToday, shortDate } from '../lib/format';
import type { Task } from '../lib/types';
import { useData } from '../store/data';
import { colors } from '../theme';
import { SyncPill } from './today';

const DUE = [{ label: 'Today', days: 0 }, { label: 'Tomorrow', days: 1 }, { label: 'In 3 days', days: 3 }, { label: 'Next week', days: 7 }];
const endOfDay = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(17, 0, 0, 0);
  return d.toISOString();
};

export function TasksScreen() {
  const nav = useNavigation<any>();
  const tasks = useData((x) => x.tasks);
  const { addTask, setTaskDone, refresh } = useData.getState();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [due, setDue] = useState(0);
  const [high, setHigh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const sections = useMemo(() => {
    const groups: Record<string, Task[]> = { Overdue: [], Today: [], Upcoming: [], Completed: [] };
    [...tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt)).forEach((t) => {
      if (t.status === 'DONE') groups.Completed.push(t);
      else if (t.status === 'OPEN') {
        const d = daysFromToday(t.dueAt);
        groups[d < 0 ? 'Overdue' : d === 0 ? 'Today' : 'Upcoming'].push(t);
      }
    });
    return Object.entries(groups).filter(([, data]) => data.length).map(([title, data]) => ({ title, data }));
  }, [tasks]);

  const create = () => {
    addTask({ title: title.trim(), details: details.trim() || undefined, dueAt: endOfDay(due), priority: high ? 'HIGH' : 'NORMAL' });
    setOpen(false);
    setTitle('');
    setDetails('');
    setDue(0);
    setHigh(false);
  };

  return (
    <View style={s.page}>
      <ScreenHeader title="Tasks" right={<SyncPill />} />
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh().catch(() => {}); setRefreshing(false); }} />}
        ListEmptyComponent={<Empty icon="checkbox-outline" title="You're all caught up" hint="Follow-ups from your visits will appear here." />}
        renderSectionHeader={({ section }) => <Text style={[st.head, section.title === 'Overdue' && { color: colors.bad }]}>{section.title}</Text>}
        renderItem={({ item: t }) => {
          const done = t.status === 'DONE';
          return (
            <Pressable onPress={() => t.customerId && nav.navigate('Customer', { id: t.customerId })} style={st.row}>
              <Pressable accessibilityLabel={done ? 'Reopen task' : 'Complete task'} onPress={() => setTaskDone(t.id, !done)} hitSlop={10} style={{ marginRight: 12 }}>
                <Icon name={done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={done ? colors.good : colors.ink4} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={[s.name, done && st.struck]} numberOfLines={2}>{t.title}</Text>
                <Text style={s.sub} numberOfLines={1}>{[shortDate(t.dueAt), t.customer?.name].filter(Boolean).join(' · ')}</Text>
              </View>
              {t.priority === 'HIGH' && !done && <Badge text="High" fg={colors.bad} bg={colors.badSoft} />}
            </Pressable>
          );
        }}
      />
      <Pressable accessibilityLabel="Add task" onPress={() => setOpen(true)} style={st.fab}><Icon name="add" size={30} color="#fff" /></Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title="New task">
        <Field label="What needs doing?" value={title} onChangeText={setTitle} maxLength={160} />
        <Field label="Details" value={details} onChangeText={setDetails} multiline />
        <Label>Due</Label>
        <Row style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>{DUE.map((d) => <Chip key={d.days} label={d.label} active={due === d.days} onPress={() => setDue(d.days)} />)}</Row>
        <Row style={{ marginBottom: 16 }}><Chip label="High priority" icon="flag-outline" active={high} onPress={() => setHigh(!high)} /></Row>
        <Button title="Add task" onPress={create} disabled={title.trim().length < 2} />
      </Sheet>
    </View>
  );
}

const st = StyleSheet.create({
  head: { fontSize: 13, fontWeight: '800', color: colors.ink3, marginTop: 14, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.edge, padding: 12, marginBottom: 8 },
  struck: { textDecorationLine: 'line-through', color: colors.ink3 },
  fab: { position: 'absolute', right: 18, bottom: 18, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', elevation: 6 },
});
