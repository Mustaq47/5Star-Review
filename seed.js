require('dotenv').config();
const bcrypt = require('bcryptjs');
const {
  getAdminByEmail,
  createAdmin,
  getClientBySlug,
  createClient
} = require('./db/firestore');

async function seed() {
  console.log('Seeding Firestore database...');

  // 1. Seed Admin
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@reviewpro.in';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const existingAdmin = await getAdminByEmail(adminEmail);
  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPass, 10);
    await createAdmin(adminEmail, hash);
    console.log(`✅ Admin created: ${adminEmail} / ${adminPass}`);
  } else {
    console.log(`ℹ️ Admin already exists: ${adminEmail}`);
  }

  // 2. Seed Cool & Spicy
  const coolSpicy = await getClientBySlug('cool-and-spicy');
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
    await createClient({
      slug: 'cool-and-spicy',
      business_name: 'Cool & Spicy',
      category: "Ice Creams · Milk Shakes · Pizza's · Fried Chicken",
      description: "Nellore's favourite spot for ice creams, thick milkshakes, pizzas and crispy fried chicken. Stunning fairy-light ambience on Bombay Road, Buchireddypalem.",
      emoji: '/images/cool-and-spicy-logo-emblem.png',
      place_id: 'ChIJDdS5HHKTTDoRupO5zg6UVNg',
      primary_color: '#ff1e27',
      primary_theme: 'dark',
      allow_theme_toggle: 1,
      tags
    });
    console.log('✅ Cool & Spicy created: /r/cool-and-spicy');
  } else {
    console.log('ℹ️ Cool & Spicy already exists');
  }

  // 3. Seed Demo Client (Spice Garden)
  const demo = await getClientBySlug('spice-garden-nellore');
  if (!demo) {
    const tags = JSON.stringify([
      { l: 'Biryani must-try', t: 'The biryani is exceptional — perfectly spiced and aromatic.' },
      { l: 'Fresh ingredients', t: 'Every dish uses visibly fresh, quality ingredients.' },
      { l: 'Fast service', t: 'Service was impressively quick without cutting corners.' },
      { l: 'Great value', t: 'Outstanding value — generous portions at fair prices.' },
      { l: 'Clean and cozy', t: 'The space is spotless and has a really warm atmosphere.' },
      { l: 'Authentic taste', t: 'Genuinely authentic South Indian flavours — rare to find.' },
    ]);
    await createClient({
      slug: 'spice-garden-nellore',
      business_name: 'Spice Garden',
      category: 'South Indian · Nellore',
      description: 'Authentic dosas, biryanis and regional thalis crafted fresh daily. A Nellore staple since 2012.',
      emoji: '🍜',
      place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      primary_color: '#7c4dff',
      primary_theme: 'dark',
      allow_theme_toggle: 1,
      tags
    });
    console.log('✅ Spice Garden (demo) created: /r/spice-garden-nellore');
  } else {
    console.log('ℹ️ Spice Garden already exists');
  }

  // 4. Seed KFC Client
  const kfc = await getClientBySlug('kfc');
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
    await createClient({
      slug: 'kfc',
      business_name: 'KFC',
      category: 'Burgers · Fried Chicken · Fast Food',
      description: "World-famous Hot & Crispy fried chicken, signature Zinger burgers, crispy fries and chilled beverages prepared fresh.",
      emoji: '🍗',
      place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      primary_color: '#e4002b',
      primary_theme: 'dark',
      allow_theme_toggle: 1,
      tags: kfcTags
    });
    console.log('✅ KFC created: /r/kfc');
  } else {
    console.log('ℹ️ KFC already exists');
  }

  console.log('\nSeed completed successfully.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
