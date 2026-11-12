import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SocialMedia } from '@/components/social-media';

export type StoryEntry = { id: string; authorKey: string; name: string; text: string; image: string | null; mediaKind: 'image' | 'video'; avatar: string | null; placeId: string | null };
type Props = { stories: StoryEntry[]; index: number; onPrevious: () => void; onNext: () => void; onClose: () => void; onOpenPlace: (id: string) => void; onRetry: () => void };

export function StoryViewer({ stories, index, onPrevious, onNext, onClose, onOpenPlace, onRetry }: Props) {
  const story = stories[index];
  const insets = useSafeAreaInsets();
  const [progressState, setProgressState] = useState({ id: story.id, value: 0 });
  const progress = progressState.id === story.id ? progressState.value : 0;
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(Platform.OS === 'web');
  const [failedStoryId, setFailedStoryId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const failed = failedStoryId === story.id;
  const progressRef = useRef(0);
  const longPress = useRef(false);
  const advance = useCallback(() => { setPaused(false); onNext(); }, [onNext]);
  useEffect(() => { progressRef.current = 0; }, [story.id]);
  useEffect(() => {
    if (paused || (story.image && story.mediaKind === 'video')) return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      progressRef.current = Math.min(1, progressRef.current + (now - last) / 5000);
      last = now;
      setProgressState({ id: story.id, value: progressRef.current });
      if (progressRef.current >= 1) { clearInterval(timer); advance(); }
    }, 80);
    return () => clearInterval(timer);
  }, [advance, paused, story.id, story.image, story.mediaKind]);
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.story}>
        {story.image ? <SocialMedia key={`${story.id}-${retryCount}`} uri={story.image} kind={story.mediaKind} story active={!paused} muted={muted} onProgress={value => setProgressState({ id: story.id, value })} onEnd={advance} onFailure={() => { setFailedStoryId(story.id); setPaused(true); }} onRetry={() => { setFailedStoryId(null); setPaused(false); setRetryCount(value => value + 1); onRetry(); }} /> : <View style={styles.textOnly}><Text style={styles.textOnlyCaption}>{story.text}</Text></View>}
        <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.65)', 'transparent']} style={styles.topShade} />
        <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.68)']} style={styles.bottomShade} />
        <View pointerEvents={failed ? 'none' : 'auto'} style={styles.tapZones}>
          <Pressable accessibilityRole="button" accessibilityLabel="Предыдущая история" onPressIn={() => { longPress.current = false; }} onLongPress={() => { longPress.current = true; setPaused(true); }} onPressOut={() => setPaused(false)} onPress={() => { if (!longPress.current) onPrevious(); }} delayLongPress={180} style={styles.previous} />
          <Pressable accessibilityRole="button" accessibilityLabel="Следующая история" onPressIn={() => { longPress.current = false; }} onLongPress={() => { longPress.current = true; setPaused(true); }} onPressOut={() => setPaused(false)} onPress={() => { if (!longPress.current) onNext(); }} delayLongPress={180} style={styles.next} />
        </View>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <View style={styles.progressRow}>{stories.map((item, itemIndex) => <View key={item.id} style={styles.track}><View style={[styles.progress, { width: `${itemIndex < index ? 100 : itemIndex === index ? Math.max(0, Math.min(100, progress * 100)) : 0}%` }]} /></View>)}</View>
          <View style={styles.authorRow}>
            {story.avatar ? <Image source={{ uri: story.avatar }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><Text style={styles.initial}>{story.name.charAt(0).toUpperCase()}</Text></View>}
            <Text numberOfLines={1} style={styles.name}>{story.name}</Text>
            {story.mediaKind === 'video' && !!story.image && <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Включить звук' : 'Выключить звук'} onPress={() => setMuted(value => !value)} style={styles.iconButton}><Ionicons name={muted ? 'volume-mute-outline' : 'volume-high-outline'} size={23} color="#fff" /></Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть историю" onPress={onClose} style={styles.iconButton}><Ionicons name="close" size={27} color="#fff" /></Pressable>
          </View>
        </View>
        <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {!!story.image && !!story.text && <Text style={styles.caption}>{story.text}</Text>}
          {story.placeId && <Pressable accessibilityRole="button" onPress={() => onOpenPlace(story.placeId!)} style={styles.placeButton}><Text style={styles.placeText}>Открыть место</Text></Pressable>}
        </View>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#10120d', alignItems: 'center' },
  story: { flex: 1, width: '100%', maxWidth: 430, overflow: 'hidden', backgroundColor: '#303923' },
  topShade: { position: 'absolute', left: 0, right: 0, top: 0, height: 145 },
  bottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 185 },
  tapZones: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  previous: { width: '32%', height: '100%' }, next: { flex: 1, height: '100%' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, gap: 10 },
  progressRow: { flexDirection: 'row', gap: 4 }, track: { flex: 1, height: 3, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.4)' }, progress: { height: '100%', backgroundColor: '#fff' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#606C38' }, initial: { color: '#fff', fontWeight: '700' },
  name: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 15 }, iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, gap: 12 }, caption: { color: '#fff', fontSize: 16, lineHeight: 23, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },
  placeButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#fff', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10 }, placeText: { color: '#fff', fontWeight: '700' },
  textOnly: { ...StyleSheet.absoluteFill, justifyContent: 'center', padding: 30 }, textOnlyCaption: { color: '#fff', fontSize: 26, lineHeight: 36, textAlign: 'center', fontWeight: '700' },
});
