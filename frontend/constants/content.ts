import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type WorkingHours = {
  label: string;
  value: string;
};

export type Review = {
  id: string;
  author: string;
  comment: string;
  rating: number;
  date: string;
};

export type ContactInfo = {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export type Story = {
  id: string;
  userName: string;
  avatar: string;
  image: string;
  text: string;
  postId: string;
};

export type Post = {
  id: string;
  user: string;
  userAvatar: string;
  userHandle: string;
  place: string;
  image: string;
  gallery: string[];
  likes: number;
  totalLikes: number;
  followers: number;
  rating: number;
  tags: string[];
  bio: string;
  address: string;
  category: string;
  workingHours: WorkingHours[];
  reviews: Review[];
  contact: ContactInfo[];
};

export const formatCompactNumber = (number: number): string => {
  if (number < 1000) {
    return number.toString();
  } else if (number < 1000000) {
    return (number / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  } else {
    return (number / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
};

// Базовый URL для API
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');

export function withPlaceCoverUrl<T extends Post>(post: T): T {
  if (!post.image.startsWith('/api/place-covers/')) return post;
  return { ...post, image: `${API_BASE_URL}${post.image}` };
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`API returned HTTP ${response.status}`);
  }
  return response.json();
}

export const databaseService = {
  async getPosts(): Promise<Post[]> {
    const posts = await readJson<Post[]>(await fetch(`${API_BASE_URL}/api/posts`));
    return posts.map(withPlaceCoverUrl);
  },

  async getStories(): Promise<Story[]> {
    return readJson<Story[]>(await fetch(`${API_BASE_URL}/api/stories`));
  },

  async getPostById(id: string): Promise<Post | null> {
    const response = await fetch(`${API_BASE_URL}/api/posts/${encodeURIComponent(id)}`);
    return response.status === 404 ? null : withPlaceCoverUrl(await readJson<Post>(response));
  },
};
