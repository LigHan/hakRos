import { useAppStyles } from '@/lib/app-appearance';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { placeCategories } from '@/lib/place-categories';
import { ApiError, authorized } from '@/lib/statistics';
import { clearUserSession } from '@/lib/user-session';

type Place = { id: string; place: string; bio: string | null; address: string | null; category: string | null; entry_type: 'unknown' | 'free' | 'paid' | null; entry_price: number | null; spend_min: number | null; spend_max: number | null; price_source: string | null; price_updated_at: string | null };
type Account = { id: number; email: string; name: string; surname: string | null; role: 'user' | 'company' };
type MapPoint = { id: string; name: string; latitude: number; longitude: number; postId: string | null; reviewStatus: 'pending' | 'approved'; creatorName: string | null };
type PlaceForm = { place: string; bio: string; address: string; category: string };
type PricingForm = { entryType: 'unknown' | 'free' | 'paid'; entryPrice: string; spendMin: string; spendMax: string; source: string };
type AccountForm = { email: string; name: string; surname: string };
type Metric = 'card_view' | 'search' | 'search_no_results' | 'favorite_added' | 'like_added' | 'route_requested' | 'share_initiated';
type Stats = { role: string; counts: Record<Metric, number>; categories: { category: string; n: number }[] };
type Section = 'overview' | 'places' | 'users';

const metricLabels: { key: Metric; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'card_view', label: 'Просмотры мест', icon: 'eye-outline' },
  { key: 'search', label: 'Поисковые запросы', icon: 'search-outline' },
  { key: 'favorite_added', label: 'В избранное', icon: 'bookmark-outline' },
  { key: 'like_added', label: 'Отметки «Нравится»', icon: 'heart-outline' },
  { key: 'route_requested', label: 'Маршруты', icon: 'navigate-outline' },
  { key: 'share_initiated', label: 'Нажатия «Поделиться»', icon: 'share-social-outline' },
  { key: 'search_no_results', label: 'Поиски без результатов', icon: 'alert-circle-outline' },
];

// Веб-панель использует серверные права; на Android администратор остаётся в обычном интерфейсе.
export default function AdminPage() {
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [section, setSection] = useState<Section>('overview');
  const [places, setPlaces] = useState<Place[]>([]);
  const [users, setUsers] = useState<Account[]>([]);
  const [mapPlaces, setMapPlaces] = useState<MapPoint[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [query, setQuery] = useState('');
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [placeForm, setPlaceForm] = useState<PlaceForm>({ place: '', bio: '', address: '', category: '' });
  const [pricingForm, setPricingForm] = useState<PricingForm>({ entryType: 'unknown', entryPrice: '', spendMin: '', spendMax: '', source: '' });
  const [linkPlaceId, setLinkPlaceId] = useState<string | null>(null);
  const [linkPointId, setLinkPointId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<AccountForm>({ email: '', name: '', surname: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setNeedsLogin(false);
    try {
      const [nextPlaces, nextUsers, nextStats, nextMapPlaces]: [Place[], Account[], Stats, MapPoint[]] = await Promise.all([
        authorized('/api/admin/places'), authorized('/api/admin/users'), authorized('/api/statistics'), authorized('/api/admin/map-places'),
      ]);
      setPlaces(nextPlaces); setUsers(nextUsers); setStats(nextStats); setMapPlaces(nextMapPlaces);
      return true;
    } catch (e) {
      setPlaces([]); setUsers([]); setMapPlaces([]); setStats(null);
      setNeedsLogin(e instanceof ApiError && e.status === 401);
      setError(e instanceof Error ? e.message : 'Не удалось загрузить данные');
      return false;
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { if (Platform.OS === 'web') void load(); }, [load]));

  const save = async () => {
    if (saving) return;
    const path = section === 'places' ? `/api/admin/places/${encodeURIComponent(placeId ?? '')}` : `/api/admin/users/${userId}`;
    setSaving(true); setError(''); setNotice('');
    try {
      await authorized(path, { method: 'PUT', body: JSON.stringify(section === 'places' ? placeForm : userForm) });
      setPlaceId(null); setUserId(null);
      if (await load()) setNotice('Изменения сохранены');
    } catch (e) { setNeedsLogin(e instanceof ApiError && e.status === 401); setError(e instanceof Error ? e.message : 'Не удалось сохранить изменения'); }
    finally { setSaving(false); }
  };

  const logout = async () => {
    await authorized('/api/logout', { method: 'POST' }).catch(() => {});
    await clearUserSession();
    router.replace('/login');
  };
  const reviewPoint = async (id: string, decision: 'approve' | 'reject') => {
    if (saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await authorized(`/api/admin/map-places/${encodeURIComponent(id)}/review`, {method:'POST', body:JSON.stringify({decision})});
      if (await load()) setNotice(decision === 'approve' ? 'Точка опубликована' : 'Точка возвращена автору');
    } catch (e) { setNeedsLogin(e instanceof ApiError && e.status === 401); setError(e instanceof Error ? e.message : 'Не удалось проверить точку'); }
    finally { setSaving(false); }
  };
  const savePricing = async () => {
    if (saving || !placeId) return;
    const number = (value: string) => value.trim() ? Number(value.trim().replace(',', '.')) : null;
    const entryPrice = pricingForm.entryType === 'paid' ? number(pricingForm.entryPrice) : null;
    const spendMin = number(pricingForm.spendMin), spendMax = number(pricingForm.spendMax);
    if ([entryPrice, spendMin, spendMax].some(value => value !== null && (!Number.isFinite(value) || value < 0))) { setError('Укажите корректную стоимость.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      await authorized(`/api/admin/places/${encodeURIComponent(placeId)}/pricing`, { method: 'PUT', body: JSON.stringify({ entryType: pricingForm.entryType, entryPrice, spendMin, spendMax, source: pricingForm.source }) });
      if (await load()) setNotice('Стоимость сохранена отдельно от остальных изменений карточки');
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить стоимость'); }
    finally { setSaving(false); }
  };
  const linkPoint = async () => {
    if (!linkPlaceId || !linkPointId || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await authorized(`/api/admin/map-places/${encodeURIComponent(linkPointId)}/link`, { method: 'POST', body: JSON.stringify({ postId: linkPlaceId, confirmed: true }) });
      setLinkPlaceId(null); setLinkPointId(null);
      if (await load()) setNotice('Точка связана с карточкой места');
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось связать точку'); }
    finally { setSaving(false); }
  };
  const select = (value: Section) => { setSection(value); setQuery(''); if (stats) setError(''); setNotice(''); setPlaceId(null); setUserId(null); };
  const matches = (value: string) => value.toLowerCase().includes(query.trim().toLowerCase());
  const filteredPlaces = places.filter(p => matches(`${p.place} ${p.address || ''} ${p.category || ''}`));
  const filteredUsers = users.filter(u => matches(`${u.name} ${u.surname || ''} ${u.email}`));
  const linkedPointIds = new Map<string, string>();
  for (const point of mapPlaces) {
    if (point.postId) linkedPointIds.set(point.postId, point.id);
  }
  const title = section === 'overview' ? 'Обзор' : section === 'places' ? 'Места и публикации' : 'Пользователи';

  if (Platform.OS !== 'web') return <Redirect href="/profile" />;

  return (
    <View style={[styles.layout, compact && styles.layoutCompact]}>
      <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
        <View style={styles.brand}><View style={styles.brandMark}><Ionicons name="compass" size={20} color="#FEFAE0" /></View><View><Text style={styles.brandTitle}>hakRos</Text><Text style={styles.brandCaption}>ПАНЕЛЬ УПРАВЛЕНИЯ</Text></View></View>
        <Text style={styles.navCaption}>РАБОЧЕЕ ПРОСТРАНСТВО</Text>
        <View style={[styles.nav, compact && styles.navCompact]}>
          <NavItem icon="grid-outline" label="Обзор" active={section === 'overview'} onPress={() => select('overview')} />
          <NavItem icon="location-outline" label="Места" active={section === 'places'} onPress={() => select('places')} />
          <NavItem icon="people-outline" label="Пользователи" active={section === 'users'} onPress={() => select('users')} />
        </View>
        <View style={styles.sidebarBottom}>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.navItem}><Ionicons name="open-outline" size={19} color="#6F7457" /><Text style={styles.navText}>Перейти на сайт</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void logout()} style={styles.navItem}><Ionicons name="log-out-outline" size={19} color="#6F7457" /><Text style={styles.navText}>Выйти из аккаунта</Text></Pressable>
        </View>
      </View>
      <ScrollView style={styles.content} contentContainerStyle={[styles.contentInner, compact && styles.contentCompact]} keyboardShouldPersistTaps="handled">
        <View style={styles.topline}><Text style={styles.breadcrumb}>HAKROS  /  УПРАВЛЕНИЕ</Text>{stats?.role === 'admin' && <View style={styles.adminBadge}><View style={styles.statusDot} /><Text style={styles.adminBadgeText}>Администратор</Text></View>}</View>
        <View style={styles.titleRow}><View><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{section === 'overview' ? 'Активность сервиса и основные показатели' : section === 'places' ? 'Просмотр и редактирование данных мест' : 'Аккаунты пользователей и компаний'}</Text></View><Text style={styles.period}>ЛОКАЛЬНОЕ ДЕМО</Text></View>
        {loading ? <ActivityIndicator color="#DDA15E" style={styles.loader} /> : null}
        {error ? <View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>{needsLogin ? <Action label="Войти в аккаунт" onPress={() => router.replace('/login')} /> : <Action label="Повторить" onPress={() => void load()} />}</View> : null}
        {notice ? <Text accessibilityRole="alert" style={styles.success}>{notice}</Text> : null}
        {!loading && stats && section === 'overview' && <>
          <View style={styles.sectionHeading}><View><Text style={styles.heading}>Статистика сервиса</Text><Text style={styles.muted}>Активность за последние 30 дней</Text></View><Action label="Обновить" onPress={() => void load()} /></View>
          <View style={styles.metricGrid}>{metricLabels.map(metric => <View key={metric.key} style={styles.metricCard}><View style={styles.metricIcon}><Ionicons name={metric.icon} size={19} color="#DDA15E" /></View><Text style={styles.metricValue}>{stats.counts[metric.key] ?? 0}</Text><Text style={styles.muted}>{metric.label}</Text></View>)}</View>
          <View style={styles.panel}><View style={styles.sectionHeading}><View><Text style={styles.heading}>Категории мест</Text><Text style={styles.muted}>Распределение просмотров карточек</Text></View></View>{stats.categories.length ? stats.categories.map(category => <View key={category.category} style={styles.categoryRow}><Text style={styles.bodyText}>{category.category}</Text><Text style={styles.bodyText}>{category.n}</Text></View>) : <Text style={styles.muted}>Просмотров пока нет.</Text>}</View>
          <Text style={styles.note}>Показано количество действий, а не уникальных людей. Поиски без результатов входят в общее число поисков.</Text>
        </>}
        {!loading && section !== 'overview' && <View style={styles.panel}>
          <View style={styles.tableTop}><View><Text style={styles.heading}>{title}</Text><Text style={styles.muted}>Всего записей: {section === 'places' ? places.length : users.length}</Text></View><TextInput accessibilityLabel="Поиск" placeholder="Поиск..." placeholderTextColor="#6F7457" value={query} onChangeText={setQuery} style={styles.search} /></View>
          {section === 'places' && filteredPlaces.map(item => {
            const linkedPointId = linkedPointIds.get(item.id);
            return (
              <View key={item.id} style={styles.row}>
                {placeId === item.id ? <View style={styles.form}>
                  <Field label="Название" value={placeForm.place} onChange={value => setPlaceForm({ ...placeForm, place: value })} />
                  <Field label="Описание" value={placeForm.bio} onChange={value => setPlaceForm({ ...placeForm, bio: value })} multiline />
                  <Field label="Адрес" value={placeForm.address} onChange={value => setPlaceForm({ ...placeForm, address: value })} />
                  <Text style={styles.label}>Категория</Text><View style={styles.chips}><Action label="Не указана" active={!placeForm.category} onPress={() => setPlaceForm({ ...placeForm, category: '' })} />{placeCategories.filter(c => c.id !== 'all').map(c => <Action key={c.id} label={c.name} active={placeForm.category === c.id} onPress={() => setPlaceForm({ ...placeForm, category: c.id })} />)}</View>
                  {placeForm.category && !placeCategories.some(c => c.id === placeForm.category) ? <Text style={styles.muted}>Текущая категория: {placeForm.category}</Text> : null}
                  <View style={styles.chips}><Action label={saving ? 'Сохранение…' : 'Сохранить'} active disabled={saving} onPress={() => void save()} /><Action label="Отмена" disabled={saving} onPress={() => setPlaceId(null)} /></View>
                  <Text style={styles.label}>Стоимость входа</Text><View style={styles.chips}>{(['unknown', 'free', 'paid'] as const).map(value => <Action key={value} label={value === 'unknown' ? 'Неизвестно' : value === 'free' ? 'Бесплатно' : 'Платно'} active={pricingForm.entryType === value} onPress={() => setPricingForm({ ...pricingForm, entryType: value })} />)}</View>
                  {pricingForm.entryType === 'paid' && <Field label="Вход, ₽" value={pricingForm.entryPrice} onChange={value => setPricingForm({ ...pricingForm, entryPrice: value })} />}
                  <Field label="Расходы внутри от, ₽ (необязательно)" value={pricingForm.spendMin} onChange={value => setPricingForm({ ...pricingForm, spendMin: value })} />
                  <Field label="Расходы внутри до, ₽ (необязательно)" value={pricingForm.spendMax} onChange={value => setPricingForm({ ...pricingForm, spendMax: value })} />
                  <Field label="Источник стоимости" value={pricingForm.source} onChange={value => setPricingForm({ ...pricingForm, source: value })} />
                  <Text style={styles.muted}>Укажите источник подтверждённых сведений; пустое поле расходов означает, что они неизвестны.</Text>
                  <View style={styles.chips}><Action label="Сохранить стоимость" active disabled={saving} onPress={() => void savePricing()} /></View>
                </View> : <>
                  <View style={styles.rowMain}>
                    <Text style={styles.bodyText}>{item.place}</Text>
                    <Text style={styles.muted}>{item.address || 'Адрес не указан'} · {placeCategories.find(c => c.id === item.category)?.name || item.category || 'Без категории'}</Text>
                    {!linkedPointId && <Text style={styles.muted}>Нет метки на карте</Text>}
                  </View>
                  {linkedPointId && <Action label="Показать на карте" onPress={() => router.push({ pathname: '/map', params: { focusType: 'point', focusId: linkedPointId } })} />}
                  {!linkedPointId && <Action label="Привязать точку" onPress={() => { setLinkPlaceId(item.id); setLinkPointId(null); }} />}
                  <Action label="Редактировать" onPress={() => { setError(''); setNotice(''); setPlaceId(item.id); setPlaceForm({ place: item.place, bio: item.bio || '', address: item.address || '', category: item.category || '' }); setPricingForm({ entryType: item.entry_type || 'unknown', entryPrice: item.entry_price?.toString() || '', spendMin: item.spend_min?.toString() || '', spendMax: item.spend_max?.toString() || '', source: item.price_source || '' }); }} />
                  {linkPlaceId === item.id && <View style={styles.form}><Text style={styles.muted}>Выберите опубликованную точку и проверьте координаты перед привязкой.</Text>{mapPlaces.filter(point => point.reviewStatus === 'approved' && !point.postId).map(point => <Action key={point.id} label={`${point.name} · ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`} active={point.id === linkPointId} onPress={() => setLinkPointId(point.id)} />)}<View style={styles.chips}><Action label="Подтвердить привязку" active disabled={!linkPointId || saving} onPress={() => void linkPoint()} /><Action label="Отмена" onPress={() => { setLinkPlaceId(null); setLinkPointId(null); }} /></View></View>}
                </>}
              </View>
            );
          })}
          {section === 'users' && filteredUsers.map(item => <View key={item.id} style={styles.row}>
            {userId === item.id ? <View style={styles.form}>
              <Field label="Имя" value={userForm.name} onChange={value => setUserForm({ ...userForm, name: value })} /><Field label="Фамилия" value={userForm.surname} onChange={value => setUserForm({ ...userForm, surname: value })} /><Field label="Email" value={userForm.email} onChange={value => setUserForm({ ...userForm, email: value })} />
              <Text style={styles.muted}>Роль: {item.role === 'company' ? 'Компания' : 'Пользователь'}</Text><View style={styles.chips}><Action label={saving ? 'Сохранение…' : 'Сохранить'} active disabled={saving} onPress={() => void save()} /><Action label="Отмена" disabled={saving} onPress={() => setUserId(null)} /></View>
            </View> : <><View style={styles.rowMain}><Text style={styles.bodyText}>{[item.name, item.surname].filter(Boolean).join(' ')}</Text><Text style={styles.muted}>{item.email}</Text></View><Text style={styles.role}>{item.role === 'company' ? 'Компания' : 'Пользователь'}</Text><Action label="Редактировать" onPress={() => { setError(''); setNotice(''); setUserId(item.id); setUserForm({ email: item.email, name: item.name, surname: item.surname || '' }); }} /></>}
          </View>)}
          {(section === 'places' ? filteredPlaces : filteredUsers).length === 0 ? <Text style={styles.empty}>Записей не найдено.</Text> : null}
          {section === 'places' && <><Text style={[styles.heading, { marginTop: 24 }]}>Точки интереса на карте</Text><Text style={styles.muted}>На проверке и опубликованные точки</Text>{mapPlaces.filter(item => matches(item.name)).map(item => <View key={item.id} style={styles.row}><View style={styles.rowMain}><Text style={styles.bodyText}>{item.name}</Text><Text style={styles.muted}>{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)} · {item.creatorName || 'Администратор'} · {item.reviewStatus === 'pending' ? 'На проверке' : 'Опубликовано'}</Text></View><Action label="Проверить на карте" onPress={() => router.push({ pathname: '/map', params: { focusType: 'point', focusId: item.id } })} />{item.reviewStatus === 'pending' && <><Action label="Одобрить" active disabled={saving} onPress={() => void reviewPoint(item.id,'approve')} /><Action label="Отклонить" disabled={saving} onPress={() => void reviewPoint(item.id,'reject')} /></>}</View>)}</>}
        </View>}
      </ScrollView>
    </View>
  );
}

function NavItem({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) {
  const styles = useAppStyles(baseStyles);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.navItem, active && styles.navItemActive]}><Ionicons name={icon} size={19} color={active ? '#FEFAE0' : '#6F7457'} /><Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text></Pressable>;
}
function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  const styles = useAppStyles(baseStyles);
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} multiline={multiline} autoCapitalize={label === 'Email' ? 'none' : 'sentences'} style={[styles.input, multiline && styles.multiline]} /></View>;
}
function Action({ label, onPress, active = false, disabled = false }: { label: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  const styles = useAppStyles(baseStyles);
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, active && styles.actionActive, disabled && styles.disabled]}><Text style={[styles.actionText, active && styles.actionTextActive]}>{label}</Text></Pressable>;
}

const baseStyles = StyleSheet.create({
  layout: { flex: 1, minHeight: '100%', flexDirection: 'row', backgroundColor: '#FEFAE0' }, layoutCompact: { flexDirection: 'column' },
  sidebar: { width: 238, backgroundColor: '#FFFCED', borderRightWidth: 1, borderColor: '#D9D6B5', paddingHorizontal: 18, paddingVertical: 24 }, sidebarCompact: { width: '100%', paddingVertical: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 44 }, brandMark: { width: 37, height: 37, borderRadius: 11, backgroundColor: '#606C38', alignItems: 'center', justifyContent: 'center' }, brandTitle: { color: '#283618', fontSize: 19, fontWeight: '700' }, brandCaption: { color: '#6F7457', fontSize: 9, letterSpacing: 1 },
  navCaption: { color: '#6F7457', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 12, marginLeft: 11 }, nav: { gap: 5 }, navCompact: { flexDirection: 'row', flexWrap: 'wrap' }, navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11 }, navItemActive: { backgroundColor: '#606C38' }, navText: { color: '#6F7457', fontSize: 14 }, navTextActive: { color: '#FEFAE0', fontWeight: '600' }, sidebarBottom: { marginTop: 'auto', paddingTop: 28, gap: 4 },
  content: { flex: 1 }, contentInner: { paddingVertical: 30, paddingHorizontal: 42, paddingBottom: 70, maxWidth: 1550, width: '100%', alignSelf: 'center' }, contentCompact: { padding: 20, paddingBottom: 50 },
  topline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 42 }, breadcrumb: { color: '#6F7457', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 }, adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 }, adminBadgeText: { color: '#283618', fontSize: 12 }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#DDA15E' },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 36 }, title: { fontSize: 30, fontWeight: '700', color: '#283618' }, subtitle: { color: '#6F7457', marginTop: 6, fontSize: 14 }, period: { color: '#6F7457', fontSize: 10, fontWeight: '700', letterSpacing: 1, borderWidth: 1, borderColor: '#606C38', borderRadius: 8, padding: 10 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }, heading: { color: '#283618', fontSize: 17, fontWeight: '700', marginBottom: 5 }, muted: { color: '#6F7457', fontSize: 13, lineHeight: 20 }, metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 22 }, metricCard: { backgroundColor: '#FFFCED', borderWidth: 1, borderColor: '#D9D6B5', borderRadius: 12, padding: 18, minWidth: 190, flexGrow: 1, flexBasis: 190, gap: 8 }, metricIcon: { width: 36, height: 36, backgroundColor: '#F0ECCD', borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 7 }, metricValue: { color: '#283618', fontWeight: '700', fontSize: 28 },
  panel: { backgroundColor: '#FFFCED', borderWidth: 1, borderColor: '#D9D6B5', borderRadius: 12, padding: 20 }, categoryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderColor: '#D9D6B5' }, note: { color: '#6F7457', fontSize: 12, lineHeight: 20, marginTop: 16 },
  tableTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 20 }, search: { minWidth: 230, color: '#283618', borderWidth: 1, borderColor: '#D9D6B5', backgroundColor: '#FFFCED', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, borderTopWidth: 1, borderColor: '#D9D6B5', paddingVertical: 16 }, rowMain: { flex: 1, minWidth: 180, gap: 4 }, bodyText: { color: '#283618', fontSize: 14, fontWeight: '600' }, role: { color: '#283618', backgroundColor: '#E6E8C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, fontSize: 12 }, empty: { color: '#6F7457', paddingVertical: 18 },
  action: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#D9D6B5', backgroundColor: '#F0ECCD' }, actionActive: { backgroundColor: '#BC6C25', borderColor: '#BC6C25' }, actionText: { color: '#283618', fontSize: 12, fontWeight: '600' }, actionTextActive: { color: '#fff' }, disabled: { opacity: 0.55 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, form: { width: '100%', gap: 12 }, field: { gap: 6 }, label: { color: '#283618', fontSize: 13, fontWeight: '600' }, input: { color: '#283618', borderWidth: 1, borderColor: '#D9D6B5', backgroundColor: '#FFFCED', padding: 10, borderRadius: 8 }, multiline: { minHeight: 80, textAlignVertical: 'top' }, loader: { marginVertical: 30 }, errorBox: { gap: 10, alignItems: 'flex-start', marginBottom: 16 }, error: { color: '#A23524' }, success: { color: '#DDA15E', marginBottom: 16 },
});
