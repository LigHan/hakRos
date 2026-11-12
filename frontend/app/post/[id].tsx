import { Stack, useLocalSearchParams } from 'expo-router';
import { SocialPostDetail } from '@/components/social-post-detail';
export default function SocialPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <><Stack.Screen options={{ title: 'Публикация' }} /><SocialPostDetail key={id} id={id} /></>;
}
