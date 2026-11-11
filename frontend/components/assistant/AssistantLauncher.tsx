import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Status = 'checking' | 'mock' | 'gigachat' | 'unavailable';

const API_BASE = process.env.EXPO_PUBLIC_ASSISTANT_URL?.trim().replace(/\/+$/, '') ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001');

const opening: ChatMessage = {
  role: 'assistant',
  content: 'Привет! Помогу придумать, чем заняться после пар. Сколько у тебя времени и какой бюджет?',
};

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
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('checking');
  const [messages, setMessages] = useState<ChatMessage[]>([opening]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`${API_BASE}/api/assistant/health`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('unavailable');
        const body = await response.json();
        setStatus(body.configured && (body.mode === 'mock' || body.mode === 'gigachat') ? body.mode : 'unavailable');
      })
      .catch(() => { if (!controller.signal.aborted) setStatus('unavailable'); });
    return () => controller.abort();
  }, [open]);

  async function send() {
    const message = draft.trim();
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
      if (data.mode === 'mock' || data.mode === 'gigachat') setStatus(data.mode);
    } catch {
      setError('Не удалось связаться с помощником. Проверьте подключение и попробуйте ещё раз.');
    } finally {
      clearTimeout(timeout);
      setSending(false);
    }
  }

  const statusLabel = {
    checking: 'Проверяем подключение', mock: 'Тестовый режим', gigachat: 'Режим GigaChat', unavailable: 'Нет подключения',
  }[status];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Открыть помощника"
        accessibilityHint="Открывает чат для идей досуга"
        onPress={() => { setStatus('checking'); setOpen(true); }}
        style={({ pressed }) => [styles.launcher, pressed && styles.pressed]}>
        <MascotIcon />
        <View style={styles.launcherText}>
          <Text style={styles.launcherTitle}>Нужна идея?</Text>
          <Text style={styles.launcherSubtitle}>Спроси помощника</Text>
        </View>
        <Ionicons name="arrow-forward" size={18} color="#f8f5e8" />
      </Pressable>

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
                {status === 'mock' && <Text style={styles.notice}>Это демо: ответы подготовлены заранее, поиск мест пока не подключён.</Text>}
                {messages.map((item, index) => (
                  <View key={`${item.role}-${index}`} style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
                    <Text style={[styles.bubbleText, item.role === 'user' && styles.userText]}>{item.content}</Text>
                  </View>
                ))}
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
                  onSubmitEditing={send}
                  style={styles.input}
                />
                <Pressable accessibilityRole="button" accessibilityLabel="Отправить сообщение" disabled={sending || !draft.trim()} onPress={send} style={[styles.send, (sending || !draft.trim()) && styles.disabled]}>
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
  launcher: { position: 'absolute', right: 16, bottom: 92, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#303c1f', borderRadius: 18, padding: 7, paddingRight: 14, elevation: 6, shadowColor: '#1c2514', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  pressed: { opacity: 0.85 },
  launcherText: { gap: 2 },
  launcherTitle: { color: '#fffdf4', fontWeight: '700', fontSize: 13 },
  launcherSubtitle: { color: '#d5ddbc', fontSize: 11 },
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
  loading: { alignSelf: 'flex-start', marginLeft: 12 },
  error: { color: '#a04535', fontSize: 12, lineHeight: 17 },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, paddingTop: 10 },
  input: { flex: 1, minWidth: 0, height: 48, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7d8', borderRadius: 16, paddingHorizontal: 14, color: '#27321e', fontSize: 13 },
  send: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#64713d' },
  disabled: { opacity: 0.45 },
  footer: { color: '#929984', textAlign: 'center', fontSize: 10, paddingVertical: 9 },
});
