const db = require('./db');

const postColumns = 'id, user, userAvatar, userHandle, place, image, likes, totalLikes, followers, rating, bio, address, category';

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

async function withDetails(post) {
  const params = [post.id];
  const [gallery, tags, workingHours, reviews, contact] = await Promise.all([
    all('SELECT image_url FROM gallery WHERE post_id = ? ORDER BY display_order', params),
    all('SELECT tag FROM tags WHERE post_id = ?', params),
    all('SELECT label, value FROM working_hours WHERE post_id = ?', params),
    all('SELECT id, author, comment, rating, date FROM reviews WHERE post_id = ?', params),
    all('SELECT label, value, icon FROM contact_info WHERE post_id = ?', params),
  ]);

  return {
    ...post,
    gallery: gallery.map(row => row.image_url),
    tags: tags.map(row => row.tag),
    workingHours,
    reviews,
    contact,
  };
}

module.exports = {
  async getPosts() {
    const posts = await all(`SELECT ${postColumns} FROM posts ORDER BY created_at DESC`);
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
    const [post] = await all(`SELECT ${postColumns} FROM posts WHERE id = ?`, [id]);
    return post ? withDetails(post) : null;
  },
};
