import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isWeb = Platform.OS === 'web';
  const shellStyle = isWeb ? styles.webShell : styles.nativeShell;
  const viewportStyle = isWeb ? styles.webViewport : styles.nativeViewport;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={shellStyle}>
        <View style={viewportStyle}>
          <View style={styles.stackContainer}>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
              <Stack.Screen name="company/[id]" options={{ title: 'Профиль места' }} />
            </Stack>
          </View>
        </View>
      </View>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
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
