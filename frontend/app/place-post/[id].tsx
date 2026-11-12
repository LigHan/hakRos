import { Stack, useLocalSearchParams } from 'expo-router';
import { PlacePostDetail } from '@/components/place-post-detail';
export default function PlacePostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <><Stack.Screen options={{ title: 'Публикация места' }} /><PlacePostDetail key={id} id={id} /></>;
}
