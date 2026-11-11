import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { palette, useAppearance, useAppStyles, type AppearanceMode } from '@/lib/app-appearance';
import { authorized } from '@/lib/statistics';
import { clearUserSession, getUserSession, type UserSession } from '@/lib/user-session';

export default function SettingsScreen() {
  const { mode, ready, setMode } = useAppearance();
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { void getUserSession().then(setSession); }, []);

  const logout = async () => {
    await authorized('/api/logout', { method: 'POST' }).catch(() => {});
    await clearUserSession();
    router.replace('/login');
  };

  const chooseMode = async (next: AppearanceMode) => {
    if (!ready || saving || mode === next) return;
    setSaving(true);
    setError('');
    try {
      await setMode(next);
    } catch {
      setError('Не удалось сохранить оформление. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      {mode === 'sketch' && <Image source={require('@/assets/images/mascot-sketch.png')} style={styles.mascot} accessibilityLabel="Маскот приложения" />}
      <Text style={styles.eyebrow}>ВАШЕ ПРОСТРАНСТВО</Text>
      <Text style={styles.title}>Оформление</Text>
      <Text style={styles.description}>Выберите настроение приложения. Настройка сохранится на этом устройстве.</Text>
      <View style={styles.options}>
        {([
          { value: 'classic', title: 'Сдержанный', description: 'Спокойные цвета и чистые линии.', icon: 'sparkles-outline' },
          { value: 'sketch', title: 'Рисованный', description: 'Живые контуры и детали, как в скетчбуке.', icon: 'brush-outline' },
        ] as const).map(option => {
          const selected = mode === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !ready || saving }}
              disabled={!ready || saving}
              onPress={() => void chooseMode(option.value)}
              style={[styles.option, selected && styles.optionSelected, option.value === 'sketch' && styles.optionSketch]}
            >
              <View style={styles.icon}><Ionicons name={option.icon} size={24} color={palette.olive} /></View>
              <View style={styles.optionCopy}><Text style={styles.optionTitle}>{option.title}</Text><Text style={styles.optionDescription}>{option.description}</Text></View>
              <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={23} color={selected ? palette.olive : palette.muted} />
            </Pressable>
          );
        })}
      </View>
      {(!ready || saving) && <ActivityIndicator color={palette.olive} style={styles.loader} />}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {session && <View style={styles.accountSection}>
        <Text style={styles.accountHeading}>Аккаунт</Text>
        {session.role === 'user' && <SettingsLink icon="people-outline" title="Друзья" onPress={() => router.push('/connections')} />}
        <SettingsLink icon="bookmark-outline" title="Места и подписки" onPress={() => router.push('/collections')} />
        <SettingsLink icon="bar-chart-outline" title="Статистика" onPress={() => router.push('/statistics')} />
        {Platform.OS === 'web' && session.role === 'admin' && <SettingsLink icon="shield-checkmark-outline" title="Панель администратора" onPress={() => router.push('/admin')} />}
        <SettingsLink icon="log-out-outline" title="Выйти из аккаунта" onPress={() => void logout()} />
      </View>}
    </ScrollView>
  );
}

function SettingsLink({ icon, title, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={baseStyles.accountRow}><Ionicons name={icon} size={21} color={palette.olive} /><Text style={baseStyles.accountText}>{title}</Text><Ionicons name="chevron-forward" size={18} color={palette.muted} /></Pressable>;
}

const baseStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.cream },
  content: { padding: 24, paddingTop: 36, paddingBottom: 80 },
  eyebrow: { color: palette.terracotta, fontSize: 11, letterSpacing: 1.4, fontWeight: '700' },
  title: { color: palette.forest, fontSize: 32, fontWeight: '800', marginTop: 10 },
  description: { color: palette.muted, fontSize: 15, lineHeight: 23, marginTop: 9, maxWidth: 340 },
  options: { gap: 12, marginTop: 28 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  optionSelected: { borderWidth: 2, borderColor: palette.olive },
  optionSketch: { borderTopLeftRadius: 13, borderBottomRightRadius: 24 },
  icon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#F0ECCD' },
  optionCopy: { flex: 1, gap: 4 },
  optionTitle: { color: palette.forest, fontSize: 17, fontWeight: '700' },
  optionDescription: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  mascot: { width: 112, height: 112, alignSelf: 'flex-end', marginBottom: -45, resizeMode: 'contain' },
  loader: { marginTop: 18 },
  error: { marginTop: 18, color: '#A23524' },
  accountSection: { marginTop: 36 },
  accountHeading: { color: palette.forest, fontWeight: '700', fontSize: 20, marginBottom: 8 },
  accountRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  accountText: { flex: 1, color: palette.forest, fontWeight: '600', fontSize: 15 },
});
