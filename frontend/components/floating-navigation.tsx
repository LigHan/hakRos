import { Ionicons } from '@expo/vector-icons';
import { type Href, usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Animated, BackHandler, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SketchFrame } from '@/components/sketch-frame';
import { palette, useAppearance, useAppStyles } from '@/lib/app-appearance';
import { getUserSession } from '@/lib/user-session';

type Icon = ComponentProps<typeof Ionicons>['name'];
const tabs: { href: Href; path: string; label: string; icon: Icon; selected: Icon }[] = [
  { href: '/', path: '/', label: 'Рекомендации', icon: 'compass-outline', selected: 'compass' },
  { href: '/map', path: '/map', label: 'Карта', icon: 'location-outline', selected: 'location' },
  { href: '/search', path: '/search', label: 'Поиск', icon: 'search-outline', selected: 'search' },
  { href: '/profile', path: '/profile', label: 'Профиль', icon: 'person-outline', selected: 'person' },
];

/** A single persistent island; only content above it animates. */
export function FloatingNavigation() {
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { mode } = useAppearance();
  const [open, setOpen] = useState(false);
  const [chooserPath, setChooserPath] = useState(pathname);
  const [progress] = useState(() => new Animated.Value(0));
  const bottom = Math.max(insets.bottom, 12);
  const islandHeight = 66 + bottom;
  const close = useCallback(() => setOpen(false), []);
  // Route changes close synchronously, including browser back/forward. Waiting
  // for an animation frame can leave a click-through overlay in background tabs.
  if (chooserPath !== pathname) {
    setChooserPath(pathname);
    if (open) setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const animation = Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true });
    animation.start();
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => { animation.stop(); listener.remove(); };
  }, [open, close, progress]);

  if (pathname === '/admin' || pathname === '/login' || pathname === '/modal') return null;
  const navigate = async (href: Href, path: string) => {
    close();
    if (path === '/profile' && !(await getUserSession())) { router.push('/login'); return; }
    if (pathname !== path) router.navigate(href);
  };
  const choose = (kind: 'post' | 'story') => {
    close();
    router.push({ pathname: '/create', params: { kind } });
  };
  const renderTab = (index: number) => {
    const tab = tabs[index];
    const selected = !open && pathname === tab.path;
    return <Pressable key={tab.path} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected }} onPress={() => void navigate(tab.href, tab.path)} style={styles.tab}>
      <Ionicons name={selected ? tab.selected : tab.icon} size={22} color={selected ? palette.olive : palette.forest} />
      <Text numberOfLines={1} style={[styles.label, selected && styles.selected]}>{tab.label}</Text>
    </Pressable>;
  };
  return <>
    {open && <Animated.View style={[styles.chooser, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [70, 0] }) }] }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.chooserContent, { paddingTop: Math.max(insets.top + 8, 20), paddingBottom: islandHeight + 30 }]}>
        <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Закрыть создание" onPress={close} style={styles.back}><Ionicons name="arrow-back" color={palette.forest} size={25} /></Pressable><Text style={styles.title}>Создать</Text><View style={styles.back} /></View>
        <Image source={require('@/assets/images/mascot-sketch.png')} style={styles.mascot} accessibilityLabel="Маскот приложения" />
        <Text style={styles.headline}>Что опубликуем?</Text>
        <Text style={styles.description}>Поделитесь местом или впечатлением после пар</Text>
        <Pressable accessibilityRole="button" onPress={() => choose('post')} style={styles.choice}><Ionicons name="images-outline" size={36} color={palette.olive} /><View style={styles.choiceText}><Text style={styles.choiceTitle}>Пост</Text><Text style={styles.description}>Фото, видео и описание</Text></View><Ionicons name="chevron-forward" size={20} color={palette.forest} /><SketchFrame /></Pressable>
        <Pressable accessibilityRole="button" disabled={Platform.OS === 'web'} accessibilityState={{ disabled: Platform.OS === 'web' }} onPress={() => choose('story')} style={[styles.choice, Platform.OS === 'web' && styles.disabled]}><Ionicons name="videocam-outline" size={36} color={palette.terracotta} /><View style={styles.choiceText}><Text style={styles.choiceTitle}>История</Text><Text style={styles.description}>{Platform.OS === 'web' ? 'Создавайте истории в приложении на телефоне' : 'Снимите короткий момент на камеру'}</Text></View><SketchFrame /></Pressable>
      </ScrollView>
    </Animated.View>}
    <View pointerEvents="box-none" style={[styles.navigation, { paddingBottom: bottom }]}>
      <View style={[styles.island, mode === 'sketch' && styles.sketchIsland]}>
        {renderTab(0)}{renderTab(1)}
        <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Закрыть создание' : 'Создать публикацию или историю'} accessibilityState={{ expanded: open }} onPress={() => { if (open) close(); else { progress.setValue(0); setOpen(true); } }} style={styles.plus}><Ionicons name={open ? 'close' : 'add'} size={30} color={palette.cream} /></Pressable>
        {renderTab(2)}{renderTab(3)}
      </View>
    </View>
  </>;
}

const baseStyles = StyleSheet.create({
  navigation: { position: 'absolute', left: 12, right: 12, bottom: 0, zIndex: 30, alignItems: 'center', backgroundColor: palette.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: palette.border },
  island: { width: '100%', maxWidth: 350, height: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  sketchIsland: { borderTopLeftRadius: 24, borderTopRightRadius: 19 },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 },
  label: { color: palette.forest, fontSize: 9 }, selected: { color: palette.olive, fontWeight: '700' },
  plus: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.terracotta, marginHorizontal: 2 },
  chooser: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 20, backgroundColor: palette.cream },
  chooserContent: { paddingHorizontal: 20, paddingBottom: 30, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  title: { color: palette.forest, fontSize: 27, lineHeight: 36, fontWeight: '800' },
  mascot: { width: 110, height: 100, alignSelf: 'center', resizeMode: 'contain', marginTop: 12 },
  headline: { color: palette.forest, fontSize: 27, lineHeight: 36, fontWeight: '800', textAlign: 'center' },
  description: { color: palette.muted, fontSize: 14, lineHeight: 21, flexShrink: 1 },
  choice: { backgroundColor: palette.surface, position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, minHeight: 100, borderRadius: 22 },
  choiceText: { flex: 1, minWidth: 0, gap: 5 }, choiceTitle: { color: palette.forest, fontSize: 21, lineHeight: 28, fontWeight: '700' }, disabled: { opacity: 0.55 },
});
