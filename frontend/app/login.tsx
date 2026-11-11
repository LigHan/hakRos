import { useAppStyles, useAppearance } from '@/lib/app-appearance';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { resolveAvatarUrl } from '@/lib/account-profile';
import { api } from '@/lib/statistics';
import { setUserSession, type UserSession } from '@/lib/user-session';

const THEME = {
  primary: '#606C38',
  accent: '#283618',
  muted: '#6F7457',
  surface: '#ffffff',
  border: 'rgba(226,232,240,0.8)',
  backdrop: '#f4f6fb',
};

export default function AuthScreen() {
  const styles = useAppStyles(baseStyles);
  const { mode: appearanceMode } = useAppearance();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [accountType, setAccountType] = useState<'user' | 'company'>('user');
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const isRegister = mode === 'register';
  const isCompany = accountType === 'company';

  const canSubmit =
    email.trim().length > 0 &&
    password.trim().length > 0 &&
    (!isRegister || (isCompany ? companyName.trim().length > 0 : name.trim().length > 0));

  const handleSubmit = async () => {
    if (!canSubmit) {
      Alert.alert('Пожалуйста, заполните все поля', 'Укажите почту, пароль и имя, чтобы продолжить.');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    setAuthError('');

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (isRegister) {
        await api('/register', { method: 'POST', body: JSON.stringify({ email: normalizedEmail, name: isCompany ? companyName.trim() : name.trim(), password, role: accountType }) });
      }
      const result = await api('/login', { method: 'POST', body: JSON.stringify({ email: normalizedEmail, password }) });
      const user = result.user;
      const session: UserSession = {
        id: String(user.id), token: result.token, name: user.name, email: user.email,
        handle: user.handle, avatar: resolveAvatarUrl(user.avatar), accountType: user.role === 'company' ? 'company' : 'user',
        favorites: [], liked: [], following: [], surname: user.surname ?? null, role: user.role,
      };
      await setUserSession(session);
      // Сервер определяет роль; администратору открываем отдельную панель.
      if (user.role === 'admin' && Platform.OS === 'web') {
        router.replace('/admin');
      } else if (returnTo === 'post' || returnTo === 'story') {
        router.replace({ pathname: '/create', params: { kind: returnTo } });
      } else {
        router.replace('/');
      }
    } catch (error) {
      console.error('❌ Ошибка при создании сессии:', error);
      setAuthError(error instanceof Error ? error.message : 'Не удалось войти в систему.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: mode === 'login' ? 'Вход в аккаунт' : 'Создать аккаунт',
          headerTransparent: true,
          headerTintColor: THEME.accent,
          headerBackTitle: 'Назад',
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.avatarWrapper}>
                {appearanceMode === 'sketch' ? <Image source={require('@/assets/images/mascot-sketch.png')} style={{ width: 70, height: 70 }} resizeMode="contain" accessibilityLabel="Маскот приложения" /> : <Ionicons name="person-circle" size={48} color={THEME.primary} />}
              </View>
              <Text style={styles.title}>{isRegister ? 'Добро пожаловать!' : 'С возвращением!'}</Text>
              <Text style={styles.subtitle}>
                {isRegister
                  ? 'Создайте аккаунт и собирайте любимые места города.'
                  : 'Войдите, чтобы сохранять маршруты и делиться впечатлениями.'}
              </Text>
            </View>

            {isRegister && <View style={styles.accountTypeWrapper}>
              <Text style={styles.accountTypeLabel}>
                {isRegister ? 'Тип аккаунта' : 'Войти как'}
              </Text>
              <View style={styles.accountTypeRow}>
                <TouchableOpacity
                  style={[styles.accountTypeChip, accountType === 'user' && styles.accountTypeChipActive]}
                  onPress={() => setAccountType('user')}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={accountType === 'user' ? 'person' : 'person-outline'}
                    size={16}
                    color={accountType === 'user' ? '#fff' : THEME.accent}
                  />
                  <Text
                    style={[
                      styles.accountTypeText,
                      accountType === 'user' && styles.accountTypeTextActive,
                    ]}
                  >
                    Пользователь
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.accountTypeChip, accountType === 'company' && styles.accountTypeChipActive]}
                  onPress={() => setAccountType('company')}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={accountType === 'company' ? 'business' : 'business-outline'}
                    size={16}
                    color={accountType === 'company' ? '#fff' : THEME.accent}
                  />
                  <Text
                    style={[
                      styles.accountTypeText,
                      accountType === 'company' && styles.accountTypeTextActive,
                    ]}
                  >
                    Компания
                  </Text>
                </TouchableOpacity>
              </View>
            </View>}

            {isRegister && !isCompany && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Ваше имя</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Например, Анна Петрова"
                  style={styles.input}
                  placeholderTextColor={THEME.muted}
                />
              </View>
            )}

            {isRegister && isCompany && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Имя организации</Text>
                <TextInput
                  value={companyName}
                  onChangeText={setCompanyName}
                  placeholder="Например, Gorky Park"
                  style={styles.input}
                  placeholderTextColor={THEME.muted}
                />
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="hello@company.ru"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                placeholderTextColor={THEME.muted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Пароль</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Введите пароль"
                secureTextEntry
                style={styles.input}
                placeholderTextColor={THEME.muted}
              />
            </View>

            {authError ? <Text accessibilityRole="alert" style={{ color: '#b42318', marginBottom: 12 }}>{authError}</Text> : null}
            {!isRegister && (
              <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/modal')}>
                <Ionicons name="help-circle-outline" size={18} color={THEME.primary} />
                <Text style={styles.linkText}>Забыли пароль?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.primaryButton, (!canSubmit || loading) && styles.primaryButtonDisabled]}
              activeOpacity={0.85}
              onPress={handleSubmit}
              disabled={!canSubmit || loading}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? 'Загрузка...' : (isRegister ? 'Зарегистрироваться' : 'Войти')}
              </Text>
            </TouchableOpacity>

            <View style={styles.separator}>
              <View style={styles.line} />
              <Text style={styles.separatorText}>или</Text>
              <View style={styles.line} />
            </View>

            <View style={styles.socialRow}>
              <Pressable style={styles.socialButton}>
                <View style={styles.socialIcon}>
                  <Text style={styles.socialLetter}>Я</Text>
                </View>
                <Text style={styles.socialText}>Yandex</Text>
              </Pressable>
              <Pressable style={styles.socialButton}>
                <Ionicons name="logo-vk" size={20} color={THEME.accent} />
                <Text style={styles.socialText}>VK</Text>
              </Pressable>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                {isRegister ? 'Уже есть аккаунт?' : 'Нет аккаунта?'}
              </Text>
              <TouchableOpacity onPress={() => setMode(isRegister ? 'login' : 'register')}>
                <Text style={styles.switchLink}>{isRegister ? 'Войти' : 'Зарегистрироваться'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const baseStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f2f4fa',
  },
  scroll: {
    flexGrow: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: THEME.surface,
    borderRadius: 28,
    padding: 28,
    gap: 20,
    shadowColor: '#283618',
    shadowOpacity: 0.08,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 20 },
    elevation: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  header: {
    alignItems: 'center',
    gap: 12,
  },
  avatarWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: THEME.accent,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: THEME.muted,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fbfcff',
    fontSize: 15,
    color: THEME.accent,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.primary,
  },
  primaryButton: {
    backgroundColor: THEME.primary,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#606C38',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: THEME.border,
  },
  separatorText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.muted,
    textTransform: 'uppercase',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8fbff',
    justifyContent: 'center',
  },
  socialText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.accent,
    textAlign: 'center',
  },
  socialIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.18)',
  },
  socialLetter: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.accent,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  switchLabel: {
    fontSize: 14,
    color: THEME.muted,
  },
  switchLink: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.primary,
  },
  accountTypeRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderRadius: 20,
    padding: 6,
  },
  accountTypeWrapper: {
    gap: 8,
  },
  accountTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: THEME.accent,
    textTransform: 'uppercase',
  },
  accountTypeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 16,
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  accountTypeChipActive: {
    backgroundColor: THEME.primary,
  },
  accountTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.accent,
  },
  accountTypeTextActive: {
    color: '#fff',
  },
});

