import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useMessagePolling } from '@/hooks/use-message-polling';
import { palette } from '@/lib/app-appearance';
import { getUnreadMessages, inboxRefreshMs, messageAccessProblem } from '@/lib/messages';
import { webData } from '@/lib/web-data';

export function UnreadBadge({ count }: { count: number }) {
  if (count < 1) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

export function MessagesBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  useMessagePolling(useCallback(async signal => {
    try {
      const result = await getUnreadMessages(signal);
      if (!signal.aborted) setUnread(result.unread);
    } catch (error) {
      if (!signal.aborted && messageAccessProblem(error)) {
        setUnread(0);
        return false;
      }
    }
  }, []), inboxRefreshMs);

  return (
    <View {...webData({ hakrosFocus: 'messages-bell' })} style={styles.bellWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={unread ? `Сообщения. Непрочитанных: ${unread}` : 'Сообщения'}
        onPress={() => router.push('/messages')}
        style={({ pressed }) => [styles.bell, pressed && styles.pressed]}>
        <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={24} color={palette.forest} />
        {unread > 0 && <View pointerEvents="none" style={styles.bellBadge}><UnreadBadge count={unread} /></View>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bellWrap: { alignSelf: 'flex-start', paddingTop: 2 },
  bell: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  bellBadge: { position: 'absolute', top: -5, right: -5, borderWidth: 2, borderColor: palette.cream, borderRadius: 20 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center', backgroundColor: '#A82F37' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 14, fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.7 },
});
