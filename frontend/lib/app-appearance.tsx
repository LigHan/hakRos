import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFonts } from 'expo-font';

export type AppearanceMode = 'classic' | 'sketch';
const STORAGE_KEY = '@hakros/appearance';

export const palette = {
  olive: '#606C38',
  forest: '#283618',
  cream: '#FEFAE0',
  sand: '#DDA15E',
  terracotta: '#BC6C25',
  surface: '#FFFCED',
  muted: '#6F7457',
  border: '#D9D6B5',
} as const;

type AppearanceContextValue = {
  mode: AppearanceMode;
  ready: boolean;
  handFontReady: boolean;
  setMode: (mode: AppearanceMode) => Promise<void>;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [handFontReady] = useFonts({ HakrosHand: require('@/assets/fonts/Caveat.ttf') });
  const [mode, updateMode] = useState<AppearanceMode>('classic');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        if (active && (value === 'classic' || value === 'sketch')) updateMode(value);
      })
      .catch(error => console.warn('Не удалось загрузить оформление', error))
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const setMode = useCallback(async (next: AppearanceMode) => {
    await AsyncStorage.setItem(STORAGE_KEY, next);
    updateMode(next);
  }, []);
  const value = useMemo(() => ({ mode, ready, handFontReady, setMode }), [mode, ready, handFontReady, setMode]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance requires AppearanceProvider');
  return context;
}

const colorMap: Record<string, string> = {
  '#007aff': palette.olive, '#0056cc': palette.forest, '#2563eb': palette.olive,
  '#1d4ed8': palette.forest, '#0a7ea4': palette.olive,
  '#0f172a': palette.forest, '#1e293b': palette.forest, '#1c1c1e': palette.forest,
  '#1f2937': palette.forest, '#11181c': palette.forest, '#334155': palette.forest,
  '#475569': palette.muted, '#64748b': palette.muted, '#94a3b8': palette.muted,
  '#9aa1ae': palette.muted, '#9e9e9e': palette.muted,
  '#ffb800': palette.terracotta, '#b45309': palette.terracotta,
  '#ff2d55': palette.terracotta, '#f59e0b': palette.terracotta,
  '#e2e8f0': palette.border, '#e5e7eb': palette.border,
};
const lightSurfaces = new Set(['#fff', '#ffffff', '#f8fafc', '#f1f5f9', '#f7f9fc', '#f4f6fb', '#f2f4fa', '#fbfcff', '#f8fbff']);

function remapColor(value: string, property: string): string {
  const normalized = value.toLowerCase();
  if (property === 'backgroundColor' && lightSurfaces.has(normalized)) return palette.surface;
  if (property === 'backgroundColor' && /^rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/.test(normalized)) {
    return value.replace(/255\s*,\s*255\s*,\s*255/, '254, 250, 224');
  }
  if (/^rgba\(\s*(0\s*,\s*122\s*,\s*255|37\s*,\s*99\s*,\s*235|59\s*,\s*130\s*,\s*246)/.test(normalized)) {
    return value.replace(/(0\s*,\s*122\s*,\s*255|37\s*,\s*99\s*,\s*235|59\s*,\s*130\s*,\s*246)/, '96, 108, 56');
  }
  return colorMap[normalized] ?? value;
}

/** Apply the shared palette to existing screens while keeping their layout and behaviour intact. */
export function useAppStyles<T extends Record<string, object>>(source: T): T {
  const { mode, handFontReady } = useAppearance();
  return useMemo(() => {
    const themed = Object.fromEntries(Object.entries(source).map(([name, style]) => {
      const result: Record<string, unknown> = {};
      for (const [property, value] of Object.entries(style)) {
        result[property] = typeof value === 'string' && /color$/i.test(property)
          ? remapColor(value, property)
          : value;
      }
      if (mode === 'sketch') {
        const isCard = /(?:card|panel|post|sheet|chip|section)$/i.test(name);
        if (isCard && result.backgroundColor && result.borderRadius) {
          result.borderWidth = name === 'post' ? 0 : Math.max(Number(result.borderWidth) || 0, 1.5);
          result.borderColor = palette.forest;
          result.borderTopLeftRadius = Math.max(4, Number(result.borderRadius) - 3);
          result.borderBottomRightRadius = Number(result.borderRadius) + 3;
          result.shadowOpacity = 0;
          result.elevation = 0;
        }
        if (/(?:title|heading)$/i.test(name) && Number(result.fontSize) >= 20) {
          if (handFontReady) result.fontFamily = 'HakrosHand';
        }
      }
      return [name, result];
    }));
    return themed as T;
  }, [mode, handFontReady, source]);
}
