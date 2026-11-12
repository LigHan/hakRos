import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlacePostDetail } from '@/components/place-post-detail';
import { SocialPostDetail } from '@/components/social-post-detail';
import { palette, useAppStyles } from '@/lib/app-appearance';
import { floatingNavigationHeight } from '@/lib/floating-navigation-layout';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';

export type OpenPost = { kind: 'place' | 'social'; id: string };
export function PostPanel({ post, onClose }: { post: OpenPost; onClose: () => void }) {
  const styles = useAppStyles(baseStyles);
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => listener.remove();
  }, [onClose]);
  return <View style={[styles.overlay, { bottom: Math.max(floatingNavigationHeight(insets.bottom), keyboardInset ? keyboardInset + 8 : 0) }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Закрыть публикацию" onPress={onClose} style={StyleSheet.absoluteFill} />
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.title}>{post.kind === 'place' ? 'Публикация места' : 'Публикация'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" onPress={onClose} style={styles.close}><Ionicons name="close" size={24} color={palette.forest} /></Pressable>
      </View>
      {post.kind === 'place' ? <PlacePostDetail key={post.id} id={post.id} embedded onClose={onClose} /> : <SocialPostDetail key={post.id} id={post.id} embedded onClose={onClose} />}
    </View>
  </View>;
}
const baseStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 25, justifyContent: 'flex-end', backgroundColor: 'rgba(28, 35, 20, 0.25)' },
  panel: { width: '100%', height: '88%', maxHeight: 760, backgroundColor: palette.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  panelHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  title: { color: palette.forest, fontSize: 17, fontWeight: '700', flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
