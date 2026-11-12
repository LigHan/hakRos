import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MapCanvas from '@/components/MapCanvas';
import type { MapCoordinates, MapPlace, MapPoint, MapState } from '@/components/MapCanvas.types';
import { MapBottomSheet } from '@/components/map-bottom-sheet';
import { MapLocationSharing } from '@/components/map-location-sharing';
import { MapRoutePanel, MapSearchResults, type MapSearchState } from '@/components/map-navigation-controls';
import { palette, useAppStyles } from '@/lib/app-appearance';
import { floatingNavigationHeight, floatingNavigationInset } from '@/lib/floating-navigation-layout';
import { highlightNearbySubscriptions } from '@/lib/map-nearby';
import { currentMapCoordinates, findAddresses, findRoute, placeSearchResult, type MapRoute, type MapSearchResult, type RoutePlan, type TravelMode } from '@/lib/map-navigation';
import { registerMapSearchHandler } from '@/lib/map-search';
import { api, ApiError, authorized } from '@/lib/statistics';
import { useNearbyMapPosition } from '@/lib/use-nearby-map-position';
import { useRoutePlayback } from '@/lib/use-route-playback';
import { getUserSession, type UserSession } from '@/lib/user-session';
import { webData } from '@/lib/web-data';

type FriendLocation = MapCoordinates & { id: string; name: string; avatar?: string | null; updatedAt: number; expiresInMs: number };
type FriendPin = MapPoint & { expiresAt: number };

const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить действие';

export default function MapScreen() {
  const styles = useAppStyles(baseStyles);
  const insets = useSafeAreaInsets();
  const [searchFocused, setSearchFocused] = useState(false);
  const router = useRouter();
  const params = useLocalSearchParams<{ focusType?: string; focusId?: string }>();
  const [session, setSession] = useState<UserSession | null>(null);
  const [focused, setFocused] = useState(false);
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [permissionCheck, setPermissionCheck] = useState(0);
  const [people, setPeople] = useState<FriendPin[]>([]);
  const [selected, setSelected] = useState<MapCoordinates | null>(null);
  const [center, setCenter] = useState<MapState['center']>(null);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<MapSearchState | null>(null);
  const [destination, setDestination] = useState<MapSearchResult | null>(null);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [route, setRoute] = useState<(MapRoute & { sequence: number }) | null>(null);
  const { playback, start: startPlayback, pause: pausePlayback, resume: resumePlayback,
    stop: stopPlayback, toggleCamera, releaseCamera } = useRoutePlayback();
  const [mapReady, setMapReady] = useState(false);
  const onMapReady = useCallback(() => setMapReady(true), []);
  const [routeStatus, setRouteStatus] = useState<'idle' | 'locating' | 'routing'>('idle');
  const [routeError, setRouteError] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [myPlacesOpen, setMyPlacesOpen] = useState(false);
  const searchRequest = useRef<AbortController | null>(null);
  const routeRequest = useRef<AbortController | null>(null);
  const handledFocus = useRef('');
  const loadVersion = useRef(0);
  const mapFocused = useRef(false);
  const position = useNearbyMapPosition(
    focused && session?.role === 'user' && Boolean(session.token) && places.some(place => place.isSubscribed),
    permissionCheck,
  );
  const routeStart = plan?.origin ?? null;
  const mapState = useMemo<MapState>(() => ({
    places: highlightNearbySubscriptions(places, position), people, selected, center, destination, routeStart, route,
    routePlayback: playback,
  }), [places, position, people, selected, center, destination, routeStart, route, playback]);
  const recheckLocation = () => setPermissionCheck(check => check + 1);

  const move = useCallback(({ latitude, longitude }: MapCoordinates) => {
    setCenter({ latitude, longitude, sequence: Date.now() + Math.random() });
  }, []);
  const cancelSearch = useCallback(() => {
    searchRequest.current?.abort();
    setSearchState(null);
  }, []);
  const resetRoute = useCallback(() => {
    routeRequest.current?.abort();
    stopPlayback();
    setRoute(null);
    setRouteStatus('idle');
    setRouteError('');
  }, [stopPlayback]);
  const closeDestination = useCallback(() => {
    resetRoute();
    setDestination(null);
    setPlan(null);
  }, [resetRoute]);
  const showDestination = useCallback((result: MapSearchResult, planOnSelect: boolean) => {
    cancelSearch();
    resetRoute();
    setDestination(result);
    setPlan(planOnSelect ? { mode: 'walk', origin: null, pickingOrigin: false } : null);
    move(result);
  }, [cancelSearch, resetRoute, move]);

  const chooseOrigin = useCallback((point: MapCoordinates, title: string) => {
    resetRoute();
    setPlan(current => current && { ...current, origin: { ...point, title }, pickingOrigin: false });
  }, [resetRoute]);
  const select = useCallback((latitude: number, longitude: number) => {
    const point = { latitude, longitude };
    if (plan?.pickingOrigin) chooseOrigin(point, 'точка на карте');
    else if (adding || !destination) setSelected(point);
  }, [adding, destination, plan?.pickingOrigin, chooseOrigin]);
  const canvasError = useCallback((message: string) => setError(message), []);
  const openPlace = useCallback((id: string) => {
    const postId = places.find(point => point.id === id)?.postId;
    if (mapFocused.current && postId) router.push({ pathname: '/company/[id]', params: { id: postId } });
  }, [places, router]);
  const load = useCallback(async (activeSession: UserSession | null) => {
    if (!mapFocused.current) return;
    const version = ++loadVersion.current;
    const requestedAt = Date.now();
    const options = activeSession?.token ? {headers:{Authorization:`Bearer ${activeSession.token}`}} : {};
    const [points, locations] = await Promise.allSettled([
      api('/api/map/places', options),
      activeSession?.role === 'user' && activeSession.token ? api('/api/map/locations', options) : Promise.resolve([]),
    ]);
    // An old request must never repaint another account's private places.
    if (!mapFocused.current || version !== loadVersion.current) return;
    if (points.status === 'fulfilled') setPlaces(points.value);
    else { setPlaces([]); setError(messageOf(points.reason)); }
    const received: FriendLocation[] = locations.status === 'fulfilled' ? locations.value : [];
    const receivedAt = Date.now();
    setPeople(received
      .filter(location => Number.isFinite(location.expiresInMs) && requestedAt + location.expiresInMs > receivedAt)
      .map(({ expiresInMs, ...location }) => ({ ...location, kind: 'person', expiresAt: requestedAt + expiresInMs })));
    setLoaded(true);
  }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    mapFocused.current = true;
    setLoaded(false);
    setFocused(true);
    void getUserSession().then(value => { if (active) { setSession(value); void load(value); } });
    return () => {
      active = false;
      mapFocused.current = false;
      loadVersion.current++;
      setPlaces([]);
      setPeople([]);
      setFocused(false);
      setSession(null);
      handledFocus.current = '';
      cancelSearch();
      closeDestination();
    };
  }, [load, cancelSearch, closeDestination]));
  useEffect(() => {
    if (!focused) return;
    const interval = session?.role === 'user' ? 10_000 : 20_000;
    const timer = setInterval(() => void load(session), interval);
    return () => clearInterval(timer);
  }, [focused, load, session]);

  useEffect(() => {
    if (!focused || people.length === 0) return;
    const deadline = people.reduce((earliest, friend) => Math.min(earliest, friend.expiresAt), Infinity);
    const timer = setTimeout(() => {
      const now = Date.now();
      setPeople(current => current.filter(friend => friend.expiresAt > now));
    }, Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [focused, people]);

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
      if (user) { move(user); setNotice(''); handledFocus.current = key; }
      else if (session) { setNotice('Геопозиция друга сейчас недоступна'); handledFocus.current = key; }
    } else if (params.focusType === 'point' && session?.role === 'admin') {
      const point = places.find(item => item.id === focusId);
      if (point) { move(point); setNotice(`Показано место: ${point.name}`); }
      else setNotice('Точка не найдена');
      handledFocus.current = key;
    }
    }, 0);
    return () => clearTimeout(timer);
  }, [focused, loaded, params.focusType, params.focusId, people, places, session, move]);
  const search = useCallback(async (input: string, fromCard = false, planOnSelect = false, postId?: string) => {
    if (!mapFocused.current) return;
    Keyboard.dismiss();
    cancelSearch();
    const pinned = postId && places.find(point => point.postId === postId);
    if (pinned) {
      showDestination(placeSearchResult(pinned), planOnSelect);
      return;
    }

    const text = input.trim();
    if (!text && !fromCard) return;
    if (text.length < 2) {
      setSearchState({ results: [], pending: false, planOnSelect,
        message: fromCard ? 'У этого места нет адреса.' : 'Введите хотя бы два символа.' });
      return;
    }

    const request = new AbortController();
    searchRequest.current = request;
    const normalize = (value: string) => value.toLowerCase().replace(/ё/g, 'е');
    const needle = normalize(text);
    let local = places.filter(point => normalize(point.name).includes(needle)).slice(0, 5).map(placeSearchResult);
    if (postId && !local.length) {
      try {
        const post = await api(`/api/posts/${encodeURIComponent(postId)}`);
        if (request.signal.aborted) return;
        const placeName = typeof post.place === 'string' ? normalize(post.place.trim()) : '';
        if (placeName) local = places.filter(point => normalize(point.name.trim()) === placeName).slice(0, 5).map(placeSearchResult);
      } catch { /* Address search remains available if the card could not be loaded. */ }
    }
    setSearchState({ results: local, pending: true, planOnSelect });

    try {
      const addresses = await findAddresses(text, request.signal);
      if (request.signal.aborted) return;
      const results = [...local, ...addresses];
      if (fromCard && results.length === 1 && !local.length) showDestination(results[0], planOnSelect);
      else setSearchState({ results, pending: false, planOnSelect,
        message: local.length && postId ? 'Выберите точку и проверьте её на карте: она ещё не связана с карточкой.' : results.length ? undefined : 'Адрес или место не найдено. Уточните запрос.' });
    } catch (cause) {
      if (!request.signal.aborted) {
        const message = cause instanceof ApiError ? cause.message : 'Не удалось найти адрес. Проверьте соединение и повторите поиск.';
        setSearchState({ results: local, pending: false, planOnSelect, message });
      }
    }
  }, [places, cancelSearch, showDestination]);

  useEffect(() => {
    if (!focused || !loaded) return;
    return registerMapSearchHandler(action => {
      if (!mapFocused.current) return false;
      if (!action.query && !action.postId) return true;
      setQuery(action.query ?? '');
      setAdding(false);
      setNotice('');
      closeDestination();
      void search(action.query ?? '', true, action.type === 'route', action.postId);
      return true;
    });
  }, [focused, loaded, search, closeDestination]);

  const locate = async () => {
    try {
      setError('');
      const point = await currentMapCoordinates();
      if (mapFocused.current) move(point);
    } catch (cause) {
      if (mapFocused.current) setError(messageOf(cause));
    } finally {
      if (mapFocused.current) recheckLocation();
    }
  };

  const locateOrigin = async () => {
    if (!plan || routeStatus !== 'idle') return;
    resetRoute();
    const request = new AbortController();
    routeRequest.current = request;
    setRouteStatus('locating');
    try {
      const point = await currentMapCoordinates();
      if (!request.signal.aborted) chooseOrigin(point, 'моё местоположение');
    } catch {
      if (!request.signal.aborted) setRouteError('Не удалось определить местоположение. Выберите старт на карте.');
    } finally {
      if (!request.signal.aborted) {
        setRouteStatus('idle');
        recheckLocation();
      }
    }
  };

  const changeMode = (mode: TravelMode) => {
    if (!plan || plan.mode === mode) return;
    resetRoute();
    setPlan({ ...plan, mode });
  };

  const buildRoute = async () => {
    if (!plan?.origin || !destination || plan.pickingOrigin || routeStatus !== 'idle') return;
    resetRoute();
    const request = new AbortController();
    routeRequest.current = request;
    setRouteStatus('routing');
    try {
      const result = await findRoute(plan.origin, destination, plan.mode, request.signal);
      if (!request.signal.aborted) setRoute({ ...result, sequence: Date.now() + Math.random() });
    } catch (cause) {
      if (!request.signal.aborted) {
        setRouteError(cause instanceof ApiError ? cause.message : 'Не удалось построить маршрут. Проверьте соединение.');
      }
    } finally {
      if (!request.signal.aborted) setRouteStatus('idle');
    }
  };
  const save = async () => {
    if (!session?.token) { setError('Войдите в аккаунт, чтобы добавить место'); return; }
    if (!selected || !name.trim()) { setError('Укажите название и выберите точку на карте'); return; }
    setSaving(true); setError('');
    try {
      await authorized('/api/map/places', { method: 'POST', body: JSON.stringify({ name: name.trim(), ...selected }) });
      setAdding(false); setSelected(null); setName(''); setNotice('Место видно вам и друзьям. На проверку его можно отправить отдельно.');
      await load(session);
    } catch (e) { setError(messageOf(e)); } finally { setSaving(false); }
  };
  return <View {...webData({ hakrosFocus: 'map' })} style={styles.root}>
    <View style={styles.map}>
      <MapCanvas state={mapState}
        onSelect={select} onError={canvasError} onSubmit={submitPoint} onOpenPlace={openPlace}
        onReady={onMapReady} onRouteCameraMove={releaseCamera} />
    </View>
    <View {...webData({ mapOverlay: 'true' })} pointerEvents="box-none" style={[styles.overlay, {
      paddingTop: insets.top + floatingNavigationInset,
      paddingBottom: floatingNavigationHeight(insets.bottom),
    }]}>
      <View style={styles.headerCard}>
        <Ionicons name="map" size={20} color={palette.olive} />
        <Text accessibilityRole="header" style={styles.title}>Карта города</Text>
        {focused && session?.role === 'user' && session.token && (
          <MapLocationSharing key={session.id} token={session.token} onError={canvasError}
            onOpenFriends={() => router.push('/connections')} onLocationGranted={recheckLocation} />
        )}
        <TouchableOpacity style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Моё местоположение" onPress={() => void locate()}>
          <Ionicons name="locate" size={23} color={palette.olive} />
        </TouchableOpacity>
      </View>
      <View {...webData({ focusGroup: 'map-search' })} style={[styles.searchCard, searchFocused && styles.searchFocused]}>
        <TextInput accessibilityLabel="Поиск адреса или места" placeholder="Адрес или название места"
          placeholderTextColor={palette.muted} value={query} onChangeText={text => { setQuery(text); cancelSearch(); }}
          onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
          onSubmitEditing={() => void search(query)} returnKeyType="search" maxLength={160} style={styles.input} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Найти на карте"
          onPress={() => void search(query)} style={styles.iconButton}>
          <Ionicons name="search" size={22} color={palette.olive} />
        </TouchableOpacity>
      </View>
      {searchState && <MapSearchResults search={searchState}
        onSelect={result => showDestination(result, searchState.planOnSelect)} onClose={cancelSearch} />}
      {(error || notice) ? <TouchableOpacity onPress={() => { setError(''); setNotice(''); }} style={styles.message}><Text style={error ? styles.error : styles.hint}>{error || notice}  ×</Text></TouchableOpacity> : null}
      <MapBottomSheet
        key={adding ? 'add-place' : destination?.id ?? 'map-actions'}
        title={adding ? 'Добавить место' : destination?.title ?? 'Действия на карте'}
      >
        {destination && !adding ? (
          <MapRoutePanel destination={destination} plan={plan} route={route} status={routeStatus} error={routeError}
            playback={playback} canStart={mapReady}
            onStart={() => { if (route && mapReady) startPlayback(route); }}
            onPause={pausePlayback} onResume={resumePlayback} onStop={stopPlayback} onToggleCamera={toggleCamera}
            onPlan={() => setPlan({ mode: 'walk', origin: null, pickingOrigin: false })}
            onClose={closeDestination} onMode={changeMode} onLocate={() => void locateOrigin()}
            onPickOrigin={() => {
              setRouteError('');
              setPlan(current => current && { ...current, pickingOrigin: !current.pickingOrigin });
            }}
            onEditOrigin={resetRoute} onBuild={() => void buildRoute()} />
        ) : (
          <>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.primary} onPress={() => { setAdding(!adding); setError(''); }}><Text style={styles.primaryText}>{adding ? 'Отменить' : '+ Добавить место'}</Text></TouchableOpacity>
              {session?.role === 'user' && session?.token && <TouchableOpacity style={styles.secondary} onPress={() => router.push('/connections')}><Text style={styles.secondaryText}>Друзья</Text></TouchableOpacity>}
              {session?.token && <TouchableOpacity style={styles.secondary} onPress={() => setMyPlacesOpen(!myPlacesOpen)}><Text style={styles.secondaryText}>Мои точки</Text></TouchableOpacity>}
            </View>
            {adding ? <View style={styles.form}><Text style={styles.hint}>Нажмите на карту, чтобы выбрать точку</Text><TextInput accessibilityLabel="Название места" placeholder="Название места" value={name} onChangeText={setName} maxLength={120} style={styles.field} /><Text style={styles.hint}>{selected ? `${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}` : 'Точка не выбрана'}</Text><TouchableOpacity style={styles.primary} disabled={saving} onPress={() => void save()}><Text style={styles.primaryText}>{saving ? 'Сохранение…' : 'Сохранить место'}</Text></TouchableOpacity></View> : <Text style={styles.hint}>Доступные вам места и друзья, которые поделились геопозицией.</Text>}
            {!session && <Text style={styles.hint}>Войдите, чтобы добавлять места и видеть людей.</Text>}
            {myPlacesOpen && <View style={styles.form}><Text style={styles.hint}>Мои точки</Text>{places.filter(place => place.isOwn).length === 0 && <Text style={styles.hint}>Вы ещё не добавили точки.</Text>}{places.filter(place => place.isOwn).map(place => <View key={place.id} style={styles.friendRow}><TouchableOpacity onPress={() => move(place)}><Text style={styles.secondaryText}>{place.name}</Text></TouchableOpacity><Text style={styles.hint}>{place.reviewStatus === 'approved' ? 'Опубликовано' : place.reviewStatus === 'pending' ? 'На проверке' : 'Видно друзьям'}</Text>{place.reviewStatus === 'private' && <TouchableOpacity onPress={() => void submitPoint(place.id)}><Text style={styles.link}>Отправить на проверку</Text></TouchableOpacity>}</View>)}</View>}
          </>
        )}
      </MapBottomSheet>
    </View>
  </View>;
}

const baseStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.cream }, map: { ...StyleSheet.absoluteFill },
  overlay: { ...StyleSheet.absoluteFill, paddingHorizontal: floatingNavigationInset },
  headerCard: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, paddingVertical: 6, paddingLeft: 12, paddingRight: 5, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: palette.forest, fontWeight: '700', fontSize: 19, flex: 1, minWidth: 0 },
  searchCard: { marginTop: 8, backgroundColor: palette.surface, borderRadius: 14, borderWidth: 2, borderColor: palette.border, paddingLeft: 12, paddingRight: 4, flexDirection: 'row', alignItems: 'center' },
  searchFocused: { borderColor: palette.olive },
  input: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 10, fontSize: 16, color: palette.forest },
  iconButton: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  message: { marginTop: 8, backgroundColor: palette.surface, padding: 10, borderRadius: 12 },
  error: { color: '#b42318', fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: { backgroundColor: palette.olive, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  primaryText: { color: palette.cream, fontWeight: '700', textAlign: 'center' },
  secondary: { backgroundColor: '#F0ECD1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  secondaryText: { color: palette.forest, fontWeight: '600' },
  form: { gap: 8, marginTop: 10 },
  friendRow: { gap: 3, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: palette.border },
  field: { borderWidth: 1, borderColor: palette.border, padding: 10, borderRadius: 10, color: palette.forest },
  hint: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  link: { color: palette.olive, marginTop: 8, fontSize: 13 },
});
