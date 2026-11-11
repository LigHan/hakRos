const path = require('node:path');
const sqlite3 = require('sqlite3');
const seedDemoData = require('./seed');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.db');
const opened = Promise.withResolvers();
const db = new sqlite3.Database(dbPath, error => {
  if (error) opened.reject(error);
  else opened.resolve();
});

const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    surname TEXT,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'company')),
    avatar TEXT
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    userAvatar TEXT NOT NULL,
    userHandle TEXT NOT NULL,
    place TEXT NOT NULL,
    image TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    totalLikes INTEGER DEFAULT 0,
    followers INTEGER DEFAULT 0,
    rating REAL DEFAULT 0,
    bio TEXT,
	  address TEXT,
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL,
    image_url TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS working_hours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    author TEXT NOT NULL,
    comment TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    date TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS contact_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    icon TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    userName TEXT NOT NULL,
    avatar TEXT NOT NULL,
    image TEXT NOT NULL,
    text TEXT NOT NULL,
    post_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
  );`;

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, error => error ? reject(error) : resolve());
  });
}

function countPosts() {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) AS count FROM posts', (error, row) => {
      if (error) reject(error);
      else resolve(row.count);
    });
  });
}

async function initialize() {
  await exec(schema);
  await exec('BEGIN IMMEDIATE');
  try {
    const columns = await new Promise((resolve, reject) => {
      db.all('PRAGMA table_info(users)', (error, rows) => error ? reject(error) : resolve(rows));
    });
    if (!columns.some(column => column.name === 'avatar')) await exec('ALTER TABLE users ADD COLUMN avatar TEXT');
    if (await countPosts() === 0) {
      await exec(`
        DELETE FROM contact_info;
        DELETE FROM reviews;
        DELETE FROM working_hours;
        DELETE FROM tags;
        DELETE FROM gallery;
        DELETE FROM stories;
      `);
      await seedDemoData(db);
    }
    await exec('COMMIT');
  } catch (error) {
    await exec('ROLLBACK');
    throw error;
  }
}

db.ready = opened.promise.then(initialize);
module.exports = db;
