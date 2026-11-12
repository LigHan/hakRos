import { DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Ionicons } from '@expo/vector-icons';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import 'react-native-reanimated';
import '../styles/scrollbars.css';
import '../styles/interactive.css';
import '../styles/web-workspace.css';

import { AppearanceProvider, palette, useAppStyles } from '@/lib/app-appearance';
import { FloatingNavigation } from '@/components/floating-navigation';
import { PlaceDetails } from '@/components/place-details';
import { SocialPost } from '@/app/post/[id]';
import { PostPreviewContext, type PostPreview } from '@/lib/web-post-preview';
import { webData } from '@/lib/web-data';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return <AppearanceProvider><AppLayout /></AppearanceProvider>;
}

function BackButton() {
  const router = useRouter();
  return <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={baseStyles.backButton}><Ionicons name="arrow-back" size={24} color={palette.forest} /></Pressable>;
}

function AppLayout() {
  const styles = useAppStyles(baseStyles);
  const isWeb = Platform.OS === 'web';
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const compactWeb = isWeb && width < 520;
  // Админ-панель веба занимает весь экран, пользовательские экраны сохраняют прежний размер.
  const isWebAdmin = isWeb && pathname === '/admin';
  const canPreview = isWeb && width >= 800 && !compactWeb && !isWebAdmin && pathname !== '/map';
  const [preview, setPreview] = useState<PostPreview | null>(null);
  const [displayedPreview, setDisplayedPreview] = useState<PostPreview | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [previewPath, setPreviewPath] = useState(pathname);
  if (previewPath !== pathname || (!canPreview && preview)) {
    setPreviewPath(pathname);
    setPreview(null);
  }
  const openPreview = useCallback((next: PostPreview) => {
    if (!canPreview) return false;
    setDisplayedPreview(next);
    setPreview(next);
    return true;
  }, [canPreview]);
  const closePreview = useCallback(() => setPreview(null), []);
  const refreshPreview = useCallback(() => setPreviewRevision(value => value + 1), []);
  const previewContext = useMemo(() => ({ selected: preview, open: openPreview, revision: previewRevision, refresh: refreshPreview }), [preview, openPreview, previewRevision, refreshPreview]);

  useEffect(() => {
    if (preview || !displayedPreview) return;
    const timer = setTimeout(() => setDisplayedPreview(null), 420);
    return () => clearTimeout(timer);
  }, [preview, displayedPreview]);
  useEffect(() => {
    if (!isWeb || !preview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isWeb, preview, closePreview]);
  const shellStyle = isWebAdmin ? styles.adminShell : isWeb ? styles.webShell : styles.nativeShell;
  const viewportStyle = isWebAdmin ? styles.adminViewport : isWeb ? styles.webViewport : styles.nativeViewport;
  const layout = isWeb && pathname === '/map' ? 'map' : preview ? 'post' : 'normal';

  const viewport = <View {...webData({ workspaceMain: 'true' })} style={[viewportStyle, isWeb && !isWebAdmin && styles.webMain, compactWeb && styles.compactWebViewport]}>
    <View style={styles.stackContainer}>
      <Stack screenOptions={{ headerLeft: () => <BackButton />, headerTintColor: palette.forest }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="company/[id]" options={{ headerTitle: '', headerTransparent: true }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Настройки', headerStyle: { backgroundColor: palette.cream }, headerTintColor: palette.forest }} />
        <Stack.Screen name="post/[id]" options={{ title: 'Публикация' }} />
        <Stack.Screen name="place-post/[id]" options={{ title: 'Публикация места' }} />
        <Stack.Screen name="messages/index" options={{ title: 'Сообщения' }} />
        <Stack.Screen name="messages/[friendId]" options={{ title: 'Диалог' }} />
      </Stack>
    </View>
    {!pathname.startsWith('/messages') && <FloatingNavigation />}
  </View>;

  return (
    <ThemeProvider value={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: palette.olive, background: palette.cream, card: palette.cream, text: palette.forest, border: palette.border } }}>
      <PostPreviewContext.Provider value={previewContext}>
        <View style={[shellStyle, compactWeb && styles.compactWebShell]}>
          {isWeb && !isWebAdmin ? <View {...webData({ workspace: layout })} style={styles.webStage}>
            {displayedPreview && <View {...webData({ workspaceDetail: preview ? 'open' : 'closed' })} style={styles.detail} accessibilityElementsHidden={!preview} importantForAccessibility={preview ? 'auto' : 'no-hide-descendants'}>
              <View style={styles.detailHeader}>
                <Pressable accessibilityRole="button" accessibilityLabel="Закрыть публикацию" onPress={closePreview} style={styles.backButton}><Ionicons name="arrow-back" size={24} color={palette.forest} /></Pressable>
              </View>
              <View key={`${displayedPreview.type}:${displayedPreview.id}`} {...webData({ workspacePost: 'true' })} style={styles.detailContent}>
                {displayedPreview.type === 'place' ? <PlaceDetails id={displayedPreview.id} embedded /> : <SocialPost id={displayedPreview.id} embedded />}
              </View>
            </View>}
            {viewport}
          </View> : viewport}
        </View>
      </PostPreviewContext.Provider>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}

const baseStyles = StyleSheet.create({
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(254,250,224,0.94)' },
  adminShell: { flex: 1, minHeight: '100%', backgroundColor: '#FEFAE0' },
  adminViewport: { flex: 1, width: '100%' },
  nativeShell: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  stackContainer: {
    flex: 1,
  },
  webShell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 32,
    backgroundColor: '#ffffff',
    minHeight: '100%',
  },
  webViewport: {
    width: 430,
    maxWidth: '100%',
    flex: 1,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  webStage: { flex: 1, width: 430, maxWidth: '100%', alignSelf: 'center', position: 'relative' },
  webMain: { position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 2 },
  detail: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden', borderRadius: 32, backgroundColor: palette.cream, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 18 }, elevation: 12 },
  detailHeader: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 4, backgroundColor: palette.cream },
  detailContent: { flex: 1, backgroundColor: palette.cream },
  nativeViewport: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  compactWebShell: { paddingVertical: 0, paddingHorizontal: 0 },
  compactWebViewport: { borderRadius: 0, shadowOpacity: 0, elevation: 0 },
});
