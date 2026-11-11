import type { Post } from '@/constants/content';

export const placeCategories = [
  { id: 'all', name: 'Все', icon: 'apps' },
  { id: 'cafe', name: 'Кафе', icon: 'cafe-outline' },
  { id: 'restaurant', name: 'Рестораны', icon: 'restaurant-outline' },
  { id: 'park', name: 'Парки', icon: 'leaf-outline' },
  { id: 'museum', name: 'Музеи', icon: 'school-outline' },
  { id: 'shop', name: 'Магазины', icon: 'cart-outline' },
  { id: 'entertainment', name: 'Развлечения', icon: 'game-controller-outline' },
] as const;

const legacyCategoryTags: Record<string, string[]> = {
  cafe: ['кафе', 'кофе'],
  restaurant: ['ресторан', 'отель'],
  park: ['парк'],
  museum: ['музей', 'культура', 'история'],
  shop: ['магазин'],
  entertainment: ['развлечения', 'события'],
};

export function matchesPlaceCategory(post: Post, category: string) {
  if (category === 'all') return true;
  if (post.category) return post.category === category;

  const tags = legacyCategoryTags[category] ?? [category];
  return post.tags.some(tag => tags.some(keyword => tag.toLowerCase().includes(keyword)));
}
