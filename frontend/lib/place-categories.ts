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

function normalizeSearch(text: string) {
  return text.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function matchesPlaceQuery(post: Pick<Post, 'place' | 'user' | 'address' | 'bio' | 'tags'>, query: string) {
  const terms = normalizeSearch(query);
  if (!terms) return true;
  const index = normalizeSearch([post.place, post.user, post.address, post.bio, ...post.tags].join(' '));
  return terms.split(' ').every(term => index.includes(term));
}
