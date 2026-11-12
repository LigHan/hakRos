import { useCallback, useRef, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { getConnections, type Person } from '@/lib/connections';
import { cancelInvitation, cancelPlan, formatPlanDate, getPlan, inviteFriend, respondInvitation, type LeisurePlan, type InvitationStatus } from '@/lib/leisure-plans';
import { triggerMapRoute } from '@/lib/map-search';
import { getUserSession } from '@/lib/user-session';

const statusLabels: Record<InvitationStatus, string> = { pending: 'Ожидает ответа', accepted: 'Идёт', declined: 'Отказался', cancelled: 'Отменено' };

export default function PlanDetailsScreen() {
  const router = useRouter(), params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const [plan, setPlan] = useState<LeisurePlan | null>(null);
  const [userId, setUserId] = useState('');
  const [friends, setFriends] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelMeeting, setCancelMeeting] = useState(false);
  const [shareText, setShareText] = useState('');
  const [error, setError] = useState('');
  const [friendError, setFriendError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  const refresh = useCallback(async () => {
    const session = await getUserSession();
    if (!session?.id || !id) throw new Error('Войди в аккаунт и открой план снова.');
    const item = await getPlan(id); setUserId(String(session.id)); setPlan(item); setError('');
    if (String(session.id) === item.ownerId) {
      try { const connections = await getConnections(); setFriends(connections.friends); setFriendError(''); }
      catch { setFriends([]); setFriendError('Не удалось загрузить список друзей.'); }
    }
  }, [id]);
  useFocusEffect(useCallback(() => {
    setLoading(true);
    void refresh().catch(failure => setError(failure instanceof Error ? failure.message : 'План недоступен.')).finally(() => setLoading(false));
  }, [refresh]));

  async function act(fn: () => Promise<unknown>, refreshAfter = true) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await fn(); setSelected(null); setCancelTarget(null); setCancelMeeting(false); if (refreshAfter) await refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось выполнить действие.'); }
    finally { locked.current = false; setBusy(false); }
  }

  async function share() {
    if (!plan) return;
    const text = [`Пойдём вместе: ${plan.placeName || 'место недоступно'}`, plan.address || '', formatPlanDate(plan.startsAt, plan.timeZone), plan.durationMinutes ? `Длительность: ${plan.durationMinutes} мин` : '', plan.comment].filter(Boolean).join('\n');
    setShareText(text);
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.share) await navigator.share({ text });
      } else await Share.share({ message: text });
    } catch { /* The selectable text remains available if sharing is cancelled or unsupported. */ }
  }

  const owner = plan?.ownerId === userId;
  const invitedIds = new Set(plan?.participants?.map(person => person.id) || []);
  const availableFriends = friends.filter(person => !invitedIds.has(person.id));
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Stack.Screen options={{ title: 'План встречи' }} />
    {loading ? <ActivityIndicator color="#606c38" /> : !plan ? <Text style={styles.error}>{error || 'План не найден.'}</Text> : <>
      <Text style={styles.title}>{plan.placeName || 'Место недоступно'}</Text>
      <Text style={styles.subtitle}>{plan.address || 'Адрес не указан'}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>{plan.status === 'cancelled' ? 'Встреча отменена' : 'Когда встречаемся'}</Text>
        <Text style={styles.value}>{formatPlanDate(plan.startsAt, plan.timeZone)}</Text>
        <Text style={styles.subtitle}>{plan.durationMinutes ? `Длительность: ${plan.durationMinutes} мин` : 'Длительность не указана'}</Text>
        {!!plan.comment && <Text style={styles.subtitle}>{plan.comment}</Text>}
        <Text style={styles.subtitle}>Организатор: {plan.ownerName}</Text>
      </View>
      <View style={styles.actions}>
        <Action label="Открыть место" disabled={!plan.placeName} onPress={() => router.push({ pathname: '/company/[id]', params: { id: plan.placeId } })} />
        <Action label="Маршрут" disabled={!plan.placeName} onPress={() => { router.push('/map'); triggerMapRoute(plan.address || plan.placeName || '', plan.placeId); }} />
        <Action label="Поделиться планом" onPress={() => void share()} />
      </View>
      <Text style={styles.subtitle}>При построении маршрута проверь точку назначения на карте: адрес может определиться неточно.</Text>
      {!!shareText && <><Text style={styles.subtitle}>Скопируй текст для отправки:</Text><TextInput accessibilityLabel="Текст плана для копирования" multiline editable={false} value={shareText} style={styles.share} /></>}
      {plan.status === 'active' && plan.invitationStatus === 'pending' && <View style={styles.card}>
        <Text style={styles.label}>Тебя пригласили</Text><Text style={styles.subtitle}>Ответь после знакомства с планом.</Text>
        <View style={styles.actions}><Action label="Принять" disabled={busy} onPress={() => void act(() => respondInvitation(plan.id, 'accepted', plan.revision))} /><Action label="Отклонить" disabled={busy} onPress={() => void act(async () => { await respondInvitation(plan.id, 'declined', plan.revision); router.replace('/plans'); }, false)} /></View>
      </View>}
      <View style={styles.card}>
        <Text style={styles.label}>Участники</Text><Text style={styles.subtitle}>{plan.ownerName} · организатор</Text>
        {plan.participants?.map(person => <View key={person.id} style={styles.person}>
          <Text style={styles.subtitle}>{person.name} · {statusLabels[person.status]}</Text>
          {owner && plan.status === 'active' && ['pending', 'accepted'].includes(person.status) && <Pressable accessibilityRole="button" onPress={() => setCancelTarget(person.id)}><Text style={styles.link}>Отменить приглашение</Text></Pressable>}
        </View>)}
        {owner && cancelTarget && <View style={styles.confirm}>
          <Text style={styles.subtitle}>Отменить приглашение для {plan.participants?.find(p => p.id === cancelTarget)?.name}?</Text>
          <View style={styles.actions}><Action label="Подтвердить отмену" disabled={busy} onPress={() => void act(() => cancelInvitation(plan.id, cancelTarget))} /><Action label="Назад" onPress={() => setCancelTarget(null)} /></View>
        </View>}
        <View style={styles.actions}><Action label="Обновить статусы" disabled={busy} onPress={() => void act(() => Promise.resolve())} /></View>
      </View>
      {owner && plan.status === 'active' && <>
        <View style={styles.card}>
          <Text style={styles.label}>Пригласить друга</Text>
          <Text style={styles.subtitle}>Можно пригласить подтверждённых друзей. Отправка — после отдельного подтверждения.</Text>
          {!!friendError && <Text style={styles.error}>{friendError}</Text>}
          {!friendError && availableFriends.length === 0 && <Text style={styles.subtitle}>Нет доступных друзей для приглашения.</Text>}
          {availableFriends.map(friend => <Pressable key={friend.id} accessibilityRole="button" onPress={() => setSelected(friend)} style={styles.friend}><Text style={styles.value}>{friend.name}</Text><Text style={styles.link}>Выбрать</Text></Pressable>)}
          {selected && <View style={styles.confirm}>
            <Text style={styles.label}>Предпросмотр приглашения</Text>
            <Text style={styles.subtitle}>{selected.name}, пойдём в {plan.placeName || 'выбранное место'} — {formatPlanDate(plan.startsAt, plan.timeZone)}?</Text>
            <View style={styles.actions}><Action label="Подтвердить и отправить" disabled={busy} onPress={() => void act(() => inviteFriend(plan.id, selected.id, plan.revision))} /><Action label="Отмена" onPress={() => setSelected(null)} /></View>
          </View>}
        </View>
        <View style={styles.actions}>
          <Action label="Изменить план" onPress={() => router.push({ pathname: '/plans/create', params: { planId: plan.id } })} />
          <Action label="Отменить встречу" onPress={() => setCancelMeeting(true)} />
        </View>
        {cancelMeeting && <View style={styles.confirm}><Text style={styles.subtitle}>Отменить встречу для всех участников?</Text><View style={styles.actions}><Action label="Да, отменить" disabled={busy} onPress={() => void act(() => cancelPlan(plan.id))} /><Action label="Назад" onPress={() => setCancelMeeting(false)} /></View></View>}
      </>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </>}
  </ScrollView>;
}

function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8f7ed' }, content: { padding: 20, paddingBottom: 150, gap: 12 }, title: { fontSize: 25, fontWeight: '800', color: '#283618' },
  card: { backgroundColor: '#fffdf3', borderRadius: 18, borderWidth: 1, borderColor: '#e4e8d6', padding: 16, gap: 8 }, label: { color: '#283618', fontWeight: '800', fontSize: 16 },
  value: { color: '#283618', fontSize: 15, fontWeight: '600' }, subtitle: { color: '#647052', fontSize: 13, lineHeight: 19 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { backgroundColor: '#606c38', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }, buttonText: { color: '#fff', fontWeight: '700', fontSize: 12 }, disabled: { opacity: 0.45 },
  person: { gap: 3, paddingVertical: 4 }, friend: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }, link: { color: '#b26721', fontWeight: '700', fontSize: 12 },
  confirm: { backgroundColor: '#f1eedb', borderRadius: 14, padding: 12, gap: 8 }, share: { backgroundColor: '#fff', color: '#283618', borderWidth: 1, borderColor: '#dce2d0', borderRadius: 12, padding: 12 }, error: { color: '#a24035', lineHeight: 20 },
});
