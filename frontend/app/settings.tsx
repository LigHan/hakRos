import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { palette, useAppearance, useAppStyles, type AppearanceMode } from '@/lib/app-appearance';
import { authorized } from '@/lib/statistics';
import { clearUserSession, getUserSession, type UserSession } from '@/lib/user-session';
import { getAccountProfile, updateAccountProfile } from '@/lib/account-profile';

export default function SettingsScreen() {
  const { mode, ready, setMode } = useAppearance();
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [avatarBase64, setAvatarBase64] = useState<string>();
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [isPrivate, setIsPrivate] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [profileSaving, setProfileSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const current = await getUserSession();
        if (controller.signal.aborted) return;
        setSession(current);
        if (!current || current.role === 'admin') return;
        const profile = await getAccountProfile(controller.signal);
        if (controller.signal.aborted) return;
        setBio(profile.bio); setAvatar(profile.avatar); setIsPrivate(profile.isPrivate);
        setProfileLoaded(true);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить профиль');
      } finally {
        if (!controller.signal.aborted) setProfileLoading(false);
      }
    })();
    return () => controller.abort();
  }, [profileAttempt]);

  const chooseAvatar = async () => {
    setError(''); setNotice('');
    try {
      const result = await launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] });
      if (result.canceled) return;
      const context = ImageManipulator.manipulate(result.assets[0].uri, { maxWidth: 512, maxHeight: 512 });
      try {
        const rendered = await context.renderAsync();
        try {
          const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
          if (!image.base64 || image.base64.length > Math.ceil(1024 * 1024 / 3) * 4) throw new Error('Выберите фото размером до 1 МБ после обработки');
          setAvatarBase64(image.base64); setRemoveAvatar(false); setAvatar('data:image/jpeg;base64,' + image.base64);
          if (Platform.OS === 'web') URL.revokeObjectURL(image.uri);
        } finally { rendered.release(); }
      } finally {
        context.release();
        if (Platform.OS === 'web') URL.revokeObjectURL(result.assets[0].uri);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выбрать фото'); }
  };

  const saveProfile = async () => {
    setProfileSaving(true); setError(''); setNotice('');
    try {
      const profile = await updateAccountProfile({ bio, ...(session?.role === 'user' ? { isPrivate } : {}), ...(avatarBase64 ? { avatarBase64 } : {}), ...(removeAvatar ? { removeAvatar: true } : {}) });
      setBio(profile.bio); setAvatar(profile.avatar); setIsPrivate(profile.isPrivate);
      setAvatarBase64(undefined); setRemoveAvatar(false); setNotice('Профиль сохранён');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить профиль'); }
    finally { setProfileSaving(false); }
  };

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
      <Text style={styles.title}>Настройки</Text>
      {session && session.role !== 'admin' && <View style={styles.profileEditor}>
        <Text style={styles.accountHeading}>Профиль</Text>
        {profileLoading ? <ActivityIndicator color={palette.olive} /> : !profileLoaded ? <Pressable accessibilityRole="button" onPress={() => { setError(''); setProfileLoading(true); setProfileLoaded(false); setProfileAttempt(value => value + 1); }} style={styles.smallButton}><Text style={styles.smallButtonText}>Загрузить профиль ещё раз</Text></Pressable> : <>
          <View style={styles.avatarRow}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.avatar} /> : <View style={styles.avatarEmpty}><Ionicons name="person-outline" size={32} color={palette.olive} /></View>}
            <View style={styles.avatarActions}>
              <Pressable accessibilityRole="button" disabled={profileSaving} onPress={() => void chooseAvatar()} style={styles.smallButton}><Text style={styles.smallButtonText}>Изменить аватарку</Text></Pressable>
              {!!avatar && <Pressable accessibilityRole="button" disabled={profileSaving} onPress={() => { setAvatar(''); setAvatarBase64(undefined); setRemoveAvatar(true); setNotice(''); }}><Text style={styles.removeText}>Убрать фото</Text></Pressable>}
            </View>
          </View>
          <Text style={styles.fieldLabel}>Био</Text>
          <TextInput accessibilityLabel="Био" placeholder="Расскажите о себе" placeholderTextColor={palette.muted} multiline maxLength={500} value={bio} onChangeText={value => { setBio(value); setNotice(''); }} editable={!profileSaving} style={styles.bioInput} />
          <Text style={styles.counter}>{bio.length}/500</Text>
          {session.role === 'user' && <View style={styles.privacyRow}>
            <View style={styles.privacyCopy}><Text style={styles.fieldLabel}>Приватный профиль</Text><Text style={styles.optionDescription}>Публикации, истории и био видны только вам и подтверждённым друзьям. Имя и фото, сохранённое в настройках, видны и в приватном профиле.</Text></View>
            <Switch accessibilityLabel="Приватный профиль" value={isPrivate} disabled={profileSaving} onValueChange={value => { setIsPrivate(value); setNotice(''); }} trackColor={{ true: palette.olive, false: palette.border }} />
          </View>}
          <Pressable accessibilityRole="button" disabled={profileSaving} onPress={() => void saveProfile()} style={[styles.saveButton, profileSaving && styles.disabled]}>{profileSaving ? <ActivityIndicator color={palette.cream} /> : <Text style={styles.saveButtonText}>Сохранить профиль</Text>}</Pressable>
          {!!notice && <Text accessibilityRole="alert" style={styles.success}>{notice}</Text>}
        </>}
      </View>}
      <Text style={styles.accountHeading}>Оформление</Text>
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
  content: { padding: 24, paddingTop: 36, paddingBottom: 150 },
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
  profileEditor: { marginTop: 28, marginBottom: 32, gap: 10 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 },
  avatar: { width: 78, height: 78, borderRadius: 39 },
  avatarEmpty: { width: 78, height: 78, borderRadius: 39, backgroundColor: '#F0ECCD', alignItems: 'center', justifyContent: 'center' },
  avatarActions: { flex: 1, gap: 12 },
  smallButton: { alignSelf: 'flex-start', paddingVertical: 9 },
  smallButtonText: { fontSize: 15, fontWeight: '700', color: palette.olive },
  removeText: { color: palette.terracotta, fontSize: 13 },
  fieldLabel: { color: palette.forest, fontSize: 16, fontWeight: '700' },
  bioInput: { color: palette.forest, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 15, padding: 14, minHeight: 100, textAlignVertical: 'top', fontSize: 16, lineHeight: 23 },
  counter: { textAlign: 'right', color: palette.muted, fontSize: 12 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 10 },
  privacyCopy: { flex: 1, gap: 7 },
  saveButton: { backgroundColor: palette.olive, padding: 15, borderRadius: 16, alignItems: 'center', minHeight: 50 },
  saveButtonText: { color: palette.cream, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  success: { color: palette.olive, fontSize: 14 },
});
