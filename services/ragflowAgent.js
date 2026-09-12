// services/ragflowAgent.js
// Advanced AI Review Synthesis & Contextual Multi-Word Next-Phrase Prediction Engine

const RAGFLOW_API_URL = process.env.RAGFLOW_API_URL || 'http://localhost:9380/api/v1';
const { suggestWithGemini, getSuggestedSuggestion, isEnhancing } = require('./geminiAgent');

const RAGFLOW_API_KEY = process.env.RAGFLOW_API_KEY || '';
const RAGFLOW_AGENT_ID = process.env.RAGFLOW_AGENT_ID || '';

/**
 * Enriched Business Knowledge Graph
 */
const BUSINESS_KNOWLEDGE = {
  'cool-and-spicy': {
    name: 'Cool & Spicy',
    location: 'Bombay Road, Buchireddypalem, Nellore',
    categories: ['Ice Creams', 'Thick Milkshakes', 'Pizzas', 'Crispy Fried Chicken', 'Desserts', 'Snacks'],
    dishes: [
      'Belgian Chocolate Ice Cream',
      'Butterscotch Sundae',
      'Cream More Delight',
      'KitKat Thick Shake',
      'Oreo Blast Shake',
      'Crispy Fried Chicken Bucket',
      'Farmhouse Cheese Pizza',
      'Peri Peri Paneer Pizza',
      'Spicy Chicken Wings'
    ],
    ambience: 'vibrant fairy lights, cozy family atmosphere, spacious outdoor seating',
    vibes: ['family dinner', 'friends hangout', 'evening dessert date', 'weekend food trip'],
    strengths: ['rich authentic taste', 'clean and hygienic kitchen', 'generous portion size', 'quick courteous service', 'unbeatable value for money']
  }
};

/**
 * Dynamic Rating Tag Pools by Category Facet
 */
const TAG_POOLS = {
  5: [
    { l: '🍦 Best ice creams', topic: 'ice_cream', phrase: 'The ice creams are exquisitely creamy, rich, and full of delightful flavours.' },
    { l: '🥤 Amazing milkshakes', topic: 'milkshake', phrase: 'The thick milkshakes are perfectly blended and an absolute treat.' },
    { l: '🍕 Delicious pizza', topic: 'pizza', phrase: 'The pizzas are freshly baked with a golden crispy crust and plenty of cheese.' },
    { l: '🍗 Crispy fried chicken', topic: 'chicken', phrase: 'The fried chicken is crispy on the outside, tender and juicy inside.' },
    { l: '⚡ Lightning fast service', topic: 'service', phrase: 'The service is exceptionally prompt, and the staff are warmly welcoming.' },
    { l: '💰 Pocket-friendly', topic: 'value', phrase: 'Generous portions at very reasonable prices — outstanding value.' },
    { l: '🌟 Fairy light ambience', topic: 'ambience', phrase: 'The night fairy lights and vibrant ambience create a wonderful cozy vibe.' },
    { l: '🍨 Cream More Delight', topic: 'signature', phrase: 'The Cream More special desserts and sundaes are top-notch and a must-try.' },
    { l: '💖 Highly recommend', topic: 'recommend', phrase: 'Hands down one of the finest food and dessert spots in town — 10/10 experience!' },
    { l: '👨‍👩‍👧 Perfect for family', topic: 'crowd', phrase: 'A wonderful, clean environment for family gatherings and evening hangouts.' }
  ],
  4: [
    { l: '🍦 Tasty ice creams', topic: 'ice_cream', phrase: 'Good variety of ice cream options and delicious taste.' },
    { l: '🥤 Delicious shakes', topic: 'milkshake', phrase: 'Milkshakes had great consistency and rich flavour.' },
    { l: '🍕 Fresh hot pizza', topic: 'pizza', phrase: 'Pizza was tasty and served fresh out of the oven.' },
    { l: '🍗 Good fried chicken', topic: 'chicken', phrase: 'Crispy fried chicken seasoned nicely.' },
    { l: '⚡ Friendly staff', topic: 'service', phrase: 'Friendly staff and prompt response throughout our visit.' },
    { l: '💰 Great value', topic: 'value', phrase: 'Good food quality for the price paid.' },
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
 * Multi-Tone Stochastic Templates (Casual, Foodie, Family, Enthusiast)
 */
const INTRO_TEMPLATES = [
  "Visited this place recently and had a truly fantastic experience!",
  "Had an amazing evening hangout here and loved every single bit of it.",
  "Without a doubt, one of our absolute favourite food spots in the area!",
  "Stopped by for dessert and snacks, and was genuinely blown away by the quality.",
  "Everything about this spot is on point — from fresh taste to great hospitality.",
  "Such a delightful experience! The food, drinks, and atmosphere all hit the spot.",
  "Came here on a friend's recommendation and it completely lived up to the hype!",
  "An exceptional place that never fails to deliver high quality and great taste."
];

const OUTRO_TEMPLATES = [
  "Highly recommended to everyone looking for great food, desserts, and good vibes!",
  "Will definitely be coming back again and again with friends and family!",
  "A must-visit if you are in the area — easily a 5-star experience!",
  "Kudos to the entire team for maintaining such high food standards and great service.",
  "Leaving 5 stars without hesitation. Definitely worth checking out!",
  "One of the best dining experiences around — keep up the fantastic work!"
];

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
 * Get dynamic randomized tags based on rating
 */
function getTagsForRating(rating = 5, limit = 8) {
  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const pool = TAG_POOLS[r] || TAG_POOLS[5];
  return shuffle(pool).slice(0, limit);
}

/**
 * Advanced AI Review Synthesis with Dynamic Knowledge Infusion
 */
async function generateReview({ slug, rating = 5, tags = [], previousText = '' }) {
  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const biz = BUSINESS_KNOWLEDGE[slug] || { name: 'this place', dishes: [] };

  // 1. RAGFlow Remote Agent Protocol (when active)
  if (RAGFLOW_API_KEY && RAGFLOW_AGENT_ID) {
    try {
      const response = await fetch(`${RAGFLOW_API_URL}/agents/${RAGFLOW_AGENT_ID}/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RAGFLOW_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: `Generate a natural, enthusiastic ${r}-star Google review for ${biz.name} mentioning tags: ${tags.join(', ')}. Keep it warm, realistic, concise, and non-repetitive.`
        })
      });
      const data = await response.json();
      if (data && data.data && data.data.answer) {
        return data.data.answer.trim();
      }
    } catch (err) {
      console.warn('[RAGFlow Agent Engine] Falling back to local generative synthesizer:', err.message);
    }
  }

  // 2. High-Entropy Semantic Synthesizer
  const intro = pickRandom(INTRO_TEMPLATES);
  const outro = pickRandom(OUTRO_TEMPLATES);

  let bodySentences = [];
  const pool = TAG_POOLS[r] || TAG_POOLS[5];

  if (tags.length > 0) {
    tags.forEach(selectedTag => {
      const match = pool.find(item => item.l.toLowerCase() === selectedTag.toLowerCase() || selectedTag.includes(item.l));
      if (match) {
        bodySentences.push(match.phrase);
      } else {
        const cleanTag = selectedTag.replace(/^[^\w\s]+/, '').trim();
        bodySentences.push(`The ${cleanTag.toLowerCase()} was exceptionally good and made with fresh ingredients.`);
      }
    });
  } else {
    const randomHighlights = shuffle(pool).slice(0, 2);
    bodySentences = randomHighlights.map(h => h.phrase);
  }

  // Inject signature dish if 5 stars
  if (r === 5 && biz.dishes && biz.dishes.length > 0 && Math.random() > 0.4) {
    const dish = pickRandom(biz.dishes);
    bodySentences.push(`Special mention to the ${dish} — completely mouth-watering.`);
  }

  const uniqueBody = Array.from(new Set(bodySentences));
  const connectors = [' ', ' Moreover, ', ' Also, ', ' In addition, ', ' Plus, ', ' On top of that, '];

  let combinedBody = '';
  uniqueBody.forEach((sent, idx) => {
    if (idx === 0) combinedBody += sent;
    else {
      const conn = connectors[Math.floor(Math.random() * connectors.length)];
      combinedBody += conn + sent;
    }
  });

  return `${intro} ${combinedBody} ${outro}`.replace(/\s+/g, ' ').trim();
}

/**
 * Advanced N-Gram & Contextual Multi-Word Next-Prediction Engine
 */
function suggestNextWords({ text = '', rating = 5, slug = '' }) {
  if (!text) {
    return {
      primary: 'I really loved the food, shakes, and wonderful ambience here',
      alternatives: [
        'The ice creams and crispy fried chicken are amazing',
        'Visited with friends and had a fantastic experience',
        'Definitely one of the best food spots in town'
      ]
    };
  }

  const raw = text.toLowerCase();
  const trimmed = raw.trim();

  // Multi-tier Pattern Continuation Table
  const PREDICTIONS = {
    // Single starters
    'i': ' really loved the food and the wonderful fairy light atmosphere here',
    'i had': ' an extraordinary experience and thoroughly enjoyed the delicious food',
    'i tried': ' their signature ice creams and crispy chicken — both were incredible',
    'i ordered': ' the special pizza and thick shakes, and both tasted superb',
    'i visited': ' this place with family and was genuinely impressed by the quality',
    'i loved': ' every single item we ordered, especially the desserts and shakes',
    'i would': ' highly recommend this place to everyone looking for great food',
    'i really': ' enjoyed the warm hospitality and mouth-watering food',

    // Plural / Group
    'we': ' had a fantastic time enjoying the delicious food and great music',
    'we tried': ' different ice cream flavours and each one was rich and creamy',
    'we loved': ' the crispy fried chicken and freshly baked pizzas',
    'we ordered': ' thick milkshakes and pizzas — perfectly prepared and delicious',
    'we had': ' an amazing evening hangout here with friends',

    // Food Items
    'the': ' food quality, taste, and hospitality here are outstanding',
    'the food': ' is freshly prepared, flavorful and served piping hot',
    'food': ' is exceptionally fresh, flavorful and delicious in every bite',
    'food is': ' absolutely delicious, hygienic and bursting with flavor',
    'food was': ' extremely tasty, freshly made and served with a smile',
    'taste': ' is genuinely authentic and top-tier in quality',
    'taste was': ' beyond expectations — loved every single bite',
    'the taste': ' of the dishes here is rich, fresh and memorable',

    // Specific Dishes & Desserts
    'ice cream': ' flavours are rich, smooth and delightfully creamy',
    'ice creams': ' here are by far the best in town with so many varieties',
    'the ice cream': ' was super creamy, rich and perfectly sweet',
    'the ice creams': ' are creamy, delicious and full of flavor',
    'cream more': ' ice cream specials are delightfully rich and flavorful',
    'milkshake': ' was thick, creamy, perfectly chilled and delicious',
    'milkshakes': ' are thick, creamy and worth every rupee',
    'the milkshake': ' had the perfect thick consistency and rich flavour',
    'the milkshakes': ' are thick and full of rich flavor',
    'pizza': ' was freshly baked, hot and loaded with gooey cheese and toppings',
    'pizzas': ' here have a crispy crust and generous delicious toppings',
    'the pizza': ' was baked to perfection with fresh ingredients and great crust',
    'chicken': ' is seasoned to perfection, crispy outside and juicy inside',
    'fried chicken': ' is super crunchy, flavorful and succulent',
    'the chicken': ' was golden crisp and cooked to perfection',
    'the fried chicken': ' is crispy, juicy and a must-try for everyone',

    // Ambience & Service
    'service': ' was lightning fast, courteous and attentive',
    'the service': ' was quick, attentive and very hospitable throughout',
    'staff': ' were welcoming, friendly and made us feel right at home',
    'the staff': ' are friendly, polite and provide prompt service',
    'ambience': ' with fairy lights creates a magical and cozy evening vibe',
    'the ambience': ' is modern, vibrant and perfect for evening hangouts',
    'fairy light': ' ambience looks stunning at night and gives great photo vibes',
    'fairy lights': ' make the place look magical, clean and comfortable',
    'atmosphere': ' is clean, lively and great for family gatherings',
    'clean': ' and well-maintained seating with great hygiene standards',

    // Value & Conclusions
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
    'must': ' try their signature ice creams and crispy fried chicken',
    'worth': ' visiting for anyone looking for delicious food and great vibes'
  };

  // Check direct matches
  for (const [trigger, continuation] of Object.entries(PREDICTIONS)) {
    if (trimmed.endsWith(trigger)) {
      return {
        primary: continuation,
        alternatives: generateAlternatives(trigger)
      };
    }
  }

  // Keyword-based fallback
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
    return {
      primary: ' ' + WORD_PREDICTIONS[lastWord],
      alternatives: [
        ' and perfectly prepared',
        ' with top-notch quality and great taste',
        ' — definitely exceeded all our expectations'
      ]
    };
  }

  // Natural flow continuation
  return {
    primary: 'is absolutely delicious, fresh and worth visiting',
    alternatives: [
      'and the staff were very friendly',
      'with great portions and reasonable pricing',
      'highly recommended to everyone!'
    ]
  };
}

function generateAlternatives(trigger) {
  const ALTS = {
    'i': ['really enjoyed the pizza and shakes', 'tried the ice creams and they were top quality', 'had a wonderful evening dinner here'],
    'the': ['ambience and food here are outstanding', 'service was quick and staff were very polite', 'ice creams are super rich and creamy'],
    'food': ['was fresh and served hot', 'exceeded all our expectations in taste', 'is hygienic, authentic and delicious'],
    'service': ['was super friendly and quick', 'was attentive and courteous', 'was prompt and very helpful']
  };
  return ALTS[trigger] || [
    'was freshly made and super tasty',
    'exceeded all our expectations',
    'is highly recommended to all!'
  ];
}

module.exports = {
  getTagsForRating,
  generateReview,
  suggestNextWords,
  suggestNextWordsAsync
};

/**
 * Gemini-enhanced next-phrase prediction.
 * - When a Gemini result is already cached, returns it instantly (source:gemini).
 * - Otherwise returns the static continuation immediately and signals
 *   `enhancing:true` so the client can poll for the smarter result.
 * - Never throws: any Gemini issue falls back to the static engine.
 */
async function suggestNextWordsAsync({ text = '', rating = 5, slug = '' }) {
  // Empty text keeps the friendly static default (no live API call needed).
  if (!text || !text.trim()) {
    return { source: 'static', enhancing: false, ...suggestNextWords({ text: '', rating, slug }) };
  }

  const input = {
    text: text.trim(),
    rating: parseInt(rating) || 5,
    businessName: (BUSINESS_KNOWLEDGE[slug] || {}).name || '',
    businessType: (BUSINESS_KNOWLEDGE[slug] || {}).categories ? BUSINESS_KNOWLEDGE[slug].categories.join(', ') : '',
    tagLabels: (getTagsForRating(rating, 8) || []).map(t => (typeof t === 'string' ? t : t.label || t.l))
  };

  const base = suggestNextWords({ text, rating, slug });
  const stillEnhancing = isEnhancing(input.text, input.rating, input.businessName, input.businessType, input.tagLabels);

  // Fire the Gemini computation in the background (deduped/cached by key).
  const geminiP = getSuggestedSuggestion(input).catch(() => null);

  // If it resolves "fast" (cached), we can serve it synchronously here.
  let gemini = await Promise.race([
    geminiP,
    new Promise(r => setTimeout(() => r(null), 60))
  ]);

  if (gemini) {
    return {
      source: 'gemini',
      enhancing: false,
      primary: gemini.primary,
      alternatives: gemini.alternatives.length ? gemini.alternatives : base.alternatives
    };
  }

  return {
    source: 'static',
    enhancing: stillEnhancing,
    ...base
  };
}
