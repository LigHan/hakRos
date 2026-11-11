import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import MapCanvas from '@/components/MapCanvas';
import type { MapPoint, MapState } from '@/components/MapCanvas.types';
import { registerMapSearchHandler } from '@/lib/map-search';
import { api, authorized } from '@/lib/statistics';
import { getUserSession, type UserSession } from '@/lib/user-session';

type Coordinates = { latitude: number; longitude: number };
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить действие';

export default function MapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ focusType?: string; focusId?: string }>();
  const [session, setSession] = useState<UserSession | null>(null);
  const [focused, setFocused] = useState(false);
  const [places, setPlaces] = useState<MapPoint[]>([]);
  const [people, setPeople] = useState<MapPoint[]>([]);
  const [selected, setSelected] = useState<Coordinates | null>(null);
  const [center, setCenter] = useState<MapState['center']>(null);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [myPlacesOpen, setMyPlacesOpen] = useState(false);
  const lastPosition = useRef<Coordinates | null>(null);
  const handledFocus = useRef('');
  const loadVersion = useRef(0);
  const mapFocused = useRef(false);

  const move = useCallback((point: Coordinates) => setCenter({ ...point, sequence: Date.now() + Math.random() }), []);
  const select = useCallback((latitude: number, longitude: number) => { setSelected({ latitude, longitude }); }, []);
  const canvasError = useCallback((message: string) => setError(message), []);
  const load = useCallback(async (activeSession: UserSession | null) => {
    if (!mapFocused.current) return;
    const version = ++loadVersion.current;
    const options = activeSession?.token ? {headers:{Authorization:`Bearer ${activeSession.token}`}} : {};
    const [points, locations] = await Promise.allSettled([
      api('/api/map/places', options), activeSession?.token ? api('/api/map/locations', options) : Promise.resolve([]),
    ]);
    // An old request must never repaint another account's private places.
    if (!mapFocused.current || version !== loadVersion.current) return;
    if (points.status === 'fulfilled') setPlaces(points.value);
    else { setPlaces([]); setError(messageOf(points.reason)); }
    setPeople(locations.status === 'fulfilled' ? locations.value.map((p: MapPoint) => ({ ...p, kind: 'person' as const })) : []);
    setLoaded(true);
  }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    mapFocused.current = true;
    setLoaded(false);
    setFocused(true);
    void getUserSession().then(value => { if (active) { setSession(value); void load(value); } });
    return () => { active = false; mapFocused.current = false; loadVersion.current++; setPlaces([]); setPeople([]); setFocused(false); setSharing(false); handledFocus.current = ''; };
  }, [load]));
  useEffect(() => {
    if (!focused) return;
    const timer = setInterval(() => void load(session), 20000);
    return () => clearInterval(timer);
  }, [focused, load, session]);

  useEffect(() => {
    if (!sharing || !focused) return;
    let active = true;
    let subscription: Location.LocationSubscription | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let pending = Promise.resolve();
    const send = (position: Coordinates) => {
      pending = pending.then(async () => {
        if (active) await authorized('/api/map/location', { method: 'PUT', body: JSON.stringify(position) });
      }).catch(e => { if (active) { setError(messageOf(e)); setSharing(false); } });
    };
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') throw new Error('Разрешите доступ к геолокации, чтобы показывать своё положение');
        if (!active) return;
        subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 20000, distanceInterval: 25 }, position => {
          if (!active) return;
          const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          lastPosition.current = coordinates; send(coordinates);
        });
        if (!active) { subscription.remove(); return; }
        timer = setInterval(() => { if (lastPosition.current) send(lastPosition.current); }, 45000);
      } catch (e) { if (active) { setError(messageOf(e)); setSharing(false); } }
    })();
    return () => {
      active = false; subscription?.remove(); if (timer) clearInterval(timer); lastPosition.current = null;
      // Дождаться начатой отправки, чтобы отключение не было перезаписано поздним PUT.
      void pending.then(() => authorized('/api/map/location', { method: 'DELETE' })).catch(() => {});
    };
  }, [sharing, focused]);

  const submitPoint = useCallback(async (id: string) => {
    try {
      setError(''); await authorized(`/api/map/places/${encodeURIComponent(id)}/submit`, {method:'POST'});
      setNotice('Точка отправлена на проверку'); await load(session);
    } catch (e) { setError(messageOf(e)); }
  }, [load, session]);

  useEffect(() => {
    if (!focused || !loaded || !params.focusType || !params.focusId) return;
    const focusId = params.focusId;
    const key = `${params.focusType}:${focusId}`;
    if (handledFocus.current === key) return;
    const timer = setTimeout(() => {
    if (params.focusType === 'user') {
      const user = people.find(item => item.id === focusId);
      if (user) { move(user); setNotice(`Показано положение: ${user.name}`); handledFocus.current = key; }
      else if (session) { setNotice('Пользователь сейчас не делится геопозицией'); handledFocus.current = key; }
    } else if (params.focusType === 'point' && session?.role === 'admin') {
      const point = places.find(item => item.id === focusId);
      if (point) { move(point); setNotice(`Показано место: ${point.name}`); }
      else setNotice('Точка не найдена');
      handledFocus.current = key;
    } else if (params.focusType === 'post' && session?.role === 'admin') {
      const point = places.find(item => item.postId === focusId);
      if (point) { move(point); setSelected(point); setName(point.name); setNotice('Можно выбрать новую точку и сохранить её'); }
      else setNotice('Выберите точку для этого места на карте');
      void api(`/api/posts/${encodeURIComponent(focusId)}`).then(post => setName(post.place)).catch(e => setError(messageOf(e)));
      setAdding(true); handledFocus.current = key;
    }
    }, 0);
    return () => clearTimeout(timer);
  }, [focused, loaded, params.focusType, params.focusId, people, places, session, move]);
  useEffect(() => {
    if (!focused) return;
    return registerMapSearchHandler(action => {
      if (action.type === 'route') {
        void Linking.openURL(`https://yandex.ru/maps/?rtext=${encodeURIComponent(`~${action.query}`)}&rtt=auto`).catch(e => setError(messageOf(e)));
      } else if (action.query) {
        setQuery(action.query);
        const point = places.find(item => action.query && item.name.toLowerCase().includes(action.query.toLowerCase()));
        if (point) move(point); else setNotice('Адрес не найден среди точек карты. Можно открыть поиск в Яндекс Картах.');
      }
    });
  }, [focused, places, move]);

  const locate = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Нет разрешения на геолокацию');
      const result = await Location.getCurrentPositionAsync({});
      move({ latitude: result.coords.latitude, longitude: result.coords.longitude });
    } catch (e) { setError(messageOf(e)); }
  };
  const save = async () => {
    if (!session?.token) { setError('Войдите в аккаунт, чтобы добавить место'); return; }
    if (!selected || !name.trim()) { setError('Укажите название и выберите точку на карте'); return; }
    setSaving(true); setError('');
    try {
      const postId = params.focusType === 'post' && session.role === 'admin' ? params.focusId : undefined;
      await authorized('/api/map/places', { method: 'POST', body: JSON.stringify({ name: name.trim(), ...selected, ...(postId ? { postId } : {}) }) });
      setAdding(false); setSelected(null); setName(''); setNotice(postId ? 'Место добавлено на карту' : 'Место видно вам и друзьям. На проверку его можно отправить отдельно.');
      if (postId) router.setParams({ focusType: undefined, focusId: undefined });
      await load(session);
    } catch (e) { setError(messageOf(e)); } finally { setSaving(false); }
  };
  const search = () => {
    const text = query.trim().toLowerCase();
    const point = places.find(item => item.name.toLowerCase().includes(text));
    if (text && point) { move(point); setNotice(`Найдено: ${point.name}`); }
    else if (text) setNotice('Среди точек карты ничего не найдено');
  };

  return <View style={styles.root}>
    <View style={styles.map}><MapCanvas state={{ places, people, selected, center }} onSelect={select} onError={canvasError} onSubmit={submitPoint} /></View>
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.header}><Ionicons name="map" size={20} color="#2563eb" /><Text style={styles.title}>Карта города</Text><TouchableOpacity accessibilityLabel="Моё местоположение" onPress={() => void locate()}><Ionicons name="locate" size={23} color="#2563eb" /></TouchableOpacity></View>
      <View style={styles.search}><TextInput accessibilityLabel="Поиск места на карте" placeholder="Поиск среди добавленных мест" value={query} onChangeText={setQuery} onSubmitEditing={search} style={styles.input} /><TouchableOpacity onPress={search}><Ionicons name="search" size={22} color="#2563eb" /></TouchableOpacity></View>
      {(error || notice) ? <TouchableOpacity onPress={() => { setError(''); setNotice(''); }} style={styles.message}><Text style={error ? styles.error : styles.hint}>{error || notice}  ×</Text></TouchableOpacity> : null}
      <ScrollView style={styles.panel} keyboardShouldPersistTaps="handled">
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primary} onPress={() => { setAdding(!adding); setError(''); }}><Text style={styles.primaryText}>{adding ? 'Отменить' : '+ Добавить место'}</Text></TouchableOpacity>
          {session?.role === 'user' && <TouchableOpacity style={styles.secondary} onPress={() => { setSharing(!sharing); setError(''); }}><Text style={styles.secondaryText}>{sharing ? 'Скрыть меня' : 'Показывать меня'}</Text></TouchableOpacity>}
          {session?.role === 'user' && session?.token && <TouchableOpacity style={styles.secondary} onPress={() => router.push('/connections')}><Text style={styles.secondaryText}>Друзья</Text></TouchableOpacity>}
          {session?.token && <TouchableOpacity style={styles.secondary} onPress={() => setMyPlacesOpen(!myPlacesOpen)}><Text style={styles.secondaryText}>Мои точки</Text></TouchableOpacity>}
        </View>
        {adding ? <View style={styles.form}><Text style={styles.hint}>Нажмите на карту, чтобы выбрать точку</Text><TextInput accessibilityLabel="Название места" placeholder="Название места" value={name} onChangeText={setName} maxLength={120} style={styles.field} /><Text style={styles.hint}>{selected ? `${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}` : 'Точка не выбрана'}</Text><TouchableOpacity style={styles.primary} disabled={saving} onPress={() => void save()}><Text style={styles.primaryText}>{saving ? 'Сохранение…' : 'Сохранить место'}</Text></TouchableOpacity></View> : <Text style={styles.hint}>{sharing ? 'Ваше положение видно вошедшим пользователям, пока открыта карта.' : 'Места и люди, которые разрешили показ геопозиции.'}</Text>}
        {!session && <Text style={styles.hint}>Войдите, чтобы добавлять места и видеть людей.</Text>}
        {myPlacesOpen && <View style={styles.form}><Text style={styles.hint}>Мои точки</Text>{places.filter(place => place.isOwn).length === 0 && <Text style={styles.hint}>Вы ещё не добавили точки.</Text>}{places.filter(place => place.isOwn).map(place => <View key={place.id} style={styles.friendRow}><TouchableOpacity onPress={() => move(place)}><Text style={styles.secondaryText}>{place.name}</Text></TouchableOpacity><Text style={styles.hint}>{place.reviewStatus === 'approved' ? 'Опубликовано' : place.reviewStatus === 'pending' ? 'На проверке' : 'Видно друзьям'}</Text>{place.reviewStatus === 'private' && <TouchableOpacity onPress={() => void submitPoint(place.id)}><Text style={styles.link}>Отправить на проверку</Text></TouchableOpacity>}</View>)}</View>}
        {query.trim() ? <TouchableOpacity onPress={() => void Linking.openURL(`https://yandex.ru/maps/?text=${encodeURIComponent(query.trim())}`).catch(e => setError(messageOf(e)))}><Text style={styles.link}>Найти адрес в Яндекс Картах ↗</Text></TouchableOpacity> : null}
      </ScrollView>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eaf1fa' }, map: { ...StyleSheet.absoluteFill },
  overlay: { ...StyleSheet.absoluteFill, padding: 16, paddingTop: Platform.OS === 'web' ? 16 : 48, paddingBottom: 100, justifyContent: 'flex-start' },
  header: { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, title: { color: '#0f172a', fontWeight: '700', fontSize: 18, flex: 1 },
  search: { marginTop: 8, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }, input: { flex: 1, paddingVertical: 13, color: '#0f172a' },
  message: { marginTop: 8, backgroundColor: '#fff', padding: 10, borderRadius: 12 }, error: { color: '#b42318', fontSize: 13 },
  panel: { flexGrow: 0, marginTop: 'auto', backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 18, padding: 14, maxHeight: '45%' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: { backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 }, primaryText: { color: 'white', fontWeight: '700', textAlign: 'center' },
  secondary: { backgroundColor: '#eaf1ff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 }, secondaryText: { color: '#1d4ed8', fontWeight: '600' },
  form: { gap: 8, marginTop: 10 }, friendRow: { gap: 3, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }, field: { borderWidth: 1, borderColor: '#cbd5e1', padding: 10, borderRadius: 10, color: '#0f172a' }, hint: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 8 }, link: { color: '#2563eb', marginTop: 8, fontSize: 13 },
});
