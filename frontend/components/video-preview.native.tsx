import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { createVideoPlayer, type VideoThumbnail } from 'expo-video';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { API_URL } from '@/lib/statistics';
import { palette } from '@/lib/app-appearance';

// Keep media decoding bounded when a long feed mounts multiple cards at once.
let queue: Promise<void> = Promise.resolve();
function enqueue(work: () => Promise<void>) {
  const pending = queue.then(work);
  queue = pending.catch(() => {});
}

export function VideoPreview({ uri, style }: { uri: string; style?: StyleProp<ViewStyle> }) {
  const [image, setImage] = useState<VideoThumbnail | null>(null);
  const resolved = uri.startsWith('/') ? API_URL + uri : uri;
  useEffect(() => {
    let cancelled = false;
    enqueue(async () => {
      if (cancelled) return;
      const player = createVideoPlayer(null);
      try {
        await player.replaceAsync(resolved);
        const thumbnails = await player.generateThumbnailsAsync(0.1, { maxWidth: 480, maxHeight: 480 });
        const thumbnail = thumbnails[0];
        if (cancelled) thumbnail?.release();
        else if (thumbnail) setImage(thumbnail);
      } catch {
        // The post remains openable if a codec or network cannot provide a frame.
      } finally { player.release(); }
    });
    return () => { cancelled = true; };
  }, [resolved]);
  return <View style={[styles.preview, style]} pointerEvents="none">
    {image && <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />}
    <View style={styles.scrim} /><Ionicons name="play-circle" size={50} color={palette.cream} />
  </View>;
}
const styles = StyleSheet.create({
  preview: { width: '100%', height: 180, borderRadius: 14, backgroundColor: palette.forest, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,25,14,0.15)' },
});
