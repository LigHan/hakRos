import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  GestureResponderEvent,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { databaseService, formatCompactNumber, type Post, type Story } from '@/constants/content';
import {
  isPostFavorite,
  isPostLiked,
  isUserAuthenticated,
  toggleFavorite,
  toggleLike
} from '@/lib/likes-favorites';
import { triggerMapRoute, triggerMapSearch } from '@/lib/map-search';

export default function FeedScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [isScheduleVisible, setScheduleVisible] = useState(false);
  const [reviewsPost, setReviewsPost] = useState<Post | null>(null);
  const [isReviewsVisible, setReviewsVisible] = useState(false);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [isStoryVisible, setStoryVisible] = useState(false);
  const [storyLikes, setStoryLikes] = useState<Record<string, boolean>>({});
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const [isDetailVisible, setDetailVisible] = useState(false);
  const [postLikes, setPostLikes] = useState<Record<string, boolean>>({});
  const [postFavorites, setPostFavorites] = useState<Record<string, boolean>>({});
  const [isAuthModalVisible, setAuthModalVisible] = useState(false);

  const loadData = useCallback(() => {
    return Promise.all([databaseService.getPosts(), databaseService.getStories()])
      .then(([postsData, storiesData]) => {
        setPosts(postsData);
        setStories(storiesData);
      })
      .catch(error => console.error('Не удалось загрузить ленту', error))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Загружаем состояния лайков и избранного
  useEffect(() => {
    const loadPostStates = async () => {
      if (posts.length === 0) return;

      console.log('🔍 Загрузка состояний лайков и избранного...');
      const newPostLikes: Record<string, boolean> = {};
      const newPostFavorites: Record<string, boolean> = {};

      for (const post of posts) {
        newPostLikes[post.id] = await isPostLiked(post.id);
        newPostFavorites[post.id] = await isPostFavorite(post.id);
      }

      setPostLikes(newPostLikes);
      setPostFavorites(newPostFavorites);
      console.log('✅ Состояния загружены:', {
        likes: Object.values(newPostLikes).filter(Boolean).length,
        favorites: Object.values(newPostFavorites).filter(Boolean).length
      });
    };

    loadPostStates();
  }, [posts]);

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
        setPosts(prev => prev.map(p =>
          p.id === postId
            ? { ...p, likes: newLikedState ? p.likes + 1 : Math.max(0, p.likes - 1) }
            : p
        ));

        // Сохраняем в хранилище
        const result = await toggleLike(postId);
        if (!result.success) {
          throw new Error('Failed to toggle like');
        }
        console.log(`✅ Лайк обновлен: ${postId} -> ${newLikedState}`);
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
        console.log(`✅ Избранное обновлено: ${postId} -> ${newFavoriteState}`);
      } catch (error) {
        console.error('❌ Ошибка при избранном:', error);
        // Откатываем изменения в случае ошибки
        setPostFavorites(prev => ({ ...prev, [postId]: !postFavorites[postId] }));
        throw error;
      }
    });

    return success;
  };

  const handleOpenMap = (post: Post) => {
    router.push('/map');
    triggerMapSearch(post.address);
  };

  const handleBuildRoute = (post: Post) => {
    router.push('/map');
    triggerMapRoute(post.address);
  };

  const handleDownload = (id: string) => {
    console.log(`download for ${id}`);
  };

  const handleOpenHours = (post: Post) => {
    setActivePost(post);
    setScheduleVisible(true);
  };

  const handleCloseHours = () => {
    setScheduleVisible(false);
  };

  const handleOpenReviews = (post: Post) => {
    setReviewsPost(post);
    setReviewsVisible(true);
  };

  const handleCloseReviews = () => {
    setReviewsVisible(false);
  };

  const handleOpenProfile = (post: Post) => {
    router.push({ pathname: '/company/[id]', params: { id: post.id } });
  };

  const handleOpenStory = (story: Story) => {
    setActiveStory(story);
    setStoryVisible(true);
  };

  const handleCloseStory = () => {
    setStoryVisible(false);
  };

  const handleOpenStoryDetails = (story: Story) => {
    const relatedPost = posts.find(post => post.id === story.postId);
    if (relatedPost) {
      setStoryVisible(false);
      setDetailPost(relatedPost);
      setDetailVisible(true);
    }
  };

  const toggleStoryLike = (storyId: string) => {
    setStoryLikes(prev => ({
      ...prev,
      [storyId]: !prev[storyId],
    }));
  };

  const handleOpenDetail = (post: Post) => {
    setDetailPost(post);
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

  // Очистка таймеров для модальных окон
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (!isScheduleVisible && activePost) {
      timeout = setTimeout(() => setActivePost(null), 220);
    }
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isScheduleVisible, activePost]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (!isReviewsVisible && reviewsPost) {
      timeout = setTimeout(() => setReviewsPost(null), 220);
    }
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isReviewsVisible, reviewsPost]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (!isStoryVisible && activeStory) {
      timeout = setTimeout(() => setActiveStory(null), 220);
    }
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isStoryVisible, activeStory]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (!isDetailVisible && detailPost) {
      timeout = setTimeout(() => setDetailPost(null), 220);
    }
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isDetailVisible, detailPost]);

  const renderFooter = () =>
    posts.length > 0 ? (
      <View style={styles.listFooter}>
        <Ionicons name="sad-outline" size={20} color="#9AA1AE" />
        <Text style={styles.listFooterText}>Посты закончились…</Text>
      </View>
    ) : null;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="compass-outline" size={48} color="#007AFF" />
        <Text style={styles.loadingText}>Загрузка интересных мест...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={() => {
          setLoading(true);
          void loadData();
        }}
        ListHeaderComponent={
          <View style={styles.storiesSection}>
            <Text style={styles.storiesTitle}>Новинки</Text>
            <FlatList
              data={stories}
              keyExtractor={story => story.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storiesList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.storyItem}
                  onPress={() => handleOpenStory(item)}
                  activeOpacity={0.85}
                >
                  <View style={styles.storyRing}>
                    <Image source={{ uri: item.avatar }} style={styles.storyAvatar} />
                  </View>
                  <Text style={styles.storyName} numberOfLines={1}>
                    {item.userName}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        }
        ListFooterComponent={renderFooter}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.92}
            style={styles.post}
            onPress={() => handleOpenDetail(item)}
          >
            <Image source={{ uri: item.image }} style={styles.image} />
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
                <TouchableOpacity
                  style={styles.ratingBadge}
                  onPress={(event: GestureResponderEvent) => {
                    event.stopPropagation();
                    handleOpenReviews(item);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="star" size={16} color="#FFB800" />
                  <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.userCaption}>от {item.user}</Text>

              {/* ИСПРАВЛЕННЫЙ БЛОК АДРЕСА */}
              <TouchableOpacity
                style={styles.addressRow}
                onPress={(event: GestureResponderEvent) => {
                  event.stopPropagation();
                  handleOpenMap(item);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="location-outline" size={16} color="#2563eb" />
                <Text style={styles.addressText}>
                  {item.address || item.place || 'Адрес не указан'}
                </Text>
              </TouchableOpacity>

              <View style={styles.tagRow}>
                {item.tags.map(tag => (
                  <View key={`${item.id}-${tag}`} style={styles.tagChip}>
                    <Text style={styles.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.actions}>
              <View style={styles.actionGroup}>
                <TouchableOpacity
                  onPress={(event: GestureResponderEvent) => {
                    event.stopPropagation();
                    handleLike(item.id);
                  }}
                  style={styles.likeBtn}
                >
                  <Ionicons
                    name={postLikes[item.id] ? "heart" : "heart-outline"}
                    size={24}
                    color={postLikes[item.id] ? "#FF2D55" : "#1C1C1E"}
                  />
                  <Text style={[
                    styles.likeCount,
                    { color: postLikes[item.id] ? "#FF2D55" : "#333" }
                  ]}>
                    {formatCompactNumber(item.likes)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={(event: GestureResponderEvent) => {
                    event.stopPropagation();
                    handleBuildRoute(item);
                  }}
                  style={styles.actionButton}
                >
                  <Ionicons name="navigate-outline" size={24} color="#1C1C1E" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={(event: GestureResponderEvent) => {
                    event.stopPropagation();
                    handleDownload(item.id);
                  }}
                  style={styles.actionButton}
                >
                  <Ionicons name="download-outline" size={24} color="#1C1C1E" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={(event: GestureResponderEvent) => {
                  event.stopPropagation();
                  handleFavorite(item.id);
                }}
                style={[styles.actionButton, styles.favoriteButton]}
              >
                <Ionicons
                  name={postFavorites[item.id] ? "bookmark" : "bookmark-outline"}
                  size={24}
                  color={postFavorites[item.id] ? "#007AFF" : "#1C1C1E"}
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Модальное окно авторизации */}
      <Modal visible={isAuthModalVisible} transparent animationType="fade" onRequestClose={handleCloseAuth}>
        <Pressable style={styles.modalOverlay} onPress={handleCloseAuth}>
          <Pressable style={styles.authModalCard} onPress={event => event.stopPropagation()}>
            <View style={styles.authModalIcon}>
              <Ionicons name="lock-closed" size={32} color="#007AFF" />
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

      {/* Модальное окно расписания */}
      <Modal visible={isScheduleVisible} transparent animationType="fade" onRequestClose={handleCloseHours}>
        <Pressable style={styles.modalOverlay} onPress={handleCloseHours}>
          <Pressable style={styles.modalCard} onPress={event => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{activePost?.place}</Text>
              {activePost && (
                <View style={styles.modalRating}>
                  <Ionicons name="star" size={18} color="#FFB800" />
                  <Text style={styles.modalRatingText}>{activePost.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.modalSubtitle}>Время работы заведения</Text>
            <View style={styles.modalHours}>
              {activePost?.workingHours.map((slot, index) => (
                <View key={`${slot.label}-${index}`} style={styles.hoursRow}>
                  <Text style={styles.hoursLabel}>{slot.label}</Text>
                  <Text style={styles.hoursValue}>{slot.value}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Модальное окно отзывов */}
      <Modal visible={isReviewsVisible} transparent animationType="fade" onRequestClose={handleCloseReviews}>
        <Pressable style={styles.modalOverlay} onPress={handleCloseReviews}>
          <Pressable style={styles.modalCard} onPress={event => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Отзывы о {reviewsPost?.place}</Text>
              {reviewsPost && (
                <View style={styles.modalRating}>
                  <Ionicons name="star" size={18} color="#FFB800" />
                  <Text style={styles.modalRatingText}>{reviewsPost.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.modalSubtitle}>Что говорят посетители</Text>
            <View style={styles.reviewsList}>
              {reviewsPost?.reviews.map(review => (
                <View key={review.id} style={styles.reviewItem}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewAuthor}>{review.author}</Text>
                    <View style={styles.reviewRating}>
                      <Ionicons name="star" size={14} color="#FFB800" />
                      <Text style={styles.reviewRatingText}>{review.rating.toFixed(1)}</Text>
                    </View>
                  </View>
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                  <Text style={styles.reviewDate}>{review.date}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Модальное окно сторис */}
      <Modal visible={isStoryVisible} transparent animationType="fade" onRequestClose={handleCloseStory}>
        <Pressable style={styles.storyOverlay} onPress={handleCloseStory}>
          <Pressable style={styles.storyCard} onPress={event => event.stopPropagation()}>
            <Image source={{ uri: activeStory?.image }} style={styles.storyImage} />
            <View style={styles.storyHeader}>
              <Image source={{ uri: activeStory?.avatar }} style={styles.storyHeaderAvatar} />
              <Text style={styles.storyHeaderName}>{activeStory?.userName}</Text>
            </View>
            <View style={styles.storyFooter}>
              <Text style={styles.storyText}>{activeStory?.text}</Text>
              <View style={styles.storyFooterActions}>
                <TouchableOpacity
                  style={[
                    styles.storyLikeButton,
                    activeStory && storyLikes[activeStory.id] && styles.storyLikeButtonActive,
                  ]}
                  onPress={() => activeStory && toggleStoryLike(activeStory.id)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={activeStory && storyLikes[activeStory.id] ? 'heart' : 'heart-outline'}
                    size={22}
                    color={activeStory && storyLikes[activeStory.id] ? '#FF2D55' : '#F8FAFC'}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.storyDetailsButton}
                  onPress={() => activeStory && handleOpenStoryDetails(activeStory)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="information-circle-outline" size={22} color="#F8FAFC" />
                  <Text style={styles.storyDetailsLabel}>Подробнее о локации</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Модальное окно деталей поста */}
      <Modal visible={isDetailVisible} transparent animationType="fade" onRequestClose={handleCloseDetail}>
        <Pressable style={styles.detailOverlay} onPress={handleCloseDetail}>
          {detailPost && (
            <Pressable style={styles.detailCard} onPress={event => event.stopPropagation()}>
              <Image source={{ uri: detailPost.image }} style={styles.detailImage} />
              <View style={styles.detailContent}>
                <View style={styles.detailHeader}>
                  <Text style={styles.detailTitle}>{detailPost.place}</Text>
                  <View style={styles.detailRating}>
                    <Ionicons name="star" size={18} color="#FFB800" />
                    <Text style={styles.detailRatingText}>{detailPost.rating.toFixed(1)}</Text>
                  </View>
                </View>
                <Text style={styles.detailSubtitle}>Гид по локации</Text>
                <View style={styles.detailTags}>
                  {detailPost.tags.map(tag => (
                    <View key={`${detailPost.id}-detail-${tag}`} style={styles.detailTagChip}>
                      <Text style={styles.detailTagText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.detailDescription}>
                  {detailPost.reviews[0]?.comment ??
                    'Здесь вы найдете лучшие впечатления города: маршруты, атмосферные пространства и события рядом.'}
                </Text>
                <TouchableOpacity
                  style={styles.detailAddressRow}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (!detailPost) {
                      return;
                    }
                    setDetailVisible(false);
                    handleOpenMap(detailPost);
                  }}
                >
                  <Ionicons name="location-outline" size={18} color="#2563eb" />
                  <Text style={styles.detailAddressText}>{detailPost.address}</Text>
                </TouchableOpacity>
                <View style={styles.detailMetaRow}>
                  <TouchableOpacity
                    style={styles.detailMeta}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (!detailPost) {
                        return;
                      }
                      setDetailVisible(false);
                      handleOpenHours(detailPost);
                    }}
                  >
                    <Ionicons name="time-outline" size={18} color="#1e293b" />
                    <Text style={styles.detailMetaText}>
                      {detailPost.workingHours[0]?.value ?? 'Нет данных'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.detailMeta}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (!detailPost) {
                        return;
                      }
                      setDetailVisible(false);
                      handleOpenMap(detailPost);
                    }}
                  >
                    <Ionicons name="map-outline" size={18} color="#1e293b" />
                    <Text style={styles.detailMetaText}>На карте</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.detailMeta}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (!detailPost) {
                        return;
                      }
                      setDetailVisible(false);
                      handleBuildRoute(detailPost);
                    }}
                  >
                    <Ionicons name="navigate-outline" size={18} color="#1e293b" />
                    <Text style={styles.detailMetaText}>Маршрут</Text>
                  </TouchableOpacity>
                  <View style={styles.detailMeta}>
                    <Ionicons
                      name={postLikes[detailPost.id] ? "heart" : "heart-outline"}
                      size={18}
                      color={postLikes[detailPost.id] ? "#FF2D55" : "#FF2D55"}
                    />
                    <Text style={styles.detailMetaText}>{`${formatCompactNumber(detailPost.likes)} отметок`}</Text>
                  </View>
                </View>
              </View>
                <View style={styles.detailUserBar}>
                  <TouchableOpacity
                    style={styles.detailUserInfo}
                    activeOpacity={0.85}
                    onPress={() => handleOpenProfile(detailPost)}
                  >
                    <Image source={{ uri: detailPost.userAvatar }} style={styles.detailUserAvatar} />
                    <View style={styles.detailUserText}>
                      <Text style={styles.detailUserName}>{detailPost.user}</Text>
                      <Text style={styles.detailUserCaption}>Автор публикации</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleFavorite(detailPost.id)}
                    style={[styles.detailFavoriteButton, postFavorites[detailPost.id] && styles.detailFavoriteButtonActive]}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={postFavorites[detailPost.id] ? "bookmark" : "bookmark-outline"}
                      size={22}
                      color={postFavorites[detailPost.id] ? "#007AFF" : "#64748b"}
                    />
                  </TouchableOpacity>
                </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', paddingHorizontal: 10, paddingTop: '9%' },
  listContent: {
    paddingBottom: 200,
    paddingTop: 20,
  },
  storiesSection: {
    marginBottom: 24,
    gap: 16,
  },
  storiesTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    paddingHorizontal: 4,
  },
  storiesList: {
    gap: 16,
    paddingHorizontal: 4,
  },
  storyItem: {
    width: 74,
    alignItems: 'center',
    gap: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
  storyRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  storyAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  storyName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1e293b',
    textAlign: 'center',
  },
  listFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 28,
  },
  listFooterText: {
    color: '#9AA1AE',
    fontSize: 15,
  },
  post: {
    marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.15)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  image: { width: '100%', height: 300 },
  info: { padding: 10 },
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
    color: '#0f172a',
  },
  authorHandle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  place: { fontSize: 18, fontWeight: '600' },
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
    color: '#B45309',
  },
  userCaption: { color: '#777', marginTop: 4 },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
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
    color: '#1d4ed8',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
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
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 16, 26, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#0b101a',
    shadowOpacity: 0.25,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  modalRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
  },
  modalRatingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#92400e',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#334155',
    marginTop: 12,
    marginBottom: 10,
  },
  modalHours: {
    gap: 12,
  },
  reviewsList: {
    gap: 16,
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
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
    shadowColor: '#0f172a',
    shadowOpacity: 0.24,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 20,
  },
  detailImage: {
    width: '100%',
    height: 260,
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
    color: '#0f172a',
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
    fontSize: 15,
    fontWeight: '600',
    color: '#92400e',
  },
  detailSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: '#475569',
    textTransform: 'uppercase',
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
    color: '#1d4ed8',
  },
  detailDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1f2937',
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
    color: '#1d4ed8',
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
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  detailMetaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
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
    color: '#0f172a',
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
  storyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(12, 15, 26, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  storyCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  storyImage: {
    width: '100%',
    height: 420,
  },
  storyHeader: {
    position: 'absolute',
    top: 18,
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  storyHeaderAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  storyHeaderName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  storyFooter: {
    padding: 20,
    gap: 18,
    backgroundColor: '#111827',
  },
  storyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#E2E8F0',
  },
  storyFooterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  storyLikeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  storyLikeButtonActive: {
    backgroundColor: 'rgba(255,45,85,0.16)',
  },
  storyDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  storyDetailsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148, 163, 184, 0.35)',
  },
  hoursLabel: {
    fontSize: 15,
    color: '#475569',
  },
  hoursValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  reviewItem: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)',
    backgroundColor: 'rgba(248, 250, 252, 0.85)',
    gap: 6,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  reviewAuthor: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 184, 0, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reviewRatingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B45309',
  },
  reviewComment: {
    fontSize: 15,
    lineHeight: 21,
    color: '#1e293b',
  },
  reviewDate: {
    fontSize: 13,
    color: '#64748b',
  },
  // Стили для модального окна авторизации
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
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 12,
  },
  authModalText: {
    fontSize: 16,
    color: '#64748b',
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
    color: '#64748b',
  },
  authModalButtonPrimary: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  authModalButtonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
