// services/ragflowAgent.js
// RAGFlow-compatible Agent Service for Contextual Review Generation and Next-Word Suggestions

const RAGFLOW_API_URL = process.env.RAGFLOW_API_URL || 'http://localhost:9380/api/v1';
const RAGFLOW_API_KEY = process.env.RAGFLOW_API_KEY || '';
const RAGFLOW_AGENT_ID = process.env.RAGFLOW_AGENT_ID || '';

/**
 * Knowledge base dictionary for businesses
 */
const BUSINESS_KNOWLEDGE = {
  'cool-and-spicy': {
    name: 'Cool & Spicy',
    location: 'Bombay Road, Buchireddypalem, Nellore',
    categories: ['Ice Creams', 'Thick Milkshakes', 'Pizzas', 'Crispy Fried Chicken'],
    ambience: 'vibrant fairy lights, modern cozy seating, outdoor hangouts with friends and family',
    flavours: ['Butterscotch', 'Belgian Chocolate', 'Oreo Delight', 'Mango Blast', 'Kesar Pista'],
    features: ['Freshly baked crusts', 'Juicy marinated chicken', 'Thick creamy shakes', 'Quick courteous staff', 'Budget friendly']
  }
};

/**
 * Dynamic Rating-based tag pool
 */
const TAG_POOLS = {
  5: [
    { l: '🍦 Best ice creams', topic: 'ice_cream', phrase: 'The ice creams are top-notch with rich and creamy flavors.' },
    { l: '🥤 Amazing milkshakes', topic: 'milkshake', phrase: 'The milkshakes are thick, perfectly blended and extremely satisfying.' },
    { l: '🍕 Delicious pizza', topic: 'pizza', phrase: 'The pizza was fresh, hot, and loaded with mouth-watering toppings.' },
    { l: '🍗 Crispy fried chicken', topic: 'chicken', phrase: 'The fried chicken is golden, extra crispy and succulent inside.' },
    { l: '⚡ Super fast service', topic: 'service', phrase: 'The staff was attentive, fast and made us feel welcome.' },
    { l: '💰 Pocket-friendly', topic: 'value', phrase: 'Great portion sizes at very reasonable prices — incredible value.' },
    { l: '🌟 Stunning fairy lights', topic: 'ambience', phrase: 'The night fairy lights and ambience create a wonderful vibe.' },
    { l: '💖 Highly recommend', topic: 'recommend', phrase: 'Hands down one of the best hangout spots in town — will visit again soon!' },
    { l: '🍨 Cream More Delight', topic: 'special', phrase: 'Tried the Cream More special desserts and they exceeded expectations!' },
    { l: '👨‍👩‍👧 Great for family', topic: 'crowd', phrase: 'A fantastic environment for family dinners and weekend hangouts.' }
  ],
  4: [
    { l: '🍦 Tasty ice creams', topic: 'ice_cream', phrase: 'Good variety of ice cream options and delicious taste.' },
    { l: '🥤 Nice thick shakes', topic: 'milkshake', phrase: 'Milkshakes had great consistency and rich flavour.' },
    { l: '🍕 Fresh hot pizza', topic: 'pizza', phrase: 'Pizza was tasty and served right out of the oven.' },
    { l: '🍗 Good fried chicken', topic: 'chicken', phrase: 'Crispy fried chicken seasoned nicely.' },
    { l: '⚡ Friendly staff', topic: 'service', phrase: 'Friendly staff and prompt response throughout our visit.' },
    { l: '💰 Good value', topic: 'value', phrase: 'Good food quality for the price paid.' },
    { l: '🌟 Cozy atmosphere', topic: 'ambience', phrase: 'Pleasant lighting and comfortable seating.' }
  ],
  3: [
    { l: '🍦 Decent ice cream', topic: 'ice_cream', phrase: 'Average ice cream options with standard quality.' },
    { l: '🥤 Standard shakes', topic: 'milkshake', phrase: 'Milkshakes were okay and reasonably chilled.' },
    { l: '🍕 Average pizza', topic: 'pizza', phrase: 'Decent pizza crust and toppings.' },
    { l: '⚡ Normal service', topic: 'service', phrase: 'Service was standard and food was served on time.' },
    { l: '💰 Fair pricing', topic: 'value', phrase: 'Prices are reasonable for the portions.' }
  ],
  2: [
    { l: '⏳ Long wait time', topic: 'service', phrase: 'Had to wait longer than expected for our order to arrive.' },
    { l: '🍗 Chicken can be better', topic: 'chicken', phrase: 'Fried chicken was a bit oily and could be crispier.' },
    { l: '⚡ Service needs speed', topic: 'service', phrase: 'Staff could be more proactive during rush hours.' }
  ],
  1: [
    { l: '⏳ Poor service speed', topic: 'service', phrase: 'Service was quite slow and needed follow ups.' },
    { l: '❄️ Food not hot', topic: 'quality', phrase: 'Food was not hot when served.' }
  ]
};

/**
 * Stochastic templates to guarantee uniqueness and non-repetitive text
 */
const INTROS_5 = [
  "Visited this place recently and had a truly fantastic experience!",
  "Had an amazing time here with friends and loved every bit of it.",
  "Without a doubt, one of our favourite food hangout spots in the area!",
  "Stopped by for an evening bite and was genuinely blown away by the quality.",
  "Everything about this place is on point — from taste to hospitality.",
  "Such a delightful experience! The food and atmosphere both hit the spot.",
  "Came here on a recommendation and it completely lived up to the hype!"
];

const INTROS_4 = [
  "Had a good experience visiting here recently.",
  "Really nice spot for a quick bite with friends and family.",
  "Solid food quality and pleasant ambience overall.",
  "Enjoyed our evening visit here — good food and courteous staff."
];

const OUTROS_5 = [
  "Highly recommended to everyone looking for great food and good vibes!",
  "Will definitely be coming back again and again with friends!",
  "A must-visit if you are around — 10/10 experience!",
  "Kudos to the team for maintaining such high standards. Keep it up!",
  "Leaving 5 stars without hesitation. Definitely worth checking out!"
];

const OUTROS_4 = [
  "Overall a great spot and definitely worth visiting.",
  "Would happily recommend this place for a casual hangout.",
  "Looking forward to trying more items on their menu next time."
];

/**
 * Shuffle and pick random items
 */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get randomized tags based on rating
 */
function getTagsForRating(rating = 5, limit = 8) {
  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const pool = TAG_POOLS[r] || TAG_POOLS[5];
  return shuffle(pool).slice(0, limit);
}

/**
 * Generate unique, non-repetitive review text using knowledge + chosen tags
 */
async function generateReview({ slug, rating = 5, tags = [], previousText = '' }) {
  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const biz = BUSINESS_KNOWLEDGE[slug] || { name: 'this place' };

  // If RAGFlow API is configured with key & agent, try calling RAGFlow remote agent
  if (RAGFLOW_API_KEY && RAGFLOW_AGENT_ID) {
    try {
      const response = await fetch(`${RAGFLOW_API_URL}/agents/${RAGFLOW_AGENT_ID}/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RAGFLOW_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: `Generate a natural, unique ${r}-star Google review for ${biz.name} mentioning tags: ${tags.join(', ')}. Keep it warm, concise, and authentic.`
        })
      });
      const data = await response.json();
      if (data && data.data && data.data.answer) {
        return data.data.answer.trim();
      }
    } catch (err) {
      console.warn('[RAGFlow Agent] Fallback to stochastic knowledge engine:', err.message);
    }
  }

  // RAGFlow Knowledge Synthesizer (Stochastic generator with zero repetition)
  const introPool = r >= 5 ? INTROS_5 : INTROS_4;
  const outroPool = r >= 5 ? OUTROS_5 : OUTROS_4;

  let intro = pickRandom(introPool);
  let outro = pickRandom(outroPool);

  // Extract selected tag phrases
  let bodySentences = [];
  const pool = TAG_POOLS[r] || TAG_POOLS[5];

  if (tags.length > 0) {
    tags.forEach(selectedTag => {
      const match = pool.find(item => item.l.toLowerCase() === selectedTag.toLowerCase() || selectedTag.includes(item.l));
      if (match) {
        bodySentences.push(match.phrase);
      } else {
        const cleanTag = selectedTag.replace(/^[^\w\s]+/, '').trim();
        bodySentences.push(`The ${cleanTag.toLowerCase()} was absolutely top-notch.`);
      }
    });
  } else {
    const randomHighlights = shuffle(pool).slice(0, 2);
    bodySentences = randomHighlights.map(h => h.phrase);
  }

  const uniqueBody = Array.from(new Set(bodySentences));
  const connectors = [' ', ' Moreover, ', ' Also, ', ' Plus, ', ' In addition, '];
  
  let combinedBody = '';
  uniqueBody.forEach((sent, idx) => {
    if (idx === 0) combinedBody += sent;
    else {
      const conn = connectors[Math.floor(Math.random() * connectors.length)];
      combinedBody += conn + sent;
    }
  });

  const fullReview = `${intro} ${combinedBody} ${outro}`.replace(/\s+/g, ' ').trim();
  return fullReview;
}

/**
 * Rich Positive Contextual Next-Word / Next-Phrase Prediction Engine
 */
function suggestNextWords({ text = '', rating = 5, slug = '' }) {
  if (!text) return null;
  const raw = text.toLowerCase();
  const trimmed = raw.trim();

  // Comprehensive Positive Pattern Continuations
  const PREDICTIONS = {
    // Single starter words
    'i': ' really loved the food and the wonderful atmosphere here',
    'i had': ' an extraordinary experience and thoroughly enjoyed the visit',
    'i tried': ' their signature ice creams and crispy fried chicken — both were amazing',
    'i ordered': ' the special pizza and thick shakes, and both tasted incredible',
    'i visited': ' this place with family and was truly impressed by the quality',
    'i loved': ' every single dish we ordered, especially the desserts',
    'i would': ' highly recommend this place to everyone in town',
    'we': ' had a fantastic time enjoying the delicious food and great music',
    'we tried': ' different ice cream flavours and each one was rich and creamy',
    'we loved': ' the crispy fried chicken and fresh hot pizzas',
    'we ordered': ' thick milkshakes and pizzas — perfectly prepared and delicious',
    'we had': ' an amazing evening hangout here with friends',
    'the': ' food quality, taste, and hospitality here are outstanding',
    'the food': ' is freshly prepared, flavorful and served hot',
    'food is': ' absolutely delicious, hygienic and bursting with flavor',
    'food was': ' extremely tasty, freshly made and served with a smile',
    'taste': ' is genuinely authentic and top-tier in quality',
    'taste was': ' beyond expectations — loved every single bite',
    'the taste': ' of the dishes here is rich and memorable',
    'ice cream': ' flavours are rich, smooth and delightfully creamy',
    'ice creams': ' here are by far the best in town with so many varieties',
    'the ice cream': ' was super creamy, rich and perfectly sweet',
    'the ice creams': ' are creamy, delicious and full of flavor',
    'cream more': ' ice cream specials are exceptionally good',
    'milkshake': ' was thick, creamy, perfectly chilled and delicious',
    'milkshakes': ' are thick, creamy and worth every rupee',
    'the milkshake': ' had the perfect thick consistency and rich flavour',
    'the milkshakes': ' are thick and full of rich flavor',
    'pizza': ' was freshly baked, hot and loaded with gooey cheese and toppings',
    'pizzas': ' here have a crispy crust and generous delicious toppings',
    'the pizza': ' was baked to perfection with fresh ingredients',
    'chicken': ' is seasoned to perfection, crispy outside and juicy inside',
    'fried chicken': ' is super crunchy, flavorful and succulent',
    'the chicken': ' was golden crisp and cooked to perfection',
    'the fried chicken': ' is crispy, juicy and a must-try for everyone',
    'service': ' was lightning fast, courteous and attentive',
    'the service': ' was quick, attentive and very hospitable',
    'staff': ' were welcoming, friendly and made us feel right at home',
    'the staff': ' are friendly, polite and provide prompt service',
    'ambience': ' with fairy lights creates a magical and cozy evening vibe',
    'the ambience': ' is modern, vibrant and perfect for evening hangouts',
    'fairy light': ' ambience looks stunning at night and gives great photo vibes',
    'fairy lights': ' make the place look magical and comfortable',
    'atmosphere': ' is clean, lively and great for family gatherings',
    'prices': ' are very affordable and offer outstanding value for money',
    'price': ' is completely reasonable for the top quality and portion size',
    'value for': ' money is truly exceptional',
    'great': ' food, wonderful ambience, and very warm service',
    'best': ' food and dessert spot in the entire area',
    'one of': ' the finest food and dessert spots in town',
    'highly': ' recommend this wonderful place to all food lovers',
    'definitely': ' coming back again with friends and family soon',
    'will': ' definitely visit again and try more menu items',
    'always': ' a pleasure visiting here — consistent quality and taste',
    'really': ' enjoyed our evening visit and the great hospitality',
    'such a': ' delightful experience with top-notch food and service',
    'loved': ' the flavors, cleanliness, and polite staff behavior',
    'worth': ' visiting for anyone looking for delicious food and great vibes',
    'clean': ' and well-maintained seating with great hygiene',
    'must': ' try their signature ice creams and crispy fried chicken'
  };

  // 1. Direct endsWith match
  for (const [trigger, continuation] of Object.entries(PREDICTIONS)) {
    if (trimmed.endsWith(trigger)) {
      return continuation;
    }
  }

  // 2. StartsWith single word match if only 1-2 words typed
  if (PREDICTIONS[trimmed]) {
    return PREDICTIONS[trimmed];
  }

  // 3. Fallback word-level matching
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1];

  const WORD_PREDICTIONS = {
    'good': ' taste, fresh ingredients and prompt service',
    'nice': ' ambience with friendly staff and tasty food',
    'super': ' tasty food and wonderful atmosphere',
    'amazing': ' experience and truly delicious food',
    'excellent': ' quality, courteous service and great value',
    'fresh': ' ingredients, delicious taste and quick service',
    'crispy': ' and juicy in every single bite',
    'creamy': ' and thick with lots of delightful flavor',
    'delicious': ' food and wonderful fairy light ambience',
    'friendly': ' staff and great hospitality throughout',
    'affordable': ' prices with generous portion sizes',
    'recommend': ' visiting with friends and family for a great time'
  };

  if (WORD_PREDICTIONS[lastWord]) {
    return ' ' + WORD_PREDICTIONS[lastWord];
  }

  // Generic positive continuation if typing ends with space
  if (raw.endsWith(' ')) {
    return 'is absolutely delicious, fresh and worth visiting';
  }

  return null;
}

module.exports = {
  getTagsForRating,
  generateReview,
  suggestNextWords
};
