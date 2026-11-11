import { getUserSession } from '@/lib/user-session';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type TabConfig = {
  name: string;
  label: string;
  iconFocused: IoniconName;
  iconDefault: IoniconName;
  position: 'left' | 'center' | 'right';
  variation?: 'primary';
};

const TAB_CONFIG: TabConfig[] = [
  {
    name: 'index',
    label: 'Главная',
    iconFocused: 'home',
    iconDefault: 'home-outline',
    position: 'left'
  },
  {
    name: 'map',
    label: 'Карта',
    iconFocused: 'map',
    iconDefault: 'map-outline',
    position: 'left'
  },
  {
    name: 'search',
    label: 'Поиск',
    iconFocused: 'search',
    iconDefault: 'search-outline',
    position: 'center',
    variation: 'primary'
  },
  {
    name: 'profile',
    label: 'Профиль',
    iconFocused: 'person',
    iconDefault: 'person-outline',
    position: 'right'
  },
  {
    name: 'nearby',
    label: 'Рядом',
    iconFocused: 'location',
    iconDefault: 'location-outline',
    position: 'right'
  }
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={props => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="nearby" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const router = useRouter();

  const renderTabButton = (tab: TabConfig) => {
    const route = state.routes.find(r => r.name === tab.name);
    if (!route) return null;

    const routeIndex = state.routes.findIndex(r => r.key === route.key);
    const isFocused = state.index === routeIndex;
    const iconName: IoniconName = isFocused ? tab.iconFocused : tab.iconDefault;

    const onPress = async () => {
      const event = emitter.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        if (tab.name === 'profile' && !(await getUserSession())) {
          router.push('/login');
          return;
        }
        navigateToTab(route.key);
      }
    };

    const onLongPress = () => {
      emitter.emit({
        type: 'tabLongPress',
        target: route.key,
      });
    };

    // Центральная кнопка поиска (широкая)
    if (tab.position === 'center') {
      return (
        <TouchableOpacity
          key={tab.name}
          accessibilityRole="button"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: isFocused }}
          style={[
            styles.searchButton,
            tab.variation === 'primary' && styles.primarySearchButton,
            isFocused && styles.searchButtonActive
          ]}
          onPress={onPress}
          onLongPress={onLongPress}
          activeOpacity={0.85}
        >
          <View style={styles.searchButtonContent}>
            <Ionicons
              name={iconName}
              size={20}
              color={tab.variation === 'primary' ? '#fff' : '#1c1c1e'}
            />
            <Text style={[
              styles.searchButtonText,
              tab.variation === 'primary' ? styles.searchButtonTextPrimary : styles.searchButtonTextSecondary
            ]}>
              {tab.label}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    // Обычные иконки (главная, профиль, рядом)
    return (
      <TouchableOpacity
        key={tab.name}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={descriptors[route.key]?.options.tabBarAccessibilityLabel ?? tab.label}
        onPress={onPress}
        onLongPress={onLongPress}
        style={[styles.iconButton, isFocused && styles.iconButtonActive]}
      >
        <Ionicons
          name={iconName}
          size={24}
          color={isFocused ? '#007AFF' : '#9E9E9E'}
        />
      </TouchableOpacity>
    );
  };

  // Группируем табы по позициям
  const leftTabs = TAB_CONFIG.filter(tab => tab.position === 'left');
  const centerTabs = TAB_CONFIG.filter(tab => tab.position === 'center');
  const rightTabs = TAB_CONFIG.filter(tab => tab.position === 'right');

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.islandShadow}>
        <BlurView intensity={70} tint="light" style={styles.islandBlur}>
          <View style={styles.islandOverlay} />
          <View style={styles.islandContent}>
            {/* Левая группа: Главная */}
            <View style={styles.leftGroup}>
              {leftTabs.map(renderTabButton)}
            </View>

            {/* Центральная группа: Поиск */}
            <View style={styles.centerGroup}>
              {centerTabs.map(renderTabButton)}
            </View>

            {/* Правая группа: Профиль и Рядом */}
            <View style={styles.rightGroup}>
              {rightTabs.map(renderTabButton)}
            </View>
          </View>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  islandShadow: {
    width: '86%',
    maxWidth: 420,
    borderRadius: 40,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
  },
  islandBlur: {
    borderRadius: 40,
    overflow: 'hidden',
  },
  islandOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  islandContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flex: 1,
    gap: 8,
  },
  centerGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
    marginHorizontal: 8,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: 130,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(12,23,42,0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  primarySearchButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
    shadowColor: '#007AFF',
    shadowOpacity: 0.3,
  },
  searchButtonActive: {
    backgroundColor: '#0056CC',
  },
  searchButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  searchButtonTextPrimary: {
    color: '#fff',
  },
  searchButtonTextSecondary: {
    color: '#1c1c1e',
  },
});
