import type { Post, Story } from '@/constants/content';

/** Shape published in CONNECTIONS.md on task/10-connections, commit e01651c. */
export type FeedConnections = {
  friends: { id: string; name: string }[];
  subscriptions: { placeId: string }[];
};

/**
 * Filter existing public place cards and stories using stable place IDs.
 * Friend publications require an author ID and a server visibility check,
 * neither of which is available on the current main branch.
 */
export function selectSubscribedPlaces(posts: Post[], stories: Story[], connections: FeedConnections) {
  const subscribed = new Set(connections.subscriptions.map(item => item.placeId));
  return {
    posts: posts.filter(post => subscribed.has(post.id)),
    stories: stories.filter(story => subscribed.has(story.postId)),
  };
}
