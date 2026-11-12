const db = require('./db');

const postColumns = `p.id, p.user, p.userAvatar, p.userHandle, p.place, p.image,
  (SELECT COUNT(*) FROM place_likes l WHERE l.post_id=p.id) AS likes,
  (SELECT COUNT(*) FROM place_likes l WHERE l.post_id=p.id) AS totalLikes,
  p.followers, COALESCE((SELECT AVG(r.rating) FROM place_ratings r WHERE r.post_id=p.id), 0) AS rating,
  (SELECT COUNT(*) FROM place_ratings r WHERE r.post_id=p.id) AS ratingCount,
  p.bio, p.address, p.category`;

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

async function withDetails(post) {
  const params = [post.id];
  const [gallery, tags, workingHours, reviews, contact, pricing] = await Promise.all([
    all('SELECT image_url FROM gallery WHERE post_id = ? ORDER BY display_order', params),
    all('SELECT tag FROM tags WHERE post_id = ?', params),
    all('SELECT label, value FROM working_hours WHERE post_id = ? ORDER BY id', params),
    // Initial demo reviews have fixed IDs and are examples, not user-submitted feedback.
    all(`SELECT id, author, comment, rating, date FROM reviews WHERE post_id = ? AND NOT (
      (post_id='1' AND id IN ('r1','r2')) OR (post_id='2' AND id IN ('r3','r4')) OR
      (post_id='3' AND id IN ('r5','r6')) OR (post_id='4' AND id IN ('r7','r8')) OR
      (post_id='5' AND id IN ('r9','r10')) OR (post_id='6' AND id IN ('r11','r12')) OR
      (post_id='7' AND id IN ('r13','r14')))`, params),
    all('SELECT label, value, icon FROM contact_info WHERE post_id = ?', params),
    all('SELECT entry_type AS entryType, entry_price AS entryPrice, spend_min AS spendMin, spend_max AS spendMax, source, updated_at AS updatedAt FROM place_pricing WHERE post_id = ?', params),
  ]);

  return {
    ...post,
    gallery: gallery.map(row => row.image_url),
    tags: tags.map(row => row.tag),
    workingHours,
    reviews,
    contact,
    pricing: pricing[0] || null,
  };
}

module.exports = {
  async getPosts() {
    const posts = await all(`SELECT ${postColumns} FROM posts p ORDER BY p.created_at DESC`);
    const completePosts = [];
    for (const post of posts) {
      try {
        completePosts.push(await withDetails(post));
      } catch (error) {
        console.error(`Не удалось загрузить данные места ${post.id}`, error);
      }
    }
    return completePosts;
  },

  getStories() {
    return all(`
      SELECT id, userName, avatar, image, text, post_id AS postId
      FROM stories ORDER BY created_at DESC
    `);
  },

  async getPostById(id) {
    const [post] = await all(`SELECT ${postColumns} FROM posts p WHERE p.id = ?`, [id]);
    return post ? withDetails(post) : null;
  },
};
