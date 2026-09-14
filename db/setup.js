const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let dbPath = path.join(__dirname, '..', 'reviewpro.db');

if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  const mountDir = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  try {
    if (!fs.existsSync(mountDir)) {
      fs.mkdirSync(mountDir, { recursive: true });
    }
  } catch (e) {
    console.warn('Volume directory create notice:', e.message);
  }
  dbPath = path.join(mountDir, 'reviewpro.db');
} else if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const tmpDb = '/tmp/reviewpro.db';
  try {
    if (!fs.existsSync(tmpDb)) {
      const candidates = [
        path.join(process.cwd(), 'reviewpro.db'),
        path.join(__dirname, '..', 'reviewpro.db'),
        path.join(__dirname, 'reviewpro.db')
      ];
      for (const src of candidates) {
        if (fs.existsSync(src)) {
          try {
            fs.copyFileSync(src, tmpDb);
            break;
          } catch (copyErr) {}
        }
      }
    }
    dbPath = tmpDb;
  } catch (err) {
    console.warn('Vercel tmp DB copy notice:', err.message);
    dbPath = tmpDb;
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
      { l: '🍗 Crispy Fried Chicken', t: 'The Hot & Crispy fried chicken was super crunchy on the outside, juicy inside, and served fresh. | The fried chicken was piping hot with the absolute best crunch and seasoning. | The chicken tenders and wings were golden, crisp, and succulent. | Loved the crispy chicken — tender, juicy, and packed with authentic spices. | The fried chicken bucket was freshly fried with unbeatable crunch in every bite.' },
      { l: '🍔 Zinger Burger', t: 'The Zinger burger had the perfect spicy crunch, fresh lettuce, and soft toasted buns. | The burger was super fresh, delightfully juicy, and packed with flavor. | The spicy chicken burger hit the spot with its bold taste and crunchy bite. | Loved the burger patty — thick, crispy on the outside, and very juicy. | The zinger burger was loaded with flavor and had a fantastic crunch.' },
      { l: '🍟 Peri Peri Fries', t: 'The fries were piping hot, crisp, and dusted with flavorful peri peri seasoning. | The French fries had the perfect golden crispiness and generous seasoning. | The peri peri fries were spicy, tangy, and super addictive. | Loved the crunchy texture and bold peri peri flavor on the fries. | The fries arrived fresh from the fryer with a satisfying crunch.' },
      { l: '🥤 Chilled Krushers', t: 'The beverages were refreshing, perfectly chilled, and complemented the meal wonderfully. | The thick shakes had fantastic consistency and rich creamy taste. | Loved the chilled drinks and Krushers — served at the perfect temperature. | The thick milkshakes were velvety smooth and loaded with authentic flavor. | The cold drinks and Krushers were a great thirst-quencher with the spicy food.' },
      { l: '⚡ Fast service', t: 'Order was prepared quickly, and the counter staff were courteous and efficient. | The counter service was exceptionally prompt and the staff were warmly welcoming. | Quick, smooth, and hassle-free service from the moment we walked in. | Staff was friendly, helpful with recommendations, and served with a smile. | The service was lightning fast even during peak rush hours.' },
      { l: '✨ Clean & hygienic', t: 'The dining area and counters were spotless, following excellent hygiene standards. | Super clean tables, sanitized dining space, and pristine surroundings. | The entire space was remarkably neat, well-maintained, and hygienic. | Impressed by how clean and well-kept the dining hall and counters were. | Spotless presentation, clean trays, and very pleasant atmosphere.' },
      { l: '👨‍👩‍👧 Family friendly', t: 'A comfortable, spacious environment for a quick bite with friends and family. | Very welcoming and family-friendly setting with great comfortable seating. | Spacious and relaxed vibe, making it perfect for group hangouts and gatherings. | Cozy and inviting ambience with pleasant lighting and good music. | The atmosphere is lively, upbeat, and wonderful for an evening meal.' },
      { l: '💖 10/10 Taste', t: 'Consistent 5-star quality and delicious flavors as always — highly recommended! | Food tasted absolutely delicious, fresh, and bursting with flavor. | Incredible flavor profile and premium quality in every single bite. | Everything we ordered was cooked to perfection and tasted fantastic. | Truly delicious flavors that make you want to order more.' }
    ]);
    db.prepare('INSERT INTO clients (slug,business_name,category,description,emoji,place_id,primary_color,tags) VALUES (?,?,?,?,?,?,?,?)')
      .run('kfc', 'KFC', 'Fried Chicken · Burgers · Fast Food · Beverages',
        'World-famous crispy fried chicken, iconic zinger burgers, and flavorful sides.',
        '/images/kfc-logo.png', 'ChIJSR5xcaqZyzsRfF2z6F6TLtI', '#e4002b', kfcTags);
  }
} catch (e) {
  console.error('Auto-seed error:', e);
}

module.exports = db;
