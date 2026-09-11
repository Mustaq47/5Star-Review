const bcrypt = require('bcryptjs');
const db = require('./db/setup');

const existing = db.prepare('SELECT * FROM admins WHERE email = ?').get('admin@reviewpro.in');
if (!existing) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admins (email, password) VALUES (?, ?)').run('admin@reviewpro.in', hash);
  console.log('Admin created: admin@reviewpro.in / admin123');
} else {
  console.log('Admin already exists');
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
  console.log('Cool & Spicy created: /r/cool-and-spicy');
}

const demo = db.prepare("SELECT * FROM clients WHERE slug = 'spice-garden-nellore'").get();
if (!demo) {
  const tags = JSON.stringify([
    { l: 'Biryani must-try', t: 'The biryani is exceptional — perfectly spiced and aromatic.' },
    { l: 'Fresh ingredients', t: 'Every dish uses visibly fresh, quality ingredients.' },
    { l: 'Fast service', t: 'Service was impressively quick without cutting corners.' },
    { l: 'Great value', t: 'Outstanding value — generous portions at fair prices.' },
    { l: 'Clean and cozy', t: 'The space is spotless and has a really warm atmosphere.' },
    { l: 'Authentic taste', t: 'Genuinely authentic South Indian flavours — rare to find.' },
  ]);
  db.prepare('INSERT INTO clients (slug,business_name,category,description,emoji,place_id,primary_color,tags) VALUES (?,?,?,?,?,?,?,?)')
    .run('spice-garden-nellore','Spice Garden','South Indian · Nellore',
      'Authentic dosas, biryanis and regional thalis crafted fresh daily. A Nellore staple since 2012.',
      '🍜','ChIJN1t_tDeuEmsRUsoyG83frY4','#7c4dff',tags);
  console.log('Spice Garden (demo) created: /r/spice-garden-nellore');
}

console.log('\nDone. Run: node server.js\n');
