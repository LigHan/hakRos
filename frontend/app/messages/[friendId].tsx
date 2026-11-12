import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMessagePolling } from '@/hooks/use-message-polling';
import { palette } from '@/lib/app-appearance';
import type { Person } from '@/lib/connections';
import {
  chatRefreshMs, formatMessageTime, getMessagePage, markMessagesRead, maxMessageLength,
  messageAccessProblem, sendFriendMessage, type FriendMessage,
} from '@/lib/messages';
import { webData } from '@/lib/web-data';

type Thread = { friend: Person; messages: FriendMessage[]; hasOlder: boolean };
type Problem = { kind: 'login' | 'restricted' | 'network'; text: string };

function mergeMessages(current: FriendMessage[], incoming: FriendMessage[]) {
  if (!incoming.length) return current;
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export default function ConversationScreen() {
  const { friendId } = useLocalSearchParams<{ friendId: string }>();
  return <Conversation key={friendId} friendId={friendId} />;
}

function Conversation({ friendId }: { friendId: string }) {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const { bottom } = useSafeAreaInsets();
  const [thread, setThread] = useState<Thread | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [olderError, setOlderError] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const list = useRef<FlatList<FriendMessage>>(null);
  const followingEnd = useRef(true);
  const fetchedThrough = useRef(0);
  const receivedThrough = useRef(0);
  const markedThrough = useRef(0);
  const sendRequest = useRef<AbortController | null>(null);
  const olderRequest = useRef<AbortController | null>(null);
  const pending = useRef<{ body: string; requestId: string } | null>(null);

  useEffect(() => () => {
    sendRequest.current?.abort();
    olderRequest.current?.abort();
  }, []);

  const handleAccessProblem = useCallback((error: unknown) => {
    const access = messageAccessProblem(error);
    if (!access) return false;
    setThread(null);
    setProblem(access);
    return true;
  }, []);

  const refresh = useCallback(async (signal: AbortSignal) => {
    try {
      const after = fetchedThrough.current;
      const page = await getMessagePage(friendId, after ? { after } : null, signal);
      if (signal.aborted) return;
      fetchedThrough.current = page.messages.at(-1)?.id ?? after;
      receivedThrough.current = page.messages.findLast(message => !message.mine)?.id ?? receivedThrough.current;
      setThread(current => ({
        friend: page.friend,
        messages: mergeMessages(current?.messages ?? [], page.messages),
        hasOlder: after ? current?.hasOlder ?? false : page.hasMore,
      }));
      setProblem(null);
      const through = receivedThrough.current;
      if (through > markedThrough.current) {
        await markMessagesRead(friendId, through, signal);
        if (!signal.aborted) markedThrough.current = through;
      }
    } catch (error) {
      if (signal.aborted) return;
      if (handleAccessProblem(error)) return false;
      setProblem({ kind: 'network', text: 'Не удалось обновить диалог. Проверьте подключение.' });
    }
  }, [friendId, handleAccessProblem]);
  const retry = useMessagePolling(refresh, chatRefreshMs);

  async function loadOlder() {
    const before = thread?.messages[0]?.id;
    if (!before || olderRequest.current) return;
    const controller = new AbortController();
    olderRequest.current = controller;
    followingEnd.current = false;
    setLoadingOlder(true);
    setOlderError('');
    try {
      const page = await getMessagePage(friendId, { before }, controller.signal);
      if (!controller.signal.aborted) setThread(current => current && ({
        ...current, messages: mergeMessages(current.messages, page.messages), hasOlder: page.hasMore,
      }));
    } catch (error) {
      if (!controller.signal.aborted && !handleAccessProblem(error)) {
        setOlderError('Не удалось загрузить предыдущие сообщения.');
      }
    } finally {
      olderRequest.current = null;
      if (!controller.signal.aborted) setLoadingOlder(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!thread || !body || sendRequest.current) return;
    const controller = new AbortController();
    sendRequest.current = controller;
    const requestId = pending.current?.body === body
      ? pending.current.requestId
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    pending.current = { body, requestId };
    setSending(true);
    setSendError('');
    try {
      const message = await sendFriendMessage(friendId, body, requestId, controller.signal);
      if (controller.signal.aborted) return;
      pending.current = null;
      followingEnd.current = true;
      setThread(current => current && ({ ...current, messages: mergeMessages(current.messages, [message]) }));
      setDraft('');
    } catch (error) {
      if (!controller.signal.aborted && !handleAccessProblem(error)) {
        setSendError('Не удалось отправить. Нажмите ещё раз, чтобы повторить.');
      }
    } finally {
      sendRequest.current = null;
      if (!controller.signal.aborted) setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView {...webData({ hakrosFocus: 'conversation' })} style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
      <Stack.Screen options={{ title: thread?.friend.name || 'Диалог', headerShadowVisible: false }} />
      {problem && (
        <View style={styles.status}>
          <Text accessibilityRole="alert" style={styles.hint}>{problem.text}</Text>
          {problem.kind !== 'restricted' && (
            <Pressable accessibilityRole="button" style={styles.textButton}
              onPress={problem.kind === 'login' ? () => router.replace({ pathname: '/login', params: { returnTo: 'messages' } }) : retry}>
              <Text style={styles.link}>{problem.kind === 'login' ? 'Войти' : 'Повторить'}</Text>
            </Pressable>
          )}
        </View>
      )}
      {!thread && !problem && <ActivityIndicator accessibilityLabel="Загрузка диалога" color={palette.olive} style={styles.loading} />}
      {thread && (
        <>
          <FlatList
            ref={list}
            style={styles.list}
            contentContainerStyle={styles.history}
            data={thread.messages}
            keyExtractor={item => String(item.id)}
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
            onScroll={({ nativeEvent: { contentSize, contentOffset, layoutMeasurement } }) => {
              followingEnd.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 64;
            }}
            scrollEventThrottle={32}
            onContentSizeChange={() => {
              if (followingEnd.current) list.current?.scrollToEnd({ animated: false });
            }}
            ListHeaderComponent={thread.hasOlder ? (
              <View style={styles.older}>
                {olderError ? <Text accessibilityRole="alert" style={styles.hint}>{olderError}</Text> : null}
                <Pressable accessibilityRole="button" disabled={loadingOlder} style={styles.textButton} onPress={() => void loadOlder()}>
                  <Text style={styles.link}>{loadingOlder ? 'Загружаем…' : 'Предыдущие сообщения'}</Text>
                </Pressable>
              </View>
            ) : undefined}
            ListEmptyComponent={<View style={styles.empty}>
              <Ionicons name="chatbubble-ellipses-outline" size={32} color={palette.olive} />
              <Text style={styles.hint}>Начните разговор. Ваше сообщение увидит только этот друг.</Text>
            </View>}
            renderItem={({ item, index }) => {
              const date = new Date(item.createdAt);
              const previous = thread.messages[index - 1];
              const newDay = !previous || new Date(previous.createdAt).toDateString() !== date.toDateString();
              return (
                <View style={styles.messageRow}>
                  {newDay && <Text style={styles.date}>{date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>}
                  <View style={[styles.bubble, item.mine ? styles.mine : styles.theirs]}>
                    <Text selectable style={[styles.body, item.mine && styles.myText]}>{item.body}</Text>
                    <Text style={[styles.time, item.mine && styles.myText]}>{formatMessageTime(item.createdAt)}</Text>
                  </View>
                </View>
              );
            }}
          />
          <View style={[styles.composer, { paddingBottom: Math.max(10, bottom) }]}>
            {!!sendError && <Text accessibilityRole="alert" style={styles.error}>{sendError}</Text>}
            <View style={styles.composeRow}>
              <TextInput
                accessibilityLabel="Сообщение другу"
                placeholder="Сообщение"
                placeholderTextColor={palette.muted}
                maxLength={maxMessageLength}
                multiline
                editable={!sending}
                value={draft}
                onChangeText={value => { setDraft(value); setSendError(''); }}
                style={styles.input}
              />
              <Pressable accessibilityRole="button" accessibilityLabel={sendError ? 'Повторить отправку' : 'Отправить сообщение'}
                accessibilityState={{ busy: sending, disabled: sending || !draft.trim() }}
                disabled={sending || !draft.trim()} onPress={() => void send()}
                style={({ pressed }) => [styles.send, (sending || !draft.trim()) && styles.disabled, pressed && styles.pressed]}>
                {sending ? <ActivityIndicator size="small" color={palette.cream} /> : <Ionicons name="arrow-up" size={24} color={palette.cream} />}
              </Pressable>
            </View>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.cream },
  list: { flex: 1, minHeight: 0 },
  history: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: 14 },
  messageRow: { marginBottom: 8 },
  date: { alignSelf: 'center', color: palette.muted, fontSize: 12, marginTop: 8, marginBottom: 12 },
  bubble: { maxWidth: '85%', minWidth: 76, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 17, gap: 5 },
  mine: { alignSelf: 'flex-end', backgroundColor: palette.olive, borderBottomRightRadius: 5 },
  theirs: { alignSelf: 'flex-start', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderBottomLeftRadius: 5 },
  body: { color: palette.forest, fontSize: 15, lineHeight: 21 },
  time: { alignSelf: 'flex-end', color: palette.muted, fontSize: 11, lineHeight: 15 },
  myText: { color: palette.cream },
  composer: { paddingHorizontal: 12, paddingTop: 10, gap: 6, borderTopWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  composeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minWidth: 0, minHeight: 46, maxHeight: 118, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: palette.border,
    borderRadius: 15, fontSize: 16, lineHeight: 22, textAlignVertical: 'center', backgroundColor: palette.cream, color: palette.forest },
  send: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.olive },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  older: { alignItems: 'center', paddingVertical: 4 },
  textButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#EBEACD' },
  link: { color: palette.forest, fontSize: 13, fontWeight: '700' },
  status: { margin: 12, padding: 12, gap: 8, borderRadius: 14, backgroundColor: palette.surface },
  hint: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  error: { color: '#A23524', fontSize: 13, lineHeight: 18 },
  empty: { alignItems: 'center', paddingTop: 44, paddingHorizontal: 25, gap: 12 },
  loading: { marginTop: 36 },
});
