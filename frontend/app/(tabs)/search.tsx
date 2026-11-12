import { CatalogStatus } from '@/components/catalog-status';
import { PlaceCover } from '@/components/place-photo';
import { SketchFrame } from '@/components/sketch-frame';
import { useAppStyles } from '@/lib/app-appearance';
import { track } from '@/lib/statistics';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { databaseService, formatCompactNumber, type Post } from '@/constants/content';
import {
  isPostFavorite,
  isPostLiked,
  isUserAuthenticated,
  toggleFavorite,
  toggleLike
} from '@/lib/likes-favorites';
import { triggerMapRoute, triggerMapSearch } from '@/lib/map-search';
import { matchesPlaceCategory, matchesPlaceQuery, placeCategories } from '@/lib/place-categories';
import { webData } from '@/lib/web-data';

type SearchPost = Post;

export default function SearchScreen() {
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const searchInputRef = useRef<TextInputInstance>(null);
  const [fadeAnim] = useState(() => new Animated.Value(0));

  const [postsData, setPostsData] = useState<SearchPost[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [activePost, setActivePost] = useState<SearchPost | null>(null);
  const [isDetailVisible, setDetailVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [postLikes, setPostLikes] = useState<Record<string, boolean>>({});
  const [postFavorites, setPostFavorites] = useState<Record<string, boolean>>({});
  const [isAuthModalVisible, setAuthModalVisible] = useState(false);

  const loadData = useCallback(() => {
    return databaseService.getPosts()
      .then(setPostsData)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const reload = () => {
    setLoading(true);
    setLoadError(false);
    void loadData();
  };

  // Загружаем состояния лайков и избранного
  useEffect(() => {
    const loadPostStates = async () => {
      if (postsData.length === 0) return;

      const newPostLikes: Record<string, boolean> = {};
      const newPostFavorites: Record<string, boolean> = {};

      for (const post of postsData) {
        newPostLikes[post.id] = await isPostLiked(post.id);
        newPostFavorites[post.id] = await isPostFavorite(post.id);
      }

      setPostLikes(newPostLikes);
      setPostFavorites(newPostFavorites);
    };

    loadPostStates();
  }, [postsData]);

  // Проверить авторизацию перед действием
  const requireAuth = async (action: () => Promise<void>): Promise<boolean> => {
    const isAuthenticated = await isUserAuthenticated();
    if (!isAuthenticated) {
      setAuthModalVisible(true);
      return false;
    }
    await action();
    return true;
  };

  // Лайк/анлайк поста
  const handleLike = async (postId: string) => {
    const success = await requireAuth(async () => {
      try {
        const wasLiked = postLikes[postId];
        const newLikedState = !wasLiked;

        // Мгновенно обновляем UI
        setPostLikes(prev => ({ ...prev, [postId]: newLikedState }));
        setPostsData(prev => prev.map(p =>
          p.id === postId
            ? { ...p, likes: newLikedState ? p.likes + 1 : Math.max(0, p.likes - 1) }
            : p
        ));

        // Сохраняем в хранилище
        const result = await toggleLike(postId);
        if (!result.success) {
          throw new Error('Failed to toggle like');
        }
      } catch (error) {
        console.error('❌ Ошибка при лайке:', error);
        // Откатываем изменения в случае ошибки
        setPostLikes(prev => ({ ...prev, [postId]: !postLikes[postId] }));
        throw error;
      }
    });

    return success;
  };

  // Добавить/удалить из избранного
  const handleFavorite = async (postId: string) => {
    const success = await requireAuth(async () => {
      try {
        const wasFavorite = postFavorites[postId];
        const newFavoriteState = !wasFavorite;

        // Мгновенно обновляем UI
        setPostFavorites(prev => ({ ...prev, [postId]: newFavoriteState }));

        // Сохраняем в хранилище
        const result = await toggleFavorite(postId);
        if (!result.success) {
          throw new Error('Failed to toggle favorite');
        }
      } catch (error) {
        console.error('❌ Ошибка при избранном:', error);
        // Откатываем изменения в случае ошибки
        setPostFavorites(prev => ({ ...prev, [postId]: !postFavorites[postId] }));
        throw error;
      }
    });

    return success;
  };

  const searchResults = useMemo(
    () => postsData.filter(post => matchesPlaceCategory(post, selectedCategory) && matchesPlaceQuery(post, searchQuery)),
    [postsData, selectedCategory, searchQuery]
  );
  const isSearching = searchQuery.trim().length > 0;
  const hasResults = searchResults.length > 0;
  useEffect(() => {
    if (loading || loadError || !isSearching) return;
    const timer = setTimeout(() => { track('search'); if (!hasResults) track('search_no_results'); }, 800);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, loading, loadError, isSearching, hasResults]);

  useEffect(() => {
    if (!hasResults) {
      fadeAnim.setValue(0);
      return;
    }
    const animation = Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [fadeAnim, hasResults]);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
  };

  const clearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
  };

  const openInMap = (post: SearchPost) => {
    router.push('/map');
    triggerMapSearch(post.address || post.place, post.id);
  };

  const buildRoute = (post: SearchPost) => {
    track('route_requested', post.id);
    router.push('/map');
    triggerMapRoute(post.address || post.place, post.id);
  };

  const handleOpenDetail = (post: SearchPost) => {
    track('card_view', post.id);
    setActivePost(post);
    setDetailVisible(true);
  };

  const handleCloseDetail = () => {
    setDetailVisible(false);
  };

  const handleCloseAuth = () => {
    setAuthModalVisible(false);
  };

  const handleNavigateToAuth = () => {
    setAuthModalVisible(false);
    router.push('/login');
  };

  const handleOpenProfile = (post: SearchPost) => {
    router.push({ pathname: '/company/[id]', params: { id: post.id } });
  };

  const renderPost = ({ item }: { item: SearchPost }) => (
    <TouchableOpacity
      activeOpacity={0.92}
      style={styles.post}
      onPress={() => handleOpenDetail(item)}
    >
      <PlaceCover place={item} style={styles.image} />
      <View style={styles.info}>
        <View style={styles.authorRow}>
          <TouchableOpacity onPress={() => handleOpenProfile(item)} activeOpacity={0.8}>
            <Image source={{ uri: item.userAvatar }} style={styles.authorAvatar} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.authorDetails}
            onPress={() => handleOpenProfile(item)}
            activeOpacity={0.8}
          >
            <Text style={styles.authorName}>{item.user}</Text>
            <Text style={styles.authorHandle}>@{item.userHandle}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.placeRow}>
          <Text style={styles.place}>{item.place}</Text>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={16} color="#BC6C25" />
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addressRow}
          activeOpacity={0.85}
          onPress={() => openInMap(item)}
        >
          <Ionicons name="location-outline" size={16} color="#606C38" />
          <Text style={styles.addressText}>{item.address}</Text>
        </TouchableOpacity>
        <View style={styles.tagRow}>
          {item.tags?.map(tag => (
            <View key={`${item.id}-${tag}`} style={styles.tagChip}>
              <Text style={styles.tagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        <View style={styles.actionGroup}>
          <TouchableOpacity
            onPress={() => handleLike(item.id)}
            style={styles.likeBtn}
            activeOpacity={0.85}
          >
            <Ionicons
              name={postLikes[item.id] ? "heart" : "heart-outline"}
              size={24}
              color={postLikes[item.id] ? "#BC6C25" : "#283618"}
            />
            <Text style={[
              styles.likeCount,
              { color: postLikes[item.id] ? "#BC6C25" : "#333" }
            ]}>
              {formatCompactNumber(item.likes)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => buildRoute(item)}
            style={styles.actionButton}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate-outline" size={24} color="#283618" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => handleFavorite(item.id)}
          style={[styles.actionButton, styles.favoriteButton]}
          activeOpacity={0.85}
        >
          <Ionicons
            name={postFavorites[item.id] ? "bookmark" : "bookmark-outline"}
            size={24}
            color={postFavorites[item.id] ? "#606C38" : "#283618"}
          />
        </TouchableOpacity>
      </View>
      <SketchFrame />
    </TouchableOpacity>
  );

  return (
    <ThemedView {...webData({ hakrosFocus: 'search' })} style={styles.container}>
      <View style={[styles.searchHeader, { paddingTop: top + 16 }]}>
        <Text style={styles.pageTitle}>Поиск</Text>
        <Text style={styles.pageSubtitle}>Найдите место для новых впечатлений</Text>
        <View {...webData({ focusGroup: 'catalog-search' })} style={[styles.searchContainer, searchActive && styles.searchContainerActive]}>
          <Ionicons name="search" size={20} color="#475569" style={styles.searchIcon} />
          <TextInput
            ref={searchInputRef}
            accessibilityLabel="Поиск мест"
            style={styles.searchInput}
            placeholder="Название, адрес или автор"
            placeholderTextColor="#6F7457"
            value={searchQuery}
            onChangeText={handleSearchChange}
            onFocus={() => setSearchActive(true)}
            onBlur={() => setSearchActive(false)}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Очистить поиск" onPress={clearSearch} style={styles.clearButton} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color="#6F7457" />
            </TouchableOpacity>
          )}
        </View>
        <FlatList
          horizontal
          data={placeCategories}
          keyExtractor={item => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.categoryChip, selectedCategory === item.id && styles.categoryChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedCategory === item.id }}
              onPress={() => handleCategorySelect(item.id)}
            >
              <Ionicons
                name={item.icon}
                size={16}
                color={selectedCategory === item.id ? '#fff' : '#606C38'}
              />
              <Text style={selectedCategory === item.id ? styles.categoryChipTextActive : styles.categoryChipText}>
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <Animated.View style={[styles.resultsContainer, { opacity: hasResults ? fadeAnim : 1 }]}>
        <FlatList
          data={searchResults}
          keyExtractor={item => item.id}
          renderItem={renderPost}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={reload}
          ListHeaderComponent={loadError && hasResults
            ? <CatalogStatus loading={false} failed emptyMessage="" onRetry={reload} />
            : undefined}
          ListEmptyComponent={
            <CatalogStatus loading={loading} failed={loadError} onRetry={reload}
              emptyMessage={postsData.length ? 'По этому запросу и категории мест нет.' : 'В каталоге пока нет мест.'}
              onReset={isSearching || selectedCategory !== 'all' ? () => { setSelectedCategory('all'); setSearchQuery(''); } : undefined} />
          }
        />
      </Animated.View>

      {/* Модальное окно авторизации */}
      <Modal visible={isAuthModalVisible} transparent animationType="fade" onRequestClose={handleCloseAuth}>
        <Pressable style={styles.modalOverlay} onPress={handleCloseAuth}>
          <Pressable style={styles.authModalCard} onPress={event => event.stopPropagation()}>
            <View style={styles.authModalIcon}>
              <Ionicons name="lock-closed" size={32} color="#606C38" />
            </View>
            <Text style={styles.authModalTitle}>Требуется авторизация</Text>
            <Text style={styles.authModalText}>
              Чтобы лайкать посты и добавлять их в избранное, пожалуйста, войдите в свой аккаунт
            </Text>
            <View style={styles.authModalButtons}>
              <TouchableOpacity
                style={styles.authModalButtonSecondary}
                onPress={handleCloseAuth}
              >
                <Text style={styles.authModalButtonSecondaryText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.authModalButtonPrimary}
                onPress={handleNavigateToAuth}
              >
                <Text style={styles.authModalButtonPrimaryText}>Войти</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={isDetailVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseDetail}
      >
        <Pressable style={styles.detailOverlay} onPress={handleCloseDetail}>
          {activePost && (
            <Pressable {...webData({ hakrosFocus: 'place-preview' })} style={styles.detailCard} onPress={event => event.stopPropagation()}>
              <ScrollView>
                <PlaceCover place={activePost} style={styles.detailImage} />
                <View style={styles.detailContent}>
                  <View style={styles.detailHeader}>
                    <Text style={styles.detailTitle}>{activePost.place}</Text>
                    <View style={styles.detailRating}>
                      <Ionicons name="star" size={18} color="#BC6C25" />
                      <Text style={styles.detailRatingText}>{activePost.rating.toFixed(1)}</Text>
                    </View>
                  </View>
                  <Text style={styles.detailSubtitle}>{activePost.user}</Text>
                  <TouchableOpacity
                    style={styles.detailAddressRow}
                    activeOpacity={0.85}
                    onPress={() => {
                      handleCloseDetail();
                      openInMap(activePost);
                    }}
                  >
                    <Ionicons name="location-outline" size={18} color="#606C38" />
                    <Text style={styles.detailAddressText}>{activePost.address}</Text>
                  </TouchableOpacity>
                  <View style={styles.detailTags}>
                    {activePost.tags?.map(tag => (
                      <View key={`${activePost.id}-detail-${tag}`} style={styles.detailTagChip}>
                        <Text style={styles.detailTagText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.detailDescription}>
                    {activePost.bio || 'Описание пока не добавлено.'}
                  </Text>
                  <View style={styles.detailMetaRow}>
                    <TouchableOpacity
                      style={styles.detailMeta}
                      activeOpacity={0.85}
                      onPress={() => {
                        if (!activePost) return;
                        handleCloseDetail();
                        openInMap(activePost);
                      }}
                    >
                      <Ionicons name="map-outline" size={18} color="#283618" />
                      <Text style={styles.detailMetaText}>На карте</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.detailMeta}
                      activeOpacity={0.85}
                      onPress={() => {
                        if (!activePost) return;
                        handleCloseDetail();
                        buildRoute(activePost);
                      }}
                    >
                      <Ionicons name="navigate-outline" size={18} color="#283618" />
                      <Text style={styles.detailMetaText}>Маршрут</Text>
                    </TouchableOpacity>
                    <View style={styles.detailMeta}>
                      <Ionicons
                        name={postLikes[activePost.id] ? "heart" : "heart-outline"}
                        size={18}
                        color={postLikes[activePost.id] ? "#BC6C25" : "#BC6C25"}
                      />
                      <Text style={styles.detailMetaText}>{`${formatCompactNumber(activePost.likes)} отметок`}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.detailUserBar}>
                  <TouchableOpacity
                    style={styles.detailUserInfo}
                    activeOpacity={0.85}
                    onPress={() => handleOpenProfile(activePost)}
                  >
                    <Image source={{ uri: activePost.userAvatar }} style={styles.detailUserAvatar} />
                    <View style={styles.detailUserText}>
                      <Text style={styles.detailUserName}>{activePost.user}</Text>
                      <Text style={styles.detailUserCaption}>Автор публикации</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleFavorite(activePost.id)}
                    style={[styles.detailFavoriteButton, postFavorites[activePost.id] && styles.detailFavoriteButtonActive]}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={postFavorites[activePost.id] ? "bookmark" : "bookmark-outline"}
                      size={22}
                      color={postFavorites[activePost.id] ? "#606C38" : "#6F7457"}
                    />
                  </TouchableOpacity>
                </View>
              </ScrollView>
              <Pressable accessibilityRole="button" accessibilityLabel="Закрыть карточку" onPress={handleCloseDetail} style={styles.detailClose}>
                <Ionicons name="close" size={22} color="#283618" />
              </Pressable>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const baseStyles = StyleSheet.create({
  pageTitle: { color: '#283618', fontSize: 30, lineHeight: 38, fontWeight: '800' },
  pageSubtitle: { color: '#6F7457', fontSize: 14, marginTop: -12 },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  searchHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(12,23,42,0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    gap: 12,
  },
  searchContainerActive: {
    borderColor: '#606C38',
  },
  searchIcon: {
    marginRight: 4,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    minHeight: 24,
    color: '#283618',
  },
  clearButton: {
    padding: 4,
  },
  categoriesList: {
    gap: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: '#606C38',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#606C38',
  },
  categoryChipTextActive: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  resultsContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 200,
    gap: 20,
  },
  post: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.15)',
    shadowColor: '#283618',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  image: {
    width: '100%',
    aspectRatio: 1.8,
  },
  info: {
    padding: 16,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  authorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  authorDetails: {
    flex: 1,
  },
  authorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#283618',
  },
  authorHandle: {
    fontSize: 13,
    color: '#6F7457',
    marginTop: 2,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  place: {
    fontSize: 18,
    fontWeight: '600',
    color: '#283618',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 184, 0, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#BC6C25',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  addressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#606C38',
    textDecorationLine: 'underline',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#283618',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  favoriteButton: {
    marginLeft: 'auto',
  },
  likeCount: {
    fontSize: 16,
    fontWeight: '500',
  },
  placeholderWrapper: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: -1,
  },
  placeholderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#283618',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  placeholderTitle: {
    fontSize: 20,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 22,
  },
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(12, 15, 26, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  detailCard: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
    shadowColor: '#283618',
    shadowOpacity: 0.24,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 20,
  },
  detailClose: { position: 'absolute', right: 12, top: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFCED', alignItems: 'center', justifyContent: 'center' },
  detailImage: {
    width: '100%',
    aspectRatio: 1.6,
  },
  detailContent: {
    paddingHorizontal: 24,
    paddingVertical: 22,
    gap: 14,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#283618',
    flex: 1,
  },
  detailRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 184, 0, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  detailRatingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
  },
  detailSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#283618',
  },
  detailAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  detailAddressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#283618',
  },
  detailTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailTagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  detailTagText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#283618',
  },
  detailDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1f2937',
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
  },
  detailMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  detailMetaText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#283618',
  },
  detailUserBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#e2e8f0',
  },
  detailUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  detailUserAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  detailUserText: {
    gap: 4,
  },
  detailUserName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#283618',
  },
  detailUserCaption: {
    fontSize: 13,
    color: '#475569',
  },
  detailFavoriteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
  },
  detailFavoriteButtonActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  // Стили для модального окна авторизации
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 16, 26, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  authModalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#0b101a',
    shadowOpacity: 0.25,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
  },
  authModalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  authModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#283618',
    textAlign: 'center',
    marginBottom: 12,
  },
  authModalText: {
    fontSize: 16,
    color: '#6F7457',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  authModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  authModalButtonSecondary: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    alignItems: 'center',
  },
  authModalButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6F7457',
  },
  authModalButtonPrimary: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#606C38',
    alignItems: 'center',
  },
  authModalButtonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

