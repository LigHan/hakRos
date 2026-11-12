import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ActivityIndicator, Animated, Image, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type ViewProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '@/lib/statistics';
import { getUserSession } from '@/lib/user-session';
import { triggerMapRoute } from '@/lib/map-search';
import { webData } from '@/lib/web-data';

type PlaceCard = { placeId: string; name: string; address: string; image: string | null; description: string; reason: string; price: number | null; durationMinutes: number | null; actions: string[] };
type ChatMessage = { role: 'user' | 'assistant'; content: string; cards?: PlaceCard[]; durationMinutes?: number | null };
type Status = 'checking' | 'gigachat' | 'unavailable' | 'unauthorized';

const opening: ChatMessage = {
  role: 'assistant',
  content: 'Привет! Помогу придумать, чем заняться после пар. Сколько у тебя времени и какой бюджет?',
};
const WIDGET_SIZE = 54;
const MAX_LIFT = 110;
const quickMessages = ['Есть пара часов', 'Подскажи, куда сходить', 'Есть два часа', 'Хочу бесплатно', 'Выбери сам', 'Хочу с друзьями'];

function clampPosition(value: number, width: number) {
  return Math.max(0, Math.min(value, Math.max(0, width - WIDGET_SIZE)));
}

function createDockMotion() {
  const position = new Animated.Value(0);
  const lift = new Animated.Value(0);
  const held = new Animated.Value(0);
  let width = 0;
  let current = 0;
  let start = 0;
  let pendingDelta = 0;
  let pendingLift = 0;
  let startLift = 0;
  let measured = false;
  let pointerStartX = 0;
  let pointerStartPosition = 0;
  let pointerStartY = 0;
  let pointerStartLift = 0;
  let dragging = false;
  let suppressPress = false;
  let captureElement: HTMLElement | null = null;

  function press(active: boolean) {
    Animated.spring(held, { toValue: active ? 1 : 0, speed: 25, bounciness: 0, useNativeDriver: true }).start();
  }

  function moveLift(value: number) {
    lift.setValue(Math.max(-MAX_LIFT, Math.min(0, value)));
  }

  function release() {
    dragging = false;
    press(false);
    Animated.spring(lift, { toValue: 0, speed: 12, bounciness: 4, useNativeDriver: true }).start();
  }

  function settleAt(value: number) {
    current = clampPosition(value, width);
    Animated.spring(position, { toValue: current, speed: 18, bounciness: 0, useNativeDriver: true }).start();
  }

  const shouldMove = (dx: number, dy: number) => {
    const moving = Math.hypot(dx, dy) > 5;
    if (moving) { pendingDelta = dx; pendingLift = dy; }
    return moving;
  };
  const responder = PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => shouldMove(gesture.dx, gesture.dy),
    onMoveShouldSetPanResponderCapture: (_event, gesture) => shouldMove(gesture.dx, gesture.dy),
    onPanResponderGrant: () => {
      dragging = true;
      press(true);
      position.stopAnimation(value => {
        start = clampPosition(value + pendingDelta, width);
        current = start;
        pendingDelta = 0;
        position.setValue(start);
      });
      lift.stopAnimation(value => { startLift = Math.max(-MAX_LIFT, Math.min(0, value + pendingLift)); pendingLift = 0; moveLift(startLift); });
    },
    onPanResponderMove: (_event, gesture) => {
      current = clampPosition(start + gesture.dx, width);
      position.setValue(current);
      moveLift(startLift + gesture.dy);
    },
    onPanResponderRelease: (_event, gesture) => { settleAt(current + gesture.vx * 70); release(); },
    onPanResponderTerminate: () => { settleAt(current); release(); },
  });

  function measure(nextWidth: number) {
    if (nextWidth <= 0) return;
    const oldRange = Math.max(0, width - WIDGET_SIZE);
    const newRange = Math.max(0, nextWidth - WIDGET_SIZE);
    const next = measured && oldRange ? (current / oldRange) * newRange : newRange;
    width = nextWidth;
    measured = true;
    current = clampPosition(next, width);
    position.setValue(current);
  }

  const webHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      suppressPress = false;
      dragging = false;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      position.stopAnimation(value => { pointerStartPosition = value; });
      lift.stopAnimation(value => { pointerStartLift = value; });
      press(true);
      captureElement = event.currentTarget.querySelector('[role="button"]');
      captureElement?.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (!captureElement?.hasPointerCapture(event.pointerId)) return;
      const delta = event.clientX - pointerStartX;
      const verticalDelta = event.clientY - pointerStartY;
      if (Math.hypot(delta, verticalDelta) > 5) dragging = true;
      if (!dragging) return;
      current = clampPosition(pointerStartPosition + delta, width);
      position.setValue(current);
      moveLift(pointerStartLift + verticalDelta);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      if (!captureElement?.hasPointerCapture(event.pointerId)) return;
      captureElement.releasePointerCapture(event.pointerId);
      captureElement = null;
      if (dragging) {
        suppressPress = true;
        settleAt(current);
      }
      release();
    },
    onPointerCancel: () => { if (dragging) settleAt(current); captureElement = null; release(); },
  } as unknown as ViewProps;

  return {
    position,
    lift,
    held,
    panHandlers: Platform.OS === 'web' ? webHandlers : responder.panHandlers,
    measure,
    consumeDrag: () => { const wasDrag = suppressPress; suppressPress = false; return wasDrag; },
    press,
    releasePressIfIdle: () => { if (!dragging) press(false); },
    moveBy: (delta: number) => settleAt(current + delta),
  };
}

export function MascotIcon({ size = 42 }: { size?: number }) {
  const scale = size / 191;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.23, overflow: 'hidden', backgroundColor: '#687039' }}>
      <Image
        source={require('../../assets/images/assistant-mascot-reference.png')}
        accessible={false}
        resizeMode="stretch"
        style={{ position: 'absolute', width: 1280 * scale, height: 720 * scale, left: -1024 * scale, top: -517 * scale }}
      />
    </View>
  );
}

export function AssistantLauncher({ hidden = false }: { hidden?: boolean }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('checking');
  const [messages, setMessages] = useState<ChatMessage[]>([opening]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [catalogAvailable, setCatalogAvailable] = useState<boolean | null>(null);
  const listRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const sendingRef = useRef(false);
  const [dock] = useState(createDockMotion);

  function measureDock(event: LayoutChangeEvent) {
    dock.measure(event.nativeEvent.layout.width);
  }

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    getUserSession()
      .then(session => {
        if (!session?.token) throw new Error('unauthorized');
        return fetch(`${API_URL}/api/assistant/health`, { signal: controller.signal, headers: { Authorization: `Bearer ${session.token}` } });
      })
      .then(async response => {
        if (response.status === 401) throw new Error('unauthorized');
        if (!response.ok) throw new Error('unavailable');
        const body = await response.json();
        setStatus(body.configured && body.mode === 'gigachat' ? 'gigachat' : 'unavailable');
      })
      .catch(error => { if (!controller.signal.aborted) setStatus(error instanceof Error && error.message === 'unauthorized' ? 'unauthorized' : 'unavailable'); });
    return () => controller.abort();
  }, [open]);

  async function send(quickMessage?: string, excludedCards: PlaceCard[] = []) {
    const message = (quickMessage ?? draft).trim();
    if (!message || sendingRef.current) return;
    sendingRef.current = true;
    const history = messages.slice(1).slice(-6).map(item => ({ role: item.role, content: item.content.slice(0, 1000) }));
    setMessages(current => [...current, { role: 'user', content: message }]);
    setDraft('');
    setError('');
    setSending(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    try {
      const session = await getUserSession();
      if (!session?.token) throw new Error('unauthorized');
      const placeMatch = pathname.match(/^\/(?:company|place-post)\/([\w-]+)$/);
      const screen = placeMatch ? 'place' : pathname === '/' ? 'home' : ['/search', '/map', '/profile'].includes(pathname) ? pathname.slice(1) : pathname.startsWith('/plans') ? 'plans' : 'other';
      const context = { screen, ...(placeMatch ? { placeId: placeMatch[1] } : {}) };
      const response = await fetch(`${API_URL}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ message, history, context, excludePlaceIds: excludedCards.map(card => card.placeId) }),
        signal: controller.signal,
      });
      if (response.status === 401) throw new Error('unauthorized');
      if (response.status === 429) throw new Error('rate_limited');
      const data = await response.json();
      if (!response.ok || typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('unavailable');
      const cards: PlaceCard[] = Array.isArray(data.cards) ? data.cards.filter((item: PlaceCard) => item && typeof item.placeId === 'string' && typeof item.name === 'string' && Array.isArray(item.actions)) : [];
      setMessages(current => [...current, { role: 'assistant', content: data.reply, cards, durationMinutes: data.parameters?.durationMinutes ?? null }]);
      if (data.mode === 'gigachat') setStatus(data.mode);
      if (typeof data.catalogAvailable === 'boolean') setCatalogAvailable(data.catalogAvailable);
    } catch (failure) {
      setMessages(current => current.slice(0, -1));
      setDraft(message);
      const unauthorized = failure instanceof Error && failure.message === 'unauthorized';
      if (unauthorized) setStatus('unauthorized');
      setError(unauthorized ? 'Сессия завершилась. Войдите в аккаунт снова.' : failure instanceof Error && failure.message === 'rate_limited' ? 'Слишком много запросов. Подожди немного и попробуй снова.' : 'Не удалось связаться с помощником. Проверьте подключение и попробуйте ещё раз.');
    } finally {
      clearTimeout(timeout);
      sendingRef.current = false;
      setSending(false);
    }
  }

  const statusLabel = {
    checking: 'Проверяем настройку', gigachat: 'GigaChat настроен', unavailable: 'Помощник недоступен', unauthorized: 'Войдите в аккаунт',
  }[status];

  async function openAssistant() {
    if (dock.consumeDrag()) return;
    const session = await getUserSession();
    if (!session?.token) { router.push('/login'); return; }
    setStatus('checking');
    setOpen(true);
  }

  return (
    <>
      <View {...webData({ assistantDock: 'true' })} pointerEvents={hidden ? 'none' : 'box-none'} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'} onLayout={measureDock} style={[styles.dockZone, hidden && styles.hidden, { bottom: Math.max(insets.bottom, 12) + 71 }]}>
        <Animated.View {...dock.panHandlers} style={[styles.draggable, Platform.OS === 'web' && ({ touchAction: 'none', cursor: 'grab' } as unknown as ViewStyle), { transform: [{ translateX: dock.position }, { translateY: dock.lift }] }]}>
          <Animated.View pointerEvents="none" style={[styles.grabHalo, { opacity: dock.held }]} />
          <Animated.View style={{ transform: [{ scale: dock.held.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Открыть помощника"
            accessibilityHint="Нажмите, чтобы открыть чат, или удерживайте и перетащите помощника"
            accessibilityActions={[{ name: 'increment', label: 'Переместить вправо' }, { name: 'decrement', label: 'Переместить влево' }]}
            onAccessibilityAction={event => {
              if (event.nativeEvent.actionName === 'increment') dock.moveBy(48);
              if (event.nativeEvent.actionName === 'decrement') dock.moveBy(-48);
            }}
            onPress={() => void openAssistant()}
            onPressIn={() => dock.press(true)}
            onPressOut={() => dock.releasePressIfIdle()}
            style={({ pressed }) => [styles.launcher, pressed && styles.pressed]}>
            <MascotIcon size={48} />
          </Pressable>
          </Animated.View>
        </Animated.View>
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
            <SafeAreaView edges={['bottom']} style={styles.sheet}>
              <View style={styles.handle} />
              <View style={styles.header}>
                <MascotIcon size={48} />
                <View style={styles.headerCopy}>
                  <Text style={styles.eyebrow}>ГОРОД ПОСЛЕ ПАР</Text>
                  <Text style={styles.title}>Твой помощник</Text>
                  <Text style={styles.status}>{statusLabel}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Закрыть помощника" onPress={() => setOpen(false)} style={styles.close}>
                  <Ionicons name="close" size={22} color="#28301b" />
                </Pressable>
              </View>

              <ScrollView ref={listRef} contentContainerStyle={styles.messages} onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
                {catalogAvailable === false && <Text style={styles.notice}>Каталог мест сейчас недоступен, поэтому помощник не сможет предложить конкретные места.</Text>}
                {catalogAvailable === true && <Text style={styles.notice}>Помощник пока не проверяет стоимость, время работы и длительность посещения — уточните их перед визитом.</Text>}
                {messages.map((item, index) => (
                  <View key={`${item.role}-${index}`} style={styles.messageGroup}>
                    <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
                      <Text style={[styles.bubbleText, item.role === 'user' && styles.userText]}>{item.content}</Text>
                    </View>
                    {item.cards?.map(card => (
                      <View key={card.placeId} style={styles.placeCard}>
                        {card.image && <Image source={{ uri: card.image.startsWith('/') ? `${API_URL}${card.image}` : card.image }} style={styles.placeImage} />}
                        <Text style={styles.placeTitle}>{card.name}</Text>
                        {!!card.address && <Text style={styles.placeMeta}>{card.address}</Text>}
                        {!!card.description && <Text numberOfLines={3} style={styles.placeMeta}>{card.description}</Text>}
                        <Text style={styles.placeMeta}>{card.reason}</Text>
                        <Text style={styles.placeMeta}>{card.price === null ? 'Стоимость не указана' : `${card.price} ₽`} · {card.durationMinutes === null ? 'Длительность не указана' : `${card.durationMinutes} мин`}</Text>
                        <View style={styles.placeActions}>
                          {card.actions.includes('open_place') && <Pressable accessibilityRole="button" onPress={() => { setOpen(false); router.push({ pathname: '/company/[id]', params: { id: card.placeId } }); }} style={styles.quickButton}><Text style={styles.quickText}>Открыть место</Text></Pressable>}
                          {card.actions.includes('route') && <Pressable accessibilityRole="button" onPress={() => { setOpen(false); router.push('/map'); triggerMapRoute(card.address || card.name, card.placeId); }} style={styles.quickButton}><Text style={styles.quickText}>Маршрут</Text></Pressable>}
                          {card.actions.includes('create_plan') && <Pressable accessibilityRole="button" onPress={() => { setOpen(false); router.push({ pathname: '/plans/create', params: { placeId: card.placeId, ...(item.durationMinutes ? { duration: String(item.durationMinutes) } : {}) } }); }} style={styles.quickButton}><Text style={styles.quickText}>Составить план</Text></Pressable>}
                        </View>
                      </View>
                    ))}
                    {!!item.cards?.length && <Pressable accessibilityRole="button" disabled={sending} onPress={() => void send('Предложи другое', item.cards)} style={styles.quickButton}><Text style={styles.quickText}>Предложи другое</Text></Pressable>}
                  </View>
                ))}
                {messages.length === 1 && !sending && (
                  <View style={styles.quickMessages}>
                    {quickMessages.map(message => (
                      <Pressable key={message} accessibilityRole="button" accessibilityLabel={message} onPress={() => send(message)} style={styles.quickButton}>
                        <Text style={styles.quickText}>{message}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {sending && <ActivityIndicator color="#69743c" style={styles.loading} />}
                {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                {status === 'unauthorized' && <Pressable accessibilityRole="button" onPress={() => { setOpen(false); router.push('/login'); }} style={styles.quickButton}><Text style={styles.quickText}>Войти в аккаунт</Text></Pressable>}
              </ScrollView>

              <View style={styles.composer}>
                <TextInput
                  accessibilityLabel="Сообщение помощнику"
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Например: есть 500 ₽ и два часа"
                  placeholderTextColor="#8c927e"
                  maxLength={1000}
                  returnKeyType="send"
                  onSubmitEditing={() => send()}
                  style={styles.input}
                />
                <Pressable accessibilityRole="button" accessibilityLabel="Отправить сообщение" disabled={sending || !draft.trim()} onPress={() => send()} style={[styles.send, (sending || !draft.trim()) && styles.disabled]}>
                  <Ionicons name="arrow-up" size={21} color="#fffdf4" />
                </Pressable>
              </View>
              <Text style={styles.footer}>Не отправляйте пароли и личные данные.</Text>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dockZone: { position: 'absolute', alignSelf: 'center', width: '86%', maxWidth: 420, height: WIDGET_SIZE, zIndex: 20 },
  hidden: { display: 'none' },
  draggable: { position: 'absolute', left: 0, width: WIDGET_SIZE, height: WIDGET_SIZE },
  grabHalo: { position: 'absolute', left: -7, top: -7, width: WIDGET_SIZE + 14, height: WIDGET_SIZE + 14, borderRadius: 24, backgroundColor: '#a3b370', opacity: 0.45 },
  launcher: { width: WIDGET_SIZE, height: WIDGET_SIZE, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fdfbf0', borderRadius: 17, elevation: 6, shadowColor: '#1c2514', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  pressed: { opacity: 0.85 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(22, 29, 17, 0.5)' },
  modalWrap: { width: '100%', maxWidth: 480, height: '78%' },
  sheet: { flex: 1, backgroundColor: '#fbf9f0', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  handle: { width: 36, height: 4, borderRadius: 4, backgroundColor: '#c5c9b5', alignSelf: 'center', marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#e6e9da' },
  headerCopy: { flex: 1, gap: 2 },
  eyebrow: { color: '#7b845a', fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: '#27321e', fontSize: 19, fontWeight: '800' },
  status: { color: '#7e866b', fontSize: 11 },
  close: { padding: 9, borderRadius: 30, backgroundColor: '#edf0e1' },
  messages: { padding: 18, gap: 12, flexGrow: 1 },
  notice: { color: '#7c6a3d', backgroundColor: '#f6edcf', borderRadius: 12, padding: 11, lineHeight: 17, fontSize: 12 },
  bubble: { paddingHorizontal: 15, paddingVertical: 12, borderRadius: 18, maxWidth: '88%' },
  messageGroup: { gap: 8 },
  placeCard: { padding: 12, borderRadius: 18, borderWidth: 1, borderColor: '#e3e7d8', backgroundColor: '#fffdf4', gap: 7 },
  placeImage: { width: '100%', height: 105, borderRadius: 12, backgroundColor: '#edf0e1' },
  placeTitle: { fontSize: 15, color: '#27321e', fontWeight: '800' },
  placeMeta: { fontSize: 12, color: '#69745b', lineHeight: 17 },
  placeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#e9eddd', borderBottomLeftRadius: 5 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#64713d', borderBottomRightRadius: 5 },
  bubbleText: { color: '#293321', fontSize: 14, lineHeight: 21 },
  userText: { color: '#fffdf5' },
  quickMessages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'flex-start' },
  quickButton: { borderWidth: 1, borderColor: '#cbd3b6', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fbfcf5' },
  quickText: { color: '#526039', fontSize: 12, fontWeight: '600' },
  loading: { alignSelf: 'flex-start', marginLeft: 12 },
  error: { color: '#a04535', fontSize: 12, lineHeight: 17 },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, paddingTop: 10 },
  input: { flex: 1, minWidth: 0, height: 48, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7d8', borderRadius: 16, paddingHorizontal: 14, color: '#27321e', fontSize: 13 },
  send: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#64713d' },
  disabled: { opacity: 0.45 },
  footer: { color: '#929984', textAlign: 'center', fontSize: 10, paddingVertical: 9 },
});
