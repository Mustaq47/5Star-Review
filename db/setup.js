const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let dbPath = path.join(__dirname, '..', 'reviewpro.db');

if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  dbPath = path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'reviewpro.db');
} else if (process.env.VERCEL) {
  const tmpDb = '/tmp/reviewpro.db';
  try {
    if (!fs.existsSync(tmpDb)) {
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, tmpDb);
      }
    }
    dbPath = tmpDb;
  } catch (err) {
    console.error('Vercel tmp DB copy error:', err);
  }
}

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    business_name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    emoji TEXT DEFAULT '🏪',
    place_id TEXT NOT NULL,
    primary_color TEXT DEFAULT '#7c4dff',
    primary_theme TEXT DEFAULT 'dark',
    allow_theme_toggle INTEGER DEFAULT 1,
    tags TEXT DEFAULT '[]',
    active INTEGER DEFAULT 1,
    expires_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pageviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS review_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  -- ═══════════════════════════════════════════════════════════════
  -- AI REVIEW MEMORY SYSTEM
  -- Stores generated reviews with embeddings for semantic similarity
  -- ═══════════════════════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS review_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    tags TEXT DEFAULT '[]',
    review_text TEXT NOT NULL,
    embedding TEXT NOT NULL,  -- JSON array of 768-dim Gemini embeddings
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  -- Index for fast similarity searches
  CREATE INDEX IF NOT EXISTS idx_review_memory_client ON review_memory(client_id);
`);

// Migrations: add columns if missing
try {
  db.exec("ALTER TABLE clients ADD COLUMN expires_at DATETIME DEFAULT NULL;");
} catch (e) {}
try {
  db.exec("ALTER TABLE clients ADD COLUMN primary_theme TEXT DEFAULT 'dark';");
} catch (e) {}
try {
  db.exec("ALTER TABLE clients ADD COLUMN allow_theme_toggle INTEGER DEFAULT 1;");
} catch (e) {}

// Auto-seed default admin if database is new
try {
  const existing = db.prepare('SELECT * FROM admins WHERE email = ?').get('admin@reviewpro.in');
  if (!existing) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO admins (email, password) VALUES (?, ?)').run('admin@reviewpro.in', hash);
  }

  const coolSpicy = db.prepare("SELECT * FROM clients WHERE slug = 'cool-and-spicy'").get();
  if (!coolSpicy) {
    const tags = JSON.stringify([
      { l: '🍦 Best ice creams', t: 'The ice creams here are absolutely amazing — so many incredible flavours!' },
      { l: '🥤 Amazing milkshakes', t: 'The milkshakes are thick, creamy and totally worth every rupee.' },
      { l: '🍕 Delicious pizza', t: 'Pizza was fresh, cheesy and perfectly baked — loved every single bite.' },
      { l: '🍗 Crispy fried chicken', t: 'The fried chicken is super crispy outside and juicy inside — a must-try!' },
      { l: '⚡ Fast service', t: 'Service was quick and the staff were very friendly and welcoming.' },
      { l: '💰 Pocket-friendly', t: 'Great food at very affordable prices — outstanding value for money.' },
      { l: '🌟 Amazing ambience', t: 'The fairy light ambience is stunning — perfect for hangouts with family and friends.' },
      { l: '👍 Highly recommend', t: 'Highly recommend Cool & Spicy to anyone looking for a fun and delicious experience!' },
    ]);
    db.prepare('INSERT INTO clients (slug,business_name,category,description,emoji,place_id,primary_color,tags) VALUES (?,?,?,?,?,?,?,?)')
      .run('cool-and-spicy','Cool & Spicy','Ice Creams · Milk Shakes · Pizza\'s · Fried Chicken',
        "Nellore's favourite spot for ice creams, thick milkshakes, pizzas and crispy fried chicken. Stunning fairy-light ambience on Bombay Road, Buchireddypalem.",
        '/images/cool-and-spicy-logo-emblem.png','ChIJDdS5HHKTTDoRupO5zg6UVNg','#ff1e27',tags);
  }

  const kfc = db.prepare("SELECT * FROM clients WHERE slug = 'kfc'").get();
  if (!kfc) {
    const kfcTags = JSON.stringify([
      { l: '🍗 Crispy Fried Chicken', t: 'The Hot & Crispy fried chicken was super crunchy on the outside, juicy inside, and served fresh.' },
      { l: '🍔 Zinger Burger', t: 'The Zinger burger had the perfect spicy crunch, fresh lettuce, and soft toasted buns.' },
      { l: '🍟 Peri Peri Fries', t: 'The fries were piping hot, crisp, and dusted with flavorful peri peri seasoning.' },
      { l: '🥤 Chilled Krushers', t: 'The beverages were refreshing, perfectly chilled, and complemented the meal wonderfully.' },
      { l: '⚡ Fast service', t: 'Order was prepared quickly, and the counter staff were courteous and efficient.' },
      { l: '✨ Clean & hygienic', t: 'The dining area and counters were spotless, following excellent hygiene standards.' },
      { l: '👨‍👩‍👧 Family friendly', t: 'A comfortable, spacious environment for a quick bite with friends and family.' },
      { l: '💖 10/10 Taste', t: 'Consistent 5-star quality and delicious flavors as always — highly recommended!' }
    ]);
    db.prepare('INSERT INTO clients (slug,business_name,category,description,emoji,place_id,primary_color,tags) VALUES (?,?,?,?,?,?,?,?)')
      .run('kfc', 'KFC', 'Fried Chicken · Burgers · Fast Food · Beverages',
        'World-famous crispy fried chicken, iconic zinger burgers, and flavorful sides.',
        '/images/kfc-logo.png', 'ChIJX5u0_4uxSDsR83qK6Qy1k0s', '#e4002b', kfcTags);
  }
} catch (e) {
  console.error('Auto-seed error:', e);
}

module.exports = db;
