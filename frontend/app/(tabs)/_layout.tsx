import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useState, type ComponentProps } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getUserSession } from '@/lib/user-session';
import { palette, useAppearance } from '@/lib/app-appearance';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type TabConfig = { name: string; label: string; icon: IoniconName; activeIcon: IoniconName };

const leftTabs: TabConfig[] = [
  { name: 'index', label: 'Рекомендации', icon: 'compass-outline', activeIcon: 'compass' },
  { name: 'map', label: 'Карта', icon: 'location-outline', activeIcon: 'location' },
];
const rightTabs: TabConfig[] = [
  { name: 'search', label: 'Поиск', icon: 'search-outline', activeIcon: 'search' },
  { name: 'profile', label: 'Профиль', icon: 'person-outline', activeIcon: 'person' },
];

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={props => <FloatingTabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="nearby" />
    </Tabs>
  );
}

function FloatingTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const router = useRouter();
  const { mode } = useAppearance();
  const [isCreateOpen, setCreateOpen] = useState(false);

  const renderTab = (tab: TabConfig) => {
    const route = state.routes.find(item => item.name === tab.name);
    if (!route) return null;
    const focused = !isCreateOpen && state.routes[state.index]?.key === route.key;
    const onPress = async () => {
      const event = emitter?.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (event?.defaultPrevented) return;
      if (isCreateOpen) setCreateOpen(false);
      if (focused) return;
      if (tab.name === 'profile' && !(await getUserSession())) {
        router.push('/login');
        return;
      }
      navigateToTab(route.key);
    };
    return (
      <Pressable key={tab.name} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: focused }} onPress={() => void onPress()} style={styles.tab}>
        <View style={[styles.iconContainer, focused && styles.iconSelected]}><Ionicons name={focused ? tab.activeIcon : tab.icon} size={22} color={focused ? palette.olive : palette.forest} /></View>
        <Text numberOfLines={1} style={[styles.label, focused && styles.labelSelected]}>{tab.label}</Text>
      </Pressable>
    );
  };

  const choose = (kind: 'post' | 'story') => {
    setCreateOpen(false);
    router.push({ pathname: '/create', params: { kind } });
  };

  return (
    <>
      <View pointerEvents="box-none" style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.bar, mode === 'sketch' && styles.barSketch]}>
          {leftTabs.map(renderTab)}
          <Pressable accessibilityRole="button" accessibilityLabel="Создать публикацию или историю" onPress={() => setCreateOpen(true)} style={styles.createButton}>
            <Ionicons name="add" size={30} color={palette.cream} />
          </Pressable>
          {rightTabs.map(renderTab)}
        </View>
      </View>
      <Modal visible={isCreateOpen} animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.createScreen}>
          <View style={styles.createBlob} pointerEvents="none" />
          <View style={styles.hillLeft} pointerEvents="none" /><View style={styles.hillRight} pointerEvents="none" />
          <ScrollView contentContainerStyle={[styles.createContent, { paddingTop: Math.max(insets.top, 20) }]}>
            <View style={styles.createHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={() => setCreateOpen(false)} style={styles.backButton}><Ionicons name="arrow-back" size={25} color={palette.forest} /></Pressable>
              <Text style={styles.createTitle}>Создать</Text><View style={styles.backButton} />
            </View>
            <Image source={require('@/assets/images/mascot-sketch.png')} style={styles.sheetMascot} accessibilityLabel="Маскот приложения" />
            <Text style={styles.sheetHeadline}>Что опубликуем?</Text>
            <Text style={styles.sheetText}>Поделись местом, событием или{String.fromCharCode(10)}впечатлением после пар</Text>
            <Pressable accessibilityRole="button" style={[styles.choice, styles.postChoice, mode === 'sketch' && styles.choiceSketch]} onPress={() => choose('post')}><Ionicons name="image-outline" size={42} color={palette.olive} /><View style={styles.choiceText}><Text style={styles.choiceTitle}>Пост</Text><Text style={styles.choiceDescription}>Фото, описание и место</Text></View><Ionicons name="chevron-forward" size={21} color={palette.forest} /></Pressable>
            <Pressable accessibilityRole="button" style={[styles.choice, styles.storyChoice, mode === 'sketch' && styles.choiceSketch]} onPress={() => choose('story')}><Ionicons name="play-circle-outline" size={42} color={palette.terracotta} /><View style={styles.choiceText}><Text style={styles.choiceTitle}>История</Text><Text style={styles.choiceDescription}>Короткий момент — сейчас и здесь</Text></View><Ionicons name="chevron-forward" size={21} color={palette.forest} /></Pressable>
          </ScrollView>
          <View style={[styles.modalBarContainer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={[styles.bar, mode === 'sketch' && styles.barSketch]}>
              {leftTabs.map(renderTab)}<Pressable accessibilityRole="button" accessibilityLabel="Закрыть создание" onPress={() => setCreateOpen(false)} style={styles.createButton}><Ionicons name="add" size={30} color={palette.cream} /></Pressable>{rightTabs.map(renderTab)}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 12, right: 12, bottom: 0, alignItems: 'center', backgroundColor: palette.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: palette.border },
  bar: { width: '100%', maxWidth: 350, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: palette.cream, paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4 },
  barSketch: { borderTopWidth: 1.5, borderColor: palette.forest, borderTopLeftRadius: 26, borderTopRightRadius: 23 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, gap: 2 },
  iconContainer: { width: 36, height: 29, alignItems: 'center', justifyContent: 'center' },
  iconSelected: {},
  label: { color: palette.forest, fontSize: 9 },
  labelSelected: { color: palette.olive, fontWeight: '700' },
  createButton: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.terracotta, marginHorizontal: 2 },
  createScreen: { flex: 1, width: '100%', maxWidth: 430, alignSelf: 'center', backgroundColor: palette.cream, overflow: 'hidden' },
  createBlob: { position: 'absolute', top: 130, right: -85, width: 195, height: 130, borderRadius: 100, backgroundColor: '#ECE7C1', transform: [{ rotate: '-25deg' }] },
  hillLeft: { position: 'absolute', left: -110, bottom: 40, width: 360, height: 115, borderRadius: 180, backgroundColor: '#DADAB1' },
  hillRight: { position: 'absolute', right: -100, bottom: 26, width: 310, height: 110, borderRadius: 170, backgroundColor: '#A4A876', transform: [{ rotate: '8deg' }] },
  createContent: { width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 160 },
  createHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  createTitle: { color: palette.forest, fontSize: 27, fontWeight: '800' },
  sheetMascot: { alignSelf: 'center', width: 132, height: 120, resizeMode: 'contain', marginTop: 28 },
  sheetHeadline: { color: palette.forest, fontSize: 27, fontWeight: '800', textAlign: 'center', marginTop: 10 },
  sheetText: { color: palette.muted, fontSize: 15, lineHeight: 22, marginTop: 7, marginBottom: 32, textAlign: 'center' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 18, borderRadius: 22, paddingHorizontal: 20, minHeight: 110, marginBottom: 15 },
  choiceSketch: { borderWidth: 1.5, borderColor: palette.forest, borderTopLeftRadius: 18, borderBottomRightRadius: 25 },
  postChoice: { backgroundColor: '#F0ECD1' },
  storyChoice: { backgroundColor: '#F9EBD1' },
  choiceText: { flex: 1, gap: 4 },
  choiceTitle: { color: palette.forest, fontSize: 20, fontWeight: '700' },
  choiceDescription: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  modalBarContainer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', backgroundColor: palette.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: palette.border },
});
