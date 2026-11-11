import { useEffect, useState } from 'react';
import { getLikedPosts, getFavoritePosts } from '@/lib/likes-favorites';

export function useLikesFavorites() {
  const [likedPosts, setLikedPosts] = useState<string[]>([]);
  const [favoritePosts, setFavoritePosts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [liked, favorites] = await Promise.all([
          getLikedPosts(),
          getFavoritePosts()
        ]);
        setLikedPosts(liked);
        setFavoritePosts(favorites);
      } catch (error) {
        console.error('❌ Ошибка загрузки лайков и избранного:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const refresh = async () => {
    setIsLoading(true);
    const [liked, favorites] = await Promise.all([
      getLikedPosts(),
      getFavoritePosts()
    ]);
    setLikedPosts(liked);
    setFavoritePosts(favorites);
    setIsLoading(false);
  };

  return {
    likedPosts,
    favoritePosts,
    isLoading,
    refresh
  };
}
