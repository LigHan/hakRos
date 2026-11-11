import { DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Ionicons } from '@expo/vector-icons';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { AppearanceProvider, palette, useAppStyles } from '@/lib/app-appearance';

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
  // Админ-панель веба занимает весь экран, пользовательские экраны сохраняют прежний размер.
  const isWebAdmin = isWeb && pathname === '/admin';
  const shellStyle = isWebAdmin ? styles.adminShell : isWeb ? styles.webShell : styles.nativeShell;
  const viewportStyle = isWebAdmin ? styles.adminViewport : isWeb ? styles.webViewport : styles.nativeViewport;

  return (
    <ThemeProvider value={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: palette.olive, background: palette.cream, card: palette.cream, text: palette.forest, border: palette.border } }}>
      <View style={shellStyle}>
        <View style={viewportStyle}>
          <View style={styles.stackContainer}>
            <Stack screenOptions={{ headerLeft: () => <BackButton />, headerTintColor: palette.forest }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
              <Stack.Screen name="company/[id]" options={{ headerTitle: '', headerTransparent: true }} />
              <Stack.Screen name="admin" options={{ headerShown: false }} />
              <Stack.Screen name="settings" options={{ title: 'Настройки', headerStyle: { backgroundColor: palette.cream }, headerTintColor: palette.forest }} />
            </Stack>
          </View>
        </View>
      </View>
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
  nativeViewport: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
