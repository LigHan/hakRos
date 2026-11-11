import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ComponentRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ActivityIndicator, Animated, Image, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type ViewProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Status = 'checking' | 'gigachat' | 'unavailable';

const API_BASE = process.env.EXPO_PUBLIC_ASSISTANT_URL?.trim().replace(/\/+$/, '') ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001');

const opening: ChatMessage = {
  role: 'assistant',
  content: 'Привет! Помогу придумать, чем заняться после пар. Сколько у тебя времени и какой бюджет?',
};
const WIDGET_SIZE = 54;
const MAX_LIFT = 110;
const quickMessages = ['Есть пара часов', 'Подскажи, куда сходить'];

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

export function AssistantLauncher() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('checking');
  const [messages, setMessages] = useState<ChatMessage[]>([opening]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [catalogAvailable, setCatalogAvailable] = useState<boolean | null>(null);
  const listRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [dock] = useState(createDockMotion);

  function measureDock(event: LayoutChangeEvent) {
    dock.measure(event.nativeEvent.layout.width);
  }

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`${API_BASE}/api/assistant/health`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('unavailable');
        const body = await response.json();
        setStatus(body.configured && body.mode === 'gigachat' ? 'gigachat' : 'unavailable');
      })
      .catch(() => { if (!controller.signal.aborted) setStatus('unavailable'); });
    return () => controller.abort();
  }, [open]);

  async function send(quickMessage?: string) {
    const message = (quickMessage ?? draft).trim();
    if (!message || sending) return;
    const history = messages.slice(1).slice(-6).map(item => ({ ...item, content: item.content.slice(0, 1000) }));
    setMessages(current => [...current, { role: 'user', content: message }]);
    setDraft('');
    setError('');
    setSending(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(`${API_BASE}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('unavailable');
      setMessages(current => [...current, { role: 'assistant', content: data.reply }]);
      if (data.mode === 'gigachat') setStatus(data.mode);
      if (typeof data.catalogAvailable === 'boolean') setCatalogAvailable(data.catalogAvailable);
    } catch {
      setMessages(current => current.slice(0, -1));
      setDraft(message);
      setError('Не удалось связаться с помощником. Проверьте подключение и попробуйте ещё раз.');
    } finally {
      clearTimeout(timeout);
      setSending(false);
    }
  }

  const statusLabel = {
    checking: 'Проверяем настройку', gigachat: 'GigaChat настроен', unavailable: 'Помощник недоступен',
  }[status];

  return (
    <>
      <View pointerEvents="box-none" onLayout={measureDock} style={[styles.dockZone, { bottom: Math.max(insets.bottom, 12) + 71 }]}>
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
            onPress={() => { if (!dock.consumeDrag()) { setStatus('checking'); setOpen(true); } }}
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
                  <View key={`${item.role}-${index}`} style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
                    <Text style={[styles.bubbleText, item.role === 'user' && styles.userText]}>{item.content}</Text>
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
