import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { UnreadBadge } from '@/components/message-entry';
import { useMessagePolling } from '@/hooks/use-message-polling';
import { palette } from '@/lib/app-appearance';
import { formatMessageTime, inboxRefreshMs, listConversations, messageAccessProblem, type ConversationSummary } from '@/lib/messages';
import { webData } from '@/lib/web-data';

export default function MessagesScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [problem, setProblem] = useState<{ kind: 'login' | 'restricted' | 'network'; text: string } | null>(null);

  const refresh = useCallback(async (signal: AbortSignal) => {
    try {
      const result = await listConversations(signal);
      if (signal.aborted) return;
      setConversations(result.conversations);
      setProblem(null);
    } catch (error) {
      if (signal.aborted) return;
      const access = messageAccessProblem(error);
      if (access) setConversations(null);
      setProblem(access ?? { kind: 'network', text: 'Не удалось обновить сообщения. Проверьте подключение.' });
      if (access) return false;
    }
  }, []);
  const retry = useMessagePolling(refresh, inboxRefreshMs);
  const unread = conversations?.reduce((total, item) => total + item.unread, 0) ?? 0;

  return (
    <View {...webData({ hakrosFocus: 'messages' })} style={styles.page}>
      <Stack.Screen options={{ title: 'Сообщения', headerShadowVisible: false }} />
      {conversations && (
        <View style={styles.toolbar}>
          <Text style={styles.note}>{unread > 0 ? `Непрочитанных: ${unread}` : 'Личные сообщения'}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/connections')}
            style={({ pressed }) => [styles.newChat, pressed && styles.pressed]}>
            <Ionicons name="create-outline" size={19} color={palette.cream} />
            <Text style={styles.newChatText}>Написать</Text>
          </Pressable>
        </View>
      )}
      {problem && (
        <View style={styles.status}>
          <Text accessibilityRole="alert" style={styles.note}>{problem.text}</Text>
          {problem.kind !== 'restricted' && (
            <Pressable accessibilityRole="button" style={styles.newChat}
              onPress={problem.kind === 'login' ? () => router.replace({ pathname: '/login', params: { returnTo: 'messages' } }) : retry}>
              <Text style={styles.newChatText}>{problem.kind === 'login' ? 'Войти' : 'Повторить'}</Text>
            </Pressable>
          )}
        </View>
      )}
      {!conversations && !problem && <ActivityIndicator accessibilityLabel="Загрузка диалогов" color={palette.olive} style={styles.loading} />}
      {conversations && (
        <FlatList
          data={conversations}
          keyExtractor={item => item.friend.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name="chatbubbles-outline" size={31} color={palette.olive} /></View>
            <Text accessibilityRole="header" style={styles.emptyTitle}>Пока нет диалогов</Text>
            <Text style={[styles.note, styles.center]}>Нажмите «Написать» и выберите друга, чтобы начать разговор.</Text>
          </View>}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button"
              accessibilityLabel={item.unread ? `${item.friend.name}. Непрочитанных: ${item.unread}` : item.friend.name}
              onPress={() => router.push({ pathname: '/messages/[friendId]', params: { friendId: item.friend.id } })}
              style={({ pressed }) => [styles.conversation, item.unread > 0 && styles.unreadRow, pressed && styles.pressed]}>
              <View style={styles.avatar}><Text style={styles.initial}>{item.friend.name.trim().slice(0, 1).toLocaleUpperCase('ru-RU')}</Text></View>
              <View style={styles.copy}>
                <Text style={styles.name} numberOfLines={1}>{item.friend.name}</Text>
                <Text style={[styles.note, item.unread > 0 && styles.unreadText]} numberOfLines={1}>
                  {item.latest.mine ? 'Вы: ' : ''}{item.latest.body}
                </Text>
              </View>
              <View style={styles.meta}>
                <Text style={styles.time}>{formatMessageTime(item.latest.createdAt, true)}</Text>
                <UnreadBadge count={item.unread} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.cream },
  toolbar: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  newChat: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', gap: 7,
    paddingHorizontal: 13, borderRadius: 13, backgroundColor: palette.olive },
  newChatText: { color: palette.cream, fontSize: 14, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 28, gap: 8 },
  conversation: { minHeight: 78, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11,
    borderWidth: 1, borderColor: palette.border, borderRadius: 17, backgroundColor: palette.surface },
  unreadRow: { backgroundColor: '#F2F1D7' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E9CB' },
  initial: { color: palette.olive, fontWeight: '700', fontSize: 20 },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  name: { color: palette.forest, fontSize: 16, fontWeight: '700' },
  meta: { alignSelf: 'stretch', alignItems: 'flex-end', justifyContent: 'center', gap: 7 },
  time: { color: palette.muted, fontSize: 11 },
  unreadText: { color: palette.forest, fontWeight: '600' },
  note: { color: palette.muted, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  center: { textAlign: 'center', maxWidth: 260 },
  empty: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, gap: 9 },
  emptyIcon: { width: 62, height: 62, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E9CB', marginBottom: 4 },
  emptyTitle: { color: palette.forest, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  status: { margin: 16, padding: 16, borderRadius: 16, gap: 12, backgroundColor: palette.surface },
  loading: { marginTop: 36 },
  pressed: { opacity: 0.75 },
});
