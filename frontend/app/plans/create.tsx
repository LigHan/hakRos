import { KeyboardAwareScrollView as ScrollView } from '@/components/keyboard-aware-scroll-view';
import { useEffect, useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { databaseService } from '@/constants/content';
import { createPlan, getPlan, updatePlan, type PlanInput } from '@/lib/leisure-plans';

function localFields(iso: string) {
  const date = new Date(iso), pad = (n: number) => String(n).padStart(2, '0');
  return { day: `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
}

export default function CreatePlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ placeId?: string; planId?: string; duration?: string }>();
  const planId = typeof params.planId === 'string' ? params.planId : '';
  const initialPlaceId = typeof params.placeId === 'string' ? params.placeId : '';
  const [placeId, setPlaceId] = useState(initialPlaceId);
  const [placeName, setPlaceName] = useState('');
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(typeof params.duration === 'string' ? params.duration : '');
  const [comment, setComment] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const [requestId] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        if (planId) {
          const plan = await getPlan(planId); const fields = localFields(plan.startsAt);
          if (current) { setPlaceId(plan.placeId); setPlaceName(plan.placeName || 'Место недоступно'); setDay(fields.day); setTime(fields.time); setDuration(plan.durationMinutes ? String(plan.durationMinutes) : ''); setComment(plan.comment); setRevision(plan.revision); }
        } else if (initialPlaceId) {
          const place = await databaseService.getPostById(initialPlaceId);
          if (current) { if (!place) throw new Error('Место больше недоступно.'); setPlaceName(place.place); }
        } else throw new Error('Выбери место перед созданием плана.');
      } catch (failure) { if (current) setError(failure instanceof Error ? failure.message : 'Не удалось открыть место.'); }
      finally { if (current) setLoading(false); }
    }
    void load();
    return () => { current = false; };
  }, [initialPlaceId, planId]);

  async function submit() {
    if (locked.current) return;
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(day.trim()), clock = /^(\d{2}):(\d{2})$/.exec(time.trim());
    if (!match || !clock) { setError('Укажи дату ДД.ММ.ГГГГ и время ЧЧ:ММ.'); return; }
    const [, d, m, y] = match, [, h, min] = clock;
    const date = new Date(+y, +m - 1, +d, +h, +min);
    if (date.getFullYear() !== +y || date.getMonth() !== +m - 1 || date.getDate() !== +d || date.getHours() !== +h || date.getMinutes() !== +min || date.getTime() <= Date.now()) { setError('Укажи корректные будущие дату и время.'); return; }
    const minutes = duration.trim() ? Number(duration) : null;
    if (minutes !== null && (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440)) { setError('Длительность — от 1 до 1440 минут.'); return; }
    locked.current = true; setSaving(true); setError('');
    try {
      const input: PlanInput = { placeId, startsAt: date.toISOString(), timeZone, durationMinutes: minutes, comment, confirmed: true };
      const plan = planId ? await updatePlan(planId, input, revision) : await createPlan(input, requestId);
      router.replace({ pathname: '/plans/[id]', params: { id: plan.id } });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось сохранить план.'); }
    finally { locked.current = false; setSaving(false); }
  }

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Stack.Screen options={{ title: planId ? 'Изменить план' : 'Создать план' }} />
    <Text style={styles.title}>{planId ? 'Изменим встречу' : 'Составим план'}</Text>
    {loading ? <ActivityIndicator color="#606c38" /> : <>
      <Text style={styles.label}>Место</Text><Text style={styles.place}>{placeName || 'Не выбрано'}</Text>
      <Text style={styles.note}>Встреча не создаётся автоматически. Укажи согласованное время; часовой пояс устройства: {timeZone}.</Text>
      <Text style={styles.label}>Дата</Text><TextInput accessibilityLabel="Дата встречи" value={day} onChangeText={setDay} placeholder="ДД.ММ.ГГГГ" style={styles.input} />
      <Text style={styles.label}>Время</Text><TextInput accessibilityLabel="Время встречи" value={time} onChangeText={setTime} placeholder="ЧЧ:ММ" style={styles.input} />
      <Text style={styles.label}>Длительность, минут (необязательно)</Text><TextInput accessibilityLabel="Длительность в минутах" value={duration} onChangeText={setDuration} keyboardType="numeric" placeholder="Например, 120" style={styles.input} />
      <Text style={styles.label}>Комментарий (необязательно)</Text><TextInput accessibilityLabel="Комментарий к плану" value={comment} onChangeText={setComment} maxLength={500} placeholder="Где встречаемся?" multiline style={[styles.input, styles.multiline]} />
      {planId ? <Text style={styles.note}>После изменения времени участникам понадобится подтвердить участие снова.</Text> : null}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={saving || !placeName || placeName === 'Место недоступно'} onPress={() => void submit()} style={[styles.button, saving && styles.disabled]}><Text style={styles.buttonText}>{saving ? 'Сохраняем…' : planId ? 'Подтвердить изменения' : 'Подтвердить и создать план'}</Text></Pressable>
    </>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8f7ed' }, content: { padding: 20, paddingBottom: 150, gap: 10 }, title: { fontSize: 25, fontWeight: '800', color: '#283618' },
  label: { color: '#283618', fontWeight: '700', fontSize: 13, marginTop: 6 }, place: { color: '#606c38', fontSize: 18, fontWeight: '700' }, note: { color: '#6b735f', fontSize: 13, lineHeight: 19 },
  input: { backgroundColor: '#fff', color: '#283618', borderWidth: 1, borderColor: '#dce2d0', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15 }, multiline: { minHeight: 72, textAlignVertical: 'top' },
  button: { backgroundColor: '#606c38', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 6 }, buttonText: { color: '#fff', fontWeight: '700' }, disabled: { opacity: 0.5 }, error: { color: '#a24035', lineHeight: 20 },
});
