import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { palette, useAppStyles } from '@/lib/app-appearance';
import { getUserSession, type UserSession } from '@/lib/user-session';

type Kind = 'post' | 'story';

export default function CreateScreen() {
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind: Kind = params.kind === 'story' ? 'story' : 'post';
  const [session, setSession] = useState<UserSession | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const user = await getUserSession();
        if (!active) return;
        setSession(user);
        if (user) {
          const draft = await AsyncStorage.getItem(`@hakros/draft/${user.id}/${kind}`);
          if (active) setText(draft ?? '');
        }
      } catch {
        if (active) setError('Не удалось загрузить черновик.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [kind]);

  const save = async () => {
    if (!session || !text.trim() || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await AsyncStorage.setItem(`@hakros/draft/${session.id}/${kind}`, text);
      setMessage('Черновик сохранён на этом устройстве.');
    } catch {
      setError('Не удалось сохранить черновик. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: kind === 'post' ? 'Новая публикация' : 'Новая история', headerStyle: { backgroundColor: palette.cream }, headerTintColor: palette.forest }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loading ? <ActivityIndicator color={palette.olive} /> : !session ? (
          <View style={styles.card}><Ionicons name="person-circle-outline" size={42} color={palette.olive} /><Text style={styles.title}>Сначала войдите</Text><Text style={styles.description}>Для черновиков нужен ваш аккаунт.</Text><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/login', params: { returnTo: kind } })} style={styles.button}><Text style={styles.buttonText}>Войти</Text></Pressable></View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>ЧЕРНОВИК</Text>
            <Text style={styles.title}>{kind === 'post' ? 'Чем хотите поделиться?' : 'Какой у вас момент?'}</Text>
            <Text style={styles.description}>Публикация пока недоступна. Можно сохранить текст черновика на этом устройстве.</Text>
            <TextInput accessibilityLabel="Текст черновика" multiline maxLength={kind === 'story' ? 280 : 2000} placeholder="Напишите здесь..." placeholderTextColor={palette.muted} value={text} onChangeText={value => { setText(value); setMessage(''); }} style={styles.input} />
            <Text style={styles.counter}>{text.length} / {kind === 'story' ? 280 : 2000}</Text>
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            {!!message && <Text accessibilityRole="alert" style={styles.success}>{message}</Text>}
            <Pressable accessibilityRole="button" disabled={!text.trim() || saving} onPress={() => void save()} style={[styles.button, (!text.trim() || saving) && styles.disabled]}><Text style={styles.buttonText}>{saving ? 'Сохраняем...' : 'Сохранить черновик'}</Text></Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const baseStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.cream },
  content: { padding: 20, paddingTop: 34 },
  card: { backgroundColor: palette.surface, borderRadius: 24, borderColor: palette.border, borderWidth: 1, padding: 22, gap: 12 },
  eyebrow: { color: palette.terracotta, fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  title: { color: palette.forest, fontWeight: '800', fontSize: 24 },
  description: { color: palette.muted, lineHeight: 21 },
  input: { minHeight: 150, borderWidth: 1, borderColor: palette.border, borderRadius: 16, padding: 14, color: palette.forest, backgroundColor: palette.cream, textAlignVertical: 'top' },
  counter: { color: palette.muted, fontSize: 12, textAlign: 'right' },
  button: { backgroundColor: palette.olive, padding: 14, borderRadius: 16, alignItems: 'center' },
  buttonText: { color: palette.cream, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  error: { color: '#A23524' },
  success: { color: palette.olive },
});
