import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View, type PressableProps, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

import { palette, useAppStyles } from '@/lib/app-appearance';

const webHandleStyle = { touchAction: 'none' } as ViewStyle;

export function MapBottomSheet({ title, children }: { title: string; children: ReactNode }) {
  const styles = useAppStyles(baseStyles);
  const [collapsed, setCollapsed] = useState(false);
  const [offset] = useState(() => new Animated.Value(0));
  const dragged = useRef(false);
  const pointer = useRef<{ id: number; startY: number } | null>(null);
  const moveSheet = useCallback((distance: number) => {
    offset.setValue(collapsed ? Math.min(0, distance) : Math.max(0, distance));
  }, [collapsed, offset]);
  const finishDrag = useCallback((distance: number) => {
    if (!collapsed && distance > 28) {
      Keyboard.dismiss();
      setCollapsed(true);
    }
    if (collapsed && distance < -28) setCollapsed(false);
    offset.setValue(0);
  }, [collapsed, offset]);
  const pan = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .maxPointers(1)
    .activeOffsetY([-8, 8])
    .failOffsetX([-20, 20])
    .onUpdate(({ translationY }) => moveSheet(translationY))
    .onEnd(({ translationY }) => finishDrag(translationY))
    .onFinalize(() => offset.setValue(0)), [moveSheet, finishDrag, offset]);
  const webDrag: PressableProps | undefined = Platform.OS === 'web' ? {
    onPointerDown: event => {
      const { button, clientY, pointerId } = event.nativeEvent;
      if (button !== 0 || pointer.current) return;
      pointer.current = { id: pointerId, startY: clientY };
      (event.currentTarget as unknown as HTMLElement).setPointerCapture(pointerId);
    },
    onPointerMove: event => {
      const { clientY, pointerId } = event.nativeEvent;
      if (pointer.current?.id !== pointerId) return;
      const button = event.currentTarget as unknown as HTMLElement;
      if (!button.hasPointerCapture(pointerId)) button.setPointerCapture(pointerId);
      const distance = clientY - pointer.current.startY;
      if (Math.abs(distance) > 8) dragged.current = true;
      moveSheet(distance);
    },
    onPointerUp: ({ nativeEvent: event }) => {
      if (pointer.current?.id !== event.pointerId) return;
      const distance = event.clientY - pointer.current.startY;
      pointer.current = null;
      if (Math.abs(distance) > 8) dragged.current = true;
      finishDrag(distance);
    },
    onPointerCancel: () => {
      pointer.current = null;
      offset.setValue(0);
    },
  } : undefined;
  const handle = (
    <Pressable
      {...webDrag}
      accessibilityRole="button"
      accessibilityLabel={collapsed ? 'Развернуть нижнюю панель' : 'Свернуть нижнюю панель'}
      aria-expanded={!collapsed}
      onPressIn={() => { dragged.current = false; }}
      onPress={() => {
        if (dragged.current) return;
        if (!collapsed) Keyboard.dismiss();
        setCollapsed(!collapsed);
      }}
      style={({ pressed }) => [styles.handle, Platform.OS === 'web' && webHandleStyle, pressed && styles.pressed]}
    >
      <View style={styles.grip} />
      {collapsed && <Text numberOfLines={1} style={styles.peekTitle}>{title}</Text>}
      <Ionicons
        aria-hidden
        name={collapsed ? 'chevron-up' : 'chevron-down'}
        size={18}
        color={palette.olive}
        style={styles.chevron}
      />
    </Pressable>
  );

  return (
    <GestureHandlerRootView style={[styles.container, collapsed && styles.peek]}>
      <Animated.View style={[styles.sheet, { transform: [{ translateY: offset }] }]}>
        {Platform.OS === 'web' ? handle : <GestureDetector gesture={pan}>{handle}</GestureDetector>}
        {!collapsed && (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        )}
      </Animated.View>
    </GestureHandlerRootView>
  );
}

const baseStyles = StyleSheet.create({
  container: { marginTop: 'auto', maxHeight: '45%', minHeight: 44, overflow: 'hidden', borderRadius: 18 },
  peek: { overflow: 'visible' },
  sheet: { flexShrink: 1, backgroundColor: 'rgba(254,250,224,0.96)', borderRadius: 18 },
  handle: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 42 },
  pressed: { backgroundColor: 'rgba(96,108,56,0.08)' },
  grip: { width: 36, height: 4, borderRadius: 2, backgroundColor: palette.muted, opacity: 0.65 },
  peekTitle: { color: palette.forest, fontSize: 13, fontWeight: '600' },
  chevron: { position: 'absolute', right: 14, top: 13 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: 14, paddingBottom: 14 },
});
