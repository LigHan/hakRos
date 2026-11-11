import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { getCompanyPlaces } from '@/lib/company-places';
import { getConnections, type Connections } from '@/lib/connections';
import { ApiError, authorized } from '@/lib/statistics';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { databaseService, formatCompactNumber, type Post } from '@/constants/content';
import {
  getFavoritePosts,
  getFavoritePostsCount,
  getLikedPosts,
  getLikedPostsCount
} from '@/lib/likes-favorites';
import {
  clearUserSession,
  getUserSession,
  type UserSession,
} from '@/lib/user-session';

export default function ProfileScreen() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [likedPosts, setLikedPosts] = useState<string[]>([]);
  const [favoritePosts, setFavoritePosts] = useState<string[]>([]);
  const [likedCount, setLikedCount] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connections | null>(null);
  const [connectionsError, setConnectionsError] = useState('');

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      const loadSessionAndData = async () => {
        console.log('🔍 Загрузка сессии и данных профиля...');
        setLoading(true);
        setError(null);
        setConnections(null);
        setConnectionsError('');

        const userSession = await getUserSession();
        if (controller.signal.aborted) return;

        if (!userSession) {
          console.log('❌ Сессия не найдена, переход на логин');
          router.replace('/login');
          return;
        }


        setSession(userSession);

        try {
          // Загружаем посты из API бэкенда
          let postsData: Post[];
          try {
            postsData = userSession.role === 'company'
              ? await getCompanyPlaces(controller.signal)
              : await databaseService.getPosts();
            console.log('✅ Посты загружены с бэкенда:', postsData.length);
          } catch (apiError) {
            console.warn('⚠️ Бэкенд недоступен, используем пустые данные:', apiError);
            if (controller.signal.aborted) return;
            postsData = [];
            setError(apiError instanceof ApiError && apiError.status === 401
              ? 'Войдите снова, чтобы загрузить заведения.'
              : 'Бэкенд временно недоступен. Некоторые данные могут быть недоступны.');
          }

          if (controller.signal.aborted) return;
          setAllPosts(postsData);

          const connectionsRequest = userSession.role === 'user'
            ? getConnections(controller.signal).catch(cause => {
              if (!controller.signal.aborted) {
                setConnectionsError(cause instanceof ApiError && cause.status === 401
                  ? 'Войдите снова, чтобы загрузить подписки.'
                  : 'Не удалось загрузить подписки.');
              }
              return null;
            })
            : Promise.resolve(null);

          const [liked, favorites, likedCount, favoriteCount, connectionsData] = await Promise.all([
            getLikedPosts(),
            getFavoritePosts(),
            getLikedPostsCount(),
            getFavoritePostsCount(),
            connectionsRequest,
          ]);
          if (controller.signal.aborted) return;
          setConnections(connectionsData);

          console.log('📊 Данные профиля загружены:', {
            liked: liked.length,
            favorites: favorites.length,
            likedCount,
            favoriteCount
          });

          setLikedPosts(liked);
          setFavoritePosts(favorites);
          setLikedCount(likedCount);
          setFavoriteCount(favoriteCount);
        } catch (error) {
          console.error('❌ Ошибка загрузки данных профиля:', error);
          if (!controller.signal.aborted) setError('Ошибка загрузки данных');
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      };

      void loadSessionAndData();
      return () => controller.abort();
    }, [router])
  );

  const isCompany = session?.accountType === 'company';
  const subscriptions = connections?.subscriptions ?? [];
  const subscriptionCount = connections?.subscriptions.length;

  // Используем данные для получения постов
  const favorites = useMemo(
    () => allPosts.filter(post => favoritePosts.includes(post.id)),
    [favoritePosts, allPosts]
  );

  const liked = useMemo(
    () => allPosts.filter(post => likedPosts.includes(post.id)),
    [likedPosts, allPosts]
  );

  const companyPosts = useMemo(() => isCompany ? allPosts : [], [isCompany, allPosts]);

  const companyFollowers = companyPosts.reduce((sum, post) => sum + (post.followers || 0), 0);
  const companyTotalLikes = companyPosts.reduce((sum, post) => sum + (post.totalLikes || post.likes || 0), 0);
  const companyRecentLikes = companyPosts.reduce((sum, post) => sum + (post.likes || 0), 0);

  // Получаем отзывы для компании
  const companyReviews = useMemo(() => {
    if (!isCompany) return [];

    return companyPosts.flatMap(post =>
      (post.reviews || []).map(review => ({
        ...review,
        postId: post.id,
        place: post.place,
      }))
    );
  }, [companyPosts, isCompany]);

  const headerStats = useMemo(() => {
    if (isCompany) {
      return [
        { label: 'Заведений', value: formatNumber(companyPosts.length) },
        { label: 'Лайков', value: formatNumber(companyTotalLikes) },
        { label: 'Подписчиков', value: formatNumber(companyFollowers) },
      ];
    }

    return [
      { label: 'Избранное', value: formatNumber(favoriteCount) },
      { label: 'Понравилось', value: formatNumber(likedCount) },
      { label: 'Подписки', value: subscriptionCount === undefined ? '—' : formatNumber(subscriptionCount) },
    ];
  }, [
    companyFollowers,
    companyPosts.length,
    companyTotalLikes,
    favoriteCount,
    isCompany,
    likedCount,
    subscriptionCount
  ]);

  const handleOpenCompany = (id: string) => {
    router.push({ pathname: '/company/[id]', params: { id } });
  };

  const handleUploadPost = () => {
    Alert.alert('Выложить пост', 'Скоро здесь появится форма публикации поста для вашей компании.');
  };

  const handlePublishHighlight = () => {
    Alert.alert('Выложить новинку', 'Скоро вы сможете делиться новинками и акциями напрямую с подписчиками.');
  };

  const handleLogout = async () => {
    await authorized('/api/logout', {method: 'POST'}).catch(() => {});
    await clearUserSession();
    setSession(null);
    setConnections(null);
    setLikedPosts([]);
    setFavoritePosts([]);
    setAllPosts([]);
    router.replace('/login');
  };

  if (!session || loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <Ionicons name="person-circle-outline" size={48} color="#007AFF" />
        <Text style={styles.loadingText}>Загрузка профиля...</Text>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {Platform.OS === 'web' && session.role === 'admin' && <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/admin')} style={{ backgroundColor: '#0f172a', padding: 16, borderRadius: 12, marginBottom: 16 }}><Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>Панель администратора</Text></TouchableOpacity>}
        <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/statistics')} style={{ backgroundColor: '#2563eb', padding: 16, borderRadius: 12, marginBottom: 16 }}><Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>Открыть статистику</Text></TouchableOpacity>
        {session.role === 'user' && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Друзья"
            style={styles.friendsLink}
            onPress={() => router.push('/connections')}
          >
            <Ionicons name="people-outline" size={22} color="#2563eb" />
            <Text style={styles.friendsLinkLabel}>Друзья</Text>
            {!!connections?.incomingRequests.length && (
              <Text style={styles.friendsLinkLabel}>{connections.incomingRequests.length}</Text>
            )}
            <Ionicons name="chevron-forward" size={18} color="#2563eb" />
          </TouchableOpacity>
        )}
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={20} color="#f59e0b" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.headerCard}>
          <Image
            source={{ uri: session.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80' }}
            style={styles.avatar}
          />
          <ThemedText type="title" style={styles.displayName}>
            {session.name}
          </ThemedText>
          {session.surname && !isCompany && (
            <Text style={styles.surname}>{session.surname}</Text>
          )}
          <Text style={styles.handle}>@{session.handle}</Text>
          <Text style={styles.email}>{session.email}</Text>
          <View style={styles.accountTag}>
            <Ionicons name={isCompany ? 'business' : 'person'} size={16} color="#2563eb" />
            <Text style={styles.accountTagText}>
              {isCompany ? 'Аккаунт компании' : 'Личный аккаунт'}
            </Text>
          </View>
          <View style={styles.statsRow}>
            {headerStats.map(stat => (
              <View key={stat.label} style={styles.statCard}>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
          {isCompany && companyRecentLikes > 0 && (
            <Text style={styles.subStatNote}>
              {`+${formatNumber(companyRecentLikes)} лайков на последних постах`}
            </Text>
          )}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color="#ef4444" />
            <Text style={styles.logoutText}>Выйти из аккаунта</Text>
          </TouchableOpacity>
        </View>

        {isCompany ? (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Управлять заведениями"
              style={styles.managePlaces}
              onPress={() => router.push('/manage-places')}
            >
              <Ionicons name="business-outline" size={20} color="#2563eb" />
              <Text style={styles.friendsLinkLabel}>Управлять заведениями</Text>
              <Ionicons name="chevron-forward" size={18} color="#2563eb" />
            </TouchableOpacity>
            <View style={styles.companyActions}>
              <TouchableOpacity style={styles.companyActionPrimary} onPress={handleUploadPost} activeOpacity={0.85}>
                <Ionicons name="cloud-upload-outline" size={18} color="#f8fafc" />
                <Text style={styles.companyActionPrimaryText}>Выложить пост</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.companyActionSecondary} onPress={handlePublishHighlight} activeOpacity={0.85}>
                <Ionicons name="sparkles-outline" size={18} color="#2563eb" />
                <Text style={styles.companyActionSecondaryText}>Выложить новинку</Text>
              </TouchableOpacity>
            </View>

            <ProfileSection
              title="Мои заведения"
              subtitle={`Всего ${companyPosts.length}`}
              emptyText="Добавьте карточку в кабинете компании."
              isEmpty={companyPosts.length === 0}
            >
              {companyPosts.length > 0 ? (
                <HorizontalCollection
                  items={companyPosts.map(item => ({
                    id: item.id,
                    title: item.place,
                    subtitle: item.address || 'Адрес не указан',
                    image: item.image,
                  }))}
                  onPress={handleOpenCompany}
                />
              ) : null}
            </ProfileSection>

            <ProfileSection
              title="Отзывы посетителей"
              subtitle={`${companyReviews.length} отзывов`}
              emptyText="Публикуйте посты и делитесь новинками, чтобы собирать отзывы."
              isEmpty={companyReviews.length === 0}
            >
              <View style={styles.companyReviewsList}>
                {companyReviews.map(review => (
                  <TouchableOpacity
                    key={`${review.postId}-${review.id}`}
                    style={styles.companyReviewCard}
                    activeOpacity={0.85}
                    onPress={() => handleOpenCompany(review.postId)}
                  >
                    <View style={styles.companyReviewHeader}>
                      <Ionicons name="person-circle-outline" size={20} color="#2563eb" />
                      <View style={styles.companyReviewMeta}>
                        <Text style={styles.companyReviewAuthor}>{review.author}</Text>
                        <Text style={styles.companyReviewPlace}>{review.place}</Text>
                      </View>
                      <View style={styles.companyReviewRating}>
                        <Ionicons name="star" size={14} color="#f59e0b" />
                        <Text style={styles.companyReviewRatingText}>{review.rating.toFixed(1)}</Text>
                      </View>
                    </View>
                    <Text style={styles.companyReviewComment}>{review.comment}</Text>
                    <Text style={styles.companyReviewDate}>{review.date}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ProfileSection>
          </>
        ) : (
          <>
            <ProfileSection
              title="Избранное"
              subtitle={`${favorites.length} мест`}
              emptyText="Сохраняйте интересные места, чтобы быстро возвращаться к ним."
              isEmpty={favorites.length === 0}
            >
              {favorites.length > 0 ? (
                <HorizontalCollection
                  items={favorites.map(item => ({
                    id: item.id,
                    title: item.place,
                    subtitle: item.user,
                    image: item.image,
                  }))}
                  onPress={handleOpenCompany}
                />
              ) : null}
            </ProfileSection>

            <ProfileSection
              title="Понравилось"
              subtitle={`${liked.length} мест`}
              emptyText="Отмечайте понравившиеся локации, чтобы они не потерялись."
              isEmpty={liked.length === 0}
            >
              {liked.length > 0 ? (
                <HorizontalCollection
                  items={liked.map(item => ({
                    id: item.id,
                    title: item.place,
                    subtitle: item.user,
                    image: item.gallery?.[0] ?? item.image,
                  }))}
                  onPress={handleOpenCompany}
                />
              ) : null}
            </ProfileSection>

            {session.role === 'user' && (
              <ProfileSection
                title="Подписки на заведения"
                subtitle={connections ? `Всего ${subscriptions.length}` : ''}
                emptyText={connectionsError || 'Подписывайтесь на заведения из их карточек.'}
                isEmpty={subscriptions.length === 0}
              >
                {subscriptions.length > 0 && (
                  <View style={styles.followingList}>
                    {subscriptions.map(place => (
                      <TouchableOpacity
                        key={place.placeId}
                        accessibilityRole="button"
                        style={styles.followingCard}
                        activeOpacity={0.85}
                        onPress={() => handleOpenCompany(place.placeId)}
                      >
                        <Image source={{ uri: place.avatar }} style={styles.followingAvatar} />
                        <View style={styles.followingInfo}>
                          <Text style={styles.followingName}>{place.name}</Text>
                          <Text style={styles.followingHandle}>@{place.handle}</Text>
                          {place.description ? (
                            <Text style={styles.followingDescription} numberOfLines={2}>{place.description}</Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ProfileSection>
            )}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

type HorizontalItem = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
};

function HorizontalCollection({
  items,
  onPress,
}: {
  items: HorizontalItem[];
  onPress: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.horizontalList}
    >
      {items.map(item => (
        <TouchableOpacity
          key={item.id}
          style={styles.collectionCard}
          activeOpacity={0.85}
          onPress={() => onPress(item.id)}
        >
          <Image
            source={{ uri: item.image || 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=400&q=80' }}
            style={styles.collectionImage}
          />
          <Text style={styles.collectionTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.collectionSubtitle} numberOfLines={1}>
            {item.subtitle}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function ProfileSection({
  title,
  subtitle,
  children,
  emptyText,
  isEmpty,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  emptyText: string;
  isEmpty: boolean;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
          {title}
        </ThemedText>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      {isEmpty ? <Text style={styles.emptyStateText}>{emptyText}</Text> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  friendsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#dbeafe',
    marginBottom: 16,
  },
  friendsLinkLabel: { color: '#1d4ed8', fontWeight: '700' },
  managePlaces: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#dbeafe',
  },
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  scroll: {
    padding: 20,
    gap: 24,
    paddingBottom: 40,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#92400e',
    flex: 1,
  },
  headerCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    gap: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  displayName: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  surname: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  handle: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  email: {
    fontSize: 14,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  accountTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    marginTop: 4,
  },
  accountTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  subStatNote: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    marginTop: 8,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  horizontalList: {
    gap: 16,
  },
  collectionCard: {
    width: 180,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  collectionImage: {
    width: '100%',
    height: 110,
  },
  collectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    paddingHorizontal: 12,
    paddingTop: 10,
    lineHeight: 18,
  },
  collectionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  followingList: {
    gap: 12,
  },
  followingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    padding: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  followingAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  followingInfo: {
    flex: 1,
    gap: 4,
  },
  followingName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  followingHandle: {
    fontSize: 13,
    color: '#64748b',
    textTransform: 'lowercase',
  },
  followingDescription: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 16,
  },
  companyActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  companyActionPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  companyActionPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
  },
  companyActionSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  companyActionSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  companyReviewsList: {
    gap: 12,
  },
  companyReviewCard: {
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    padding: 16,
    gap: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  companyReviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  companyReviewMeta: {
    flex: 1,
  },
  companyReviewAuthor: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  companyReviewPlace: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  companyReviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  companyReviewRatingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#b45309',
  },
  companyReviewComment: {
    fontSize: 14,
    color: '#1f2937',
    lineHeight: 20,
  },
  companyReviewDate: {
    fontSize: 12,
    color: '#94a3b8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#f1f5f9',
  },
  loadingText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
});

function formatNumber(value: number): string {
  return formatCompactNumber(value);
}

