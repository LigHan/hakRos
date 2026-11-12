import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { palette } from '@/lib/app-appearance';
import { placeCategories } from '@/lib/place-categories';
import { getPlacePhotos, type PlacePhotoData, type PlacePhotoSource } from '@/lib/place-photos';

type PhotoProps = {
  photos: readonly PlacePhotoSource[];
  name: string;
  category?: string | null;
  style: StyleProp<ViewStyle>;
  fit?: 'cover' | 'contain';
  compact?: boolean;
  onUnavailable?: (key: string) => void;
};

export function PlaceCover({ place, style, compact }: {
  place: PlacePhotoData;
  style: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  return <PlacePhoto photos={getPlacePhotos(place)} name={place.place} category={place.category} style={style} compact={compact} />;
}

export function PlacePhoto(props: PhotoProps) {
  return <PhotoFrame key={JSON.stringify(props.photos.map(photo => photo.key))} {...props} />;
}

function PhotoFrame({ photos, name, category, style, fit = 'cover', compact, onUnavailable }: PhotoProps) {
  const [index, setIndex] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const photo = photos[index];
  const icon = category && category !== 'all'
    ? placeCategories.find(item => item.id === category)?.icon ?? 'location-outline'
    : 'location-outline';
  const status = photos.length ? 'Фото недоступно' : 'Без фото';

  return (
    <View style={[styles.frame, fit === 'contain' && photo && styles.fullscreen, style]}>
      {photo ? (
        <>
          {loadedKey !== photo.key && <ActivityIndicator accessibilityLabel="Загрузка фото" color={fit === 'contain' ? palette.cream : palette.olive} />}
          <Image
            key={photo.key}
            style={StyleSheet.absoluteFill}
            source={photo.source}
            contentFit={fit}
            accessibilityLabel={photo.credit ? `Архивное фото: ${name}` : `Фото: ${name}`}
            onLoad={() => setLoadedKey(photo.key)}
            onError={() => {
              setIndex(current => current === index ? current + 1 : current);
              onUnavailable?.(photo.key);
            }}
          />
        </>
      ) : (
        <View accessible accessibilityRole="image" accessibilityLabel={`${name}. ${status}`} style={styles.placeholder}>
          <Ionicons name={icon} size={compact ? 20 : 34} color={palette.olive} aria-hidden />
          <Text numberOfLines={1} style={[styles.caption, compact && styles.smallCaption]}>{status}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', justifyContent: 'center', alignItems: 'center', backgroundColor: '#EDECD8' },
  fullscreen: { backgroundColor: 'transparent' },
  placeholder: { paddingHorizontal: 8, alignItems: 'center', gap: 6, maxWidth: '100%' },
  caption: { color: palette.forest, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  smallCaption: { fontSize: 10, lineHeight: 13 },
});
