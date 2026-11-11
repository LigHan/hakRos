import { Tabs } from 'expo-router/js-tabs';

// The island belongs to the root viewport, so pushed screens never replace it.
export default function TabLayout() {
  return <Tabs screenOptions={{ headerShown: false }} tabBar={() => null}>
    <Tabs.Screen name="index" />
    <Tabs.Screen name="map" />
    <Tabs.Screen name="search" />
    <Tabs.Screen name="profile" />
    <Tabs.Screen name="nearby" />
  </Tabs>;
}
