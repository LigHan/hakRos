import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '@/lib/app-appearance';

export function CatalogStatus({ loading, failed, emptyMessage, onRetry, onReset }: {
  loading: boolean;
  failed: boolean;
  emptyMessage: string;
  onRetry: () => void;
  onReset?: () => void;
}) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.container}>
      {loading ? <ActivityIndicator color={palette.olive} /> : (
        <Ionicons name={failed ? 'cloud-offline-outline' : 'search-outline'} size={30} color={palette.olive} />
      )}
      <Text style={styles.message}>
        {loading ? 'Загружаем места…' : failed ? 'Не удалось загрузить места. Проверьте соединение.' : emptyMessage}
      </Text>
      {!loading && (failed || onReset) && (
        <Pressable accessibilityRole="button" onPress={failed ? onRetry : onReset} style={styles.button}>
          <Text style={styles.buttonText}>{failed ? 'Повторить' : 'Сбросить фильтры'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 32 },
  message: { fontSize: 15, lineHeight: 21, textAlign: 'center', color: palette.forest },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, backgroundColor: palette.olive },
  buttonText: { fontWeight: '700', color: palette.cream },
});
