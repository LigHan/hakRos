import { useAppStyles } from '@/lib/app-appearance';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Image,
  Platform,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { getConnections, type Connections } from '@/lib/connections';
import { getCompanyPlaces } from '@/lib/company-places';
import { getSocialFeed, type SocialItem } from '@/lib/social';
import { ApiError } from '@/lib/statistics';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { databaseService, formatCompactNumber, type Post } from '@/constants/content';
import {
  getFavoritePosts,
  getFavoritePostsCount,
} from '@/lib/likes-favorites';
import {
  getUserSession,
  type UserSession,
} from '@/lib/user-session';

// Visual reference data belongs only to the dedicated local demo account.
const demoProfile = {
  name: 'Мария Лебедева',
  subtitle: 'Студентка МГУ',
  status: 'Ищу новые места после пар ✨',
  avatar: 'https://images.unsplash.com/photo-1747671688812-76d7bca21f34?auto=format&fit=crop&w=300&q=80',
  places: [
    { name: 'Кофейня «Клевер»', rating: '4,8', tag: 'Кофейни', saved: true, image: 'https://images.unsplash.com/photo-1777451441095-c7ef2f875929?auto=format&fit=crop&w=320&q=80' },
    { name: 'Скалодром «Высота»', rating: '4,8', tag: 'Спорт', saved: false, image: 'https://images.unsplash.com/photo-1756821725793-c90c88407c59?auto=format&fit=crop&w=320&q=80' },
    { name: 'Музей современного искусства', rating: '4,7', tag: 'Выставки', saved: true, image: 'https://images.unsplash.com/photo-1635172562604-3ba8826afc34?auto=format&fit=crop&w=320&q=80' },
  ],
};

export default function ProfileScreen() {
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<UserSession | null>(null);
  const [socialItems, setSocialItems] = useState<SocialItem[]>([]);
  const [profileTab, setProfileTab] = useState<'places' | 'posts' | 'stories'>('places');
  const [favoritePosts, setFavoritePosts] = useState<string[]>([]);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [connections, setConnections] = useState<Connections | null>(null);

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      const loadSessionAndData = async () => {
        console.log('🔍 Загрузка сессии и данных профиля...');
        setLoading(true);
        setError(null);
        setAuthExpired(false);
        setConnections(null);

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
            postsData = userSession.role === 'company' ? await getCompanyPlaces(controller.signal) : await databaseService.getPosts();
            console.log('✅ Посты загружены с бэкенда:', postsData.length);
          } catch (apiError) {
            console.warn('⚠️ Бэкенд недоступен, используем пустые данные:', apiError);
            if (controller.signal.aborted) return;
            postsData = [];
            const expired = apiError instanceof ApiError && apiError.status === 401;
            setAuthExpired(expired);
            setError(expired ? 'Сессия закончилась. Войдите в аккаунт снова.' : 'Бэкенд временно недоступен. Некоторые данные могут быть недоступны.');
          }

          if (controller.signal.aborted) return;
          setAllPosts(postsData);

          const connectionsRequest = userSession.role === 'user'
            ? getConnections(controller.signal).catch(cause => {
              if (!controller.signal.aborted) {
                if (cause instanceof ApiError && cause.status === 401) {
                  setAuthExpired(true);
                  setError('Сессия закончилась. Войдите в аккаунт снова.');
                }
                console.warn(cause instanceof ApiError && cause.status === 401
                  ? 'Войдите снова, чтобы загрузить друзей.'
                  : 'Не удалось загрузить друзей.');
              }
              return null;
            })
            : Promise.resolve(null);

          const [favorites, favoriteCount, connectionsData, socialData] = await Promise.all([
            getFavoritePosts(),
            getFavoritePostsCount(),
            connectionsRequest,
            userSession.role === 'admin' ? Promise.resolve([]) : getSocialFeed().catch(cause => {
              if (!controller.signal.aborted && cause instanceof ApiError && cause.status === 401) {
                setAuthExpired(true);
                setError('Сессия закончилась. Войдите в аккаунт снова.');
              }
              return [];
            }),
          ]);
          if (controller.signal.aborted) return;
          setConnections(connectionsData);
          setSocialItems(socialData);

          console.log('📊 Данные профиля загружены:', {
            favorites: favorites.length,
            favoriteCount
          });

          setFavoritePosts(favorites);
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
  const isDemoProfile = session?.email === 'demo-ef9e4f@hakros.local';

  // Используем данные для получения постов
  const favorites = useMemo(
    () => allPosts.filter(post => favoritePosts.includes(post.id)),
    [favoritePosts, allPosts]
  );

  const companyPosts = useMemo(() => isCompany ? allPosts : [], [isCompany, allPosts]);
  const ownSocialItems = useMemo(() => socialItems.filter(item => item.authorId === String(session?.id)), [socialItems, session?.id]);

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

    if (isDemoProfile) return [{ label: 'постов', value: '48' }, { label: 'друзей', value: '132' }, { label: 'сохранённых', value: '27' }];
    return [
      { label: 'постов', value: formatNumber(ownSocialItems.filter(item => item.kind === 'post').length) },
      { label: 'друзей', value: connections ? formatNumber(connections.friends.length) : '—' },
      { label: 'сохранённых', value: formatNumber(favoriteCount) },
    ];
  }, [
    companyFollowers,
    companyPosts.length,
    companyTotalLikes,
    connections,
    favoriteCount,
    isCompany,
    isDemoProfile,
    ownSocialItems
  ]);

  const handleOpenCompany = (id: string) => {
    router.push({ pathname: '/company/[id]', params: { id } });
  };

  const handleUploadPost = () => {
    router.push({ pathname: '/create', params: { kind: 'post' } });
  };

  const handlePublishHighlight = () => {
    router.push({ pathname: '/create', params: { kind: 'story' } });
  };

  const shareProfile = async () => {
    const message = 'Откройте для себя новые места вместе с hakRos!';
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) await navigator.share({ text: message });
        else if (navigator.clipboard) await navigator.clipboard.writeText(message);
        else Alert.alert('Поделиться', message);
      } else await Share.share({ message });
    } catch (cause) { console.warn('Не удалось поделиться', cause); }
  };

  if (!session || loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <Ionicons name="person-circle-outline" size={48} color="#606C38" />
        <Text style={styles.loadingText}>Загрузка профиля...</Text>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top + 8, 24) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileHeader}>
          <ThemedText type="title" style={styles.profileTitle}>Профиль</ThemedText>
          <View style={styles.headerActions}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Поделиться" onPress={() => void shareProfile()} style={styles.settingsButton}><Ionicons name="share-outline" size={24} color="#283618" /></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Настройки" onPress={() => router.push('/settings')} style={styles.settingsButton}><Ionicons name="settings-outline" size={24} color="#283618" /></TouchableOpacity>
          </View>
        </View>
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={20} color="#BC6C25" />
            <Text style={styles.errorText}>{error}</Text>
            {authExpired && <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/login')}><Text style={styles.authLink}>Войти</Text></TouchableOpacity>}
          </View>
        )}
        <View style={styles.headerCard}>
          <View style={styles.profileIdentityRow}>
            {isDemoProfile || session.avatar ? <Image source={{ uri: isDemoProfile ? demoProfile.avatar : session.avatar }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><Ionicons name="person" size={51} color="#606C38" /></View>}
            <View style={styles.profileIdentity}>
              <ThemedText type="title" style={styles.displayName}>{isDemoProfile ? demoProfile.name : `${session.name}${session.surname && !isCompany ? ` ${session.surname}` : ''}`}</ThemedText>
              {isDemoProfile && <Text style={styles.profileSubtitle}>{demoProfile.subtitle}</Text>}
              {isDemoProfile && <View style={styles.accountTag}><Text style={styles.accountTagText}>{demoProfile.status}</Text></View>}
            </View>
          </View>
          <View style={styles.statsRow}>
            {headerStats.map(stat => (
              <View key={stat.label} style={styles.statCard}>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
          {isCompany && companyRecentLikes > 0 && <Text style={styles.subStatNote}>{`+${formatNumber(companyRecentLikes)} лайков на последних постах`}</Text>}
        </View>


        {isCompany ? (
          <>
            <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/manage-places')} style={styles.managePlaces}>
              <Ionicons name="business-outline" size={20} color="#606C38" /><Text style={styles.managePlacesText}>Управлять заведениями</Text><Ionicons name="chevron-forward" size={18} color="#606C38" />
            </TouchableOpacity>
            <View style={styles.companyActions}>
              <TouchableOpacity style={styles.companyActionPrimary} onPress={handleUploadPost} activeOpacity={0.85}>
                <Ionicons name="cloud-upload-outline" size={18} color="#f8fafc" />
                <Text style={styles.companyActionPrimaryText}>Выложить пост</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.companyActionSecondary} onPress={handlePublishHighlight} activeOpacity={0.85}>
                <Ionicons name="sparkles-outline" size={18} color="#606C38" />
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
                      <Ionicons name="person-circle-outline" size={20} color="#606C38" />
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
            <View style={styles.segment}>
              {([['places', 'Мои места'], ['posts', 'Посты'], ['stories', 'Истории']] as const).map(([key, label]) => (
                <TouchableOpacity key={key} accessibilityRole="tab" accessibilityState={{ selected: profileTab === key }} onPress={() => setProfileTab(key)} style={[styles.segmentItem, profileTab === key && styles.segmentSelected]}>
                  <Text numberOfLines={1} style={[styles.segmentText, profileTab === key && styles.segmentTextSelected]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {profileTab === 'places' ? <View style={styles.placeSection}>
              <View style={styles.placeHeading}><Ionicons name="location-outline" size={21} color="#283618" /><Text style={styles.placeHeadingText}>{isDemoProfile ? 'Посещённые места' : 'Сохранённые места'}</Text><Ionicons name="chevron-forward" size={19} color="#283618" /></View>
              {isDemoProfile ? demoProfile.places.map(item => <View key={item.name} style={styles.placeRow}>
                <Image source={{ uri: item.image }} style={styles.placeImage} />
                <View style={styles.placeInfo}><Text numberOfLines={2} style={styles.placeName}>{item.name}</Text><Text style={styles.placeRating}>★ <Text style={styles.placeRatingNumber}>{item.rating}</Text></Text><Text style={styles.placeTag}>{item.tag}</Text></View>
                <Ionicons name={item.saved ? 'bookmark' : 'bookmark-outline'} size={22} color="#BC6C25" />
              </View>) : favorites.length ? favorites.map(item => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={`Открыть ${item.place}`} style={styles.placeRow} onPress={() => handleOpenCompany(item.id)}>
                <Image source={{ uri: item.image }} style={styles.placeImage} />
                <View style={styles.placeInfo}><Text numberOfLines={2} style={styles.placeName}>{item.place}</Text><Text style={styles.placeRating}>★ <Text style={styles.placeRatingNumber}>{item.rating.toFixed(1).replace('.', ',')}</Text></Text>{!!item.tags[0] && <Text style={styles.placeTag}>{item.tags[0]}</Text>}</View>
                <Ionicons name="bookmark" size={22} color="#BC6C25" />
              </TouchableOpacity>) : <Text style={styles.emptyStateText}>Сохраняйте интересные места, чтобы быстро к ним вернуться.</Text>}
            </View> : <View style={styles.ownSocialList}>{ownSocialItems.filter(item => item.kind === (profileTab === 'posts' ? 'post' : 'story')).length ? ownSocialItems.filter(item => item.kind === (profileTab === 'posts' ? 'post' : 'story')).map(item => <View key={item.id} style={styles.ownSocialItem}>
              <Text style={styles.ownSocialDate}>{new Date(item.createdAt).toLocaleDateString('ru-RU')}</Text>
              {!!item.body && <Text style={styles.ownSocialText}>{item.body}</Text>}
              {!!item.originalId && <Text style={styles.ownSocialText}>Репост: {item.originalAuthorName} · {item.originalBody}</Text>}
              {!!item.imageUrl && <Image source={{uri:item.imageUrl}} style={styles.ownSocialImage} />}
            </View>) : <Text style={styles.emptyStateText}>{profileTab === 'posts' ? 'У вас пока нет публикаций.' : 'У вас пока нет активных историй.'}</Text>}</View>}
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
  const styles = useAppStyles(baseStyles);
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
  const styles = useAppStyles(baseStyles);
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

const baseStyles = StyleSheet.create({
  managePlaces: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  managePlacesText: { color: '#283618', flex: 1, fontWeight: '600' },
  ownSocialList: { gap: 12, paddingTop: 12 },
  ownSocialItem: { backgroundColor: '#F0ECCD', padding: 14, borderRadius: 16, gap: 6 },
  ownSocialDate: { color: '#6F7457', fontSize: 12 },
  ownSocialText: { color: '#283618', fontSize: 15, lineHeight: 22 },
  ownSocialImage: { width: '100%', height: 190, borderRadius: 12 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  segment: { flexDirection: 'row', backgroundColor: '#F1EBD1', borderRadius: 22, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36, borderRadius: 19, paddingHorizontal: 3 },
  segmentSelected: { backgroundColor: '#606C38' },
  segmentText: { color: '#283618', fontSize: 12, fontWeight: '600' },
  segmentTextSelected: { color: '#FEFAE0' },
  placeSection: { gap: 0 },
  placeHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D9D6B5' },
  placeHeadingText: { flex: 1, color: '#283618', fontSize: 15, fontWeight: '600' },
  placeRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D9D6B5' },
  placeImage: { width: 104, height: 76, borderRadius: 13 },
  placeInfo: { flex: 1, alignItems: 'flex-start', gap: 3 },
  placeName: { color: '#283618', fontSize: 14, fontWeight: '700' },
  placeRating: { color: '#BC6C25', fontSize: 13 },
  placeRatingNumber: { color: '#283618', fontWeight: '600' },
  placeTag: { overflow: 'hidden', color: '#283618', backgroundColor: '#F0ECCD', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11 },
  profileTitle: { color: '#283618', fontSize: 30, lineHeight: 38, fontWeight: '800' },
  settingsButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  profileIdentityRow: { flexDirection: 'row', alignItems: 'center', gap: 16, width: '100%' },
  profileIdentity: { flex: 1, alignItems: 'flex-start', gap: 5 },
  avatarPlaceholder: { width: 108, height: 108, borderRadius: 54, backgroundColor: '#F0ECCD', alignItems: 'center', justifyContent: 'center' },
  profileSubtitle: { fontSize: 14, color: '#6F7457' },
  menuCard: { borderRadius: 20, backgroundColor: '#FFFCED', borderWidth: 1, borderColor: '#D9D6B5', paddingHorizontal: 14 },
  menuRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D9D6B5' },
  menuIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#F0ECCD' },
  menuLabel: { flex: 1, color: '#283618', fontWeight: '600', fontSize: 15 },
  menuDetail: { color: '#BC6C25', fontWeight: '700' },
  friendsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F0ECCD',
    marginBottom: 16,
  },
  friendsLinkLabel: { color: '#283618', fontWeight: '700' },
  container: {
    flex: 1,
    backgroundColor: '#FEFAE0',
  },
  scroll: {
    padding: 20,
    gap: 14,
    paddingTop: 38,
    paddingBottom: 130,
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
  authLink: { color: '#606C38', fontWeight: '700', marginLeft: 8 },
  errorText: {
    fontSize: 14,
    color: '#92400e',
    flex: 1,
  },
  headerCard: {
    alignItems: 'center',
    backgroundColor: '#FEFAE0',
    gap: 12,
  },
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
  },
  displayName: {
    color: '#283618',
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
    textAlign: 'left',
  },
  surname: {
    fontSize: 16,
    color: '#6F7457',
    fontWeight: '500',
  },
  handle: {
    fontSize: 14,
    color: '#6F7457',
    fontWeight: '500',
  },
  email: {
    fontSize: 14,
    color: '#6F7457',
    fontStyle: 'italic',
  },
  accountTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F3EBD1',
    marginTop: 4,
  },
  accountTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#283618',
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
    color: '#283618',
  },
  statLabel: {
    fontSize: 12,
    color: '#6F7457',
    textAlign: 'center',
  },
  subStatNote: {
    fontSize: 12,
    color: '#6F7457',
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
    shadowColor: '#283618',
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
    color: '#283618',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6F7457',
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
    shadowColor: '#283618',
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
    color: '#283618',
    paddingHorizontal: 12,
    paddingTop: 10,
    lineHeight: 18,
  },
  collectionSubtitle: {
    fontSize: 13,
    color: '#6F7457',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6F7457',
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
    shadowColor: '#283618',
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
    color: '#283618',
  },
  followingHandle: {
    fontSize: 13,
    color: '#6F7457',
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
    backgroundColor: '#606C38',
    shadowColor: '#606C38',
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
    color: '#606C38',
  },
  companyReviewsList: {
    gap: 12,
  },
  companyReviewCard: {
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    padding: 16,
    gap: 10,
    shadowColor: '#283618',
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
    color: '#283618',
  },
  companyReviewPlace: {
    fontSize: 13,
    fontWeight: '600',
    color: '#606C38',
  },
  companyReviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  companyReviewRatingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#BC6C25',
  },
  companyReviewComment: {
    fontSize: 14,
    color: '#1f2937',
    lineHeight: 20,
  },
  companyReviewDate: {
    fontSize: 12,
    color: '#6F7457',
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
    color: '#6F7457',
    fontWeight: '500',
  },
});

function formatNumber(value: number): string {
  return formatCompactNumber(value);
}

