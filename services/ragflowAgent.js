// services/ragflowAgent.js
// Next-Gen Context-Aware AI Review & Autocomplete Intelligence Engine
// Now powered by Google Gemini LLM with smart local fallback.

const {
  generateReviewWithGemini,
  generateTagsWithGemini,
  predictWithGemini,
  isGeminiAvailable,
} = require('./geminiAgent');

const RAGFLOW_API_URL = process.env.RAGFLOW_API_URL || 'http://localhost:9380/api/v1';
const { suggestWithGemini, getSuggestedSuggestion, isEnhancing } = require('./geminiAgent');

const RAGFLOW_API_KEY = process.env.RAGFLOW_API_KEY || '';
const RAGFLOW_AGENT_ID = process.env.RAGFLOW_AGENT_ID || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

/**
 * Multi-Domain Semantic Knowledge Base (LOCAL FALLBACK)
 * Used when Gemini is unavailable.
 */
const DOMAIN_LEXICONS = {
  food_dessert: {
    dishes: [
      'Belgian Chocolate Ice Cream', 'KitKat Thick Shake', 'Oreo Blast Shake',
      'Crispy Fried Chicken Bucket', 'Farmhouse Cheese Pizza', 'Peri Peri Paneer Pizza',
      'Spicy Chicken Wings', 'Butterscotch Sundae', 'Cream More Delight',
      'Brownie with Ice Cream', 'Loaded Cheese Garlic Bread', 'Tender Chicken Strips'
    ],
    qualities: ['rich and creamy', 'thick and velvety', 'crispy and succulent', 'freshly baked and piping hot', 'perfectly spiced', 'melt-in-the-mouth', 'flavorful in every bite'],
    ambience: ['fairy lights and cozy seating', 'vibrant evening mood', 'clean and welcoming environment', 'perfect lighting for pictures', 'warm family atmosphere'],
    service: ['lightning fast service', 'extremely polite staff', 'hygienic preparation', 'attentive hospitality', 'spotless clean tables']
  },
  south_indian: {
    dishes: [
      'Crispy Ghee Roast Dosa', 'Podi Idli', 'Nellore Chepala Pulusu',
      'Special Dum Biryani', 'Mutton Fry Biryani', 'Filter Coffee',
      'Curd Rice with Pomegranate', 'Paneer Butter Masala', 'Natukodi Pulusu'
    ],
    qualities: ['authentic regional flavors', 'aromatic spices', 'fresh homemade chutneys', 'steaming hot and fresh', 'generous portion size'],
    ambience: ['traditional warm ambiance', 'comfortable family dining', 'clean and spacious seating'],
    service: ['quick service', 'warm courteous staff', 'authentic hospitality']
  },
  general: {
    dishes: ['Signature Specials', 'Chef Specials', 'Fresh Delicacies', 'Beverages', 'Combo Meals'],
    qualities: ['top-notch quality', 'consistently delicious', 'great portion sizes', 'fresh ingredients', 'unbeatable value'],
    ambience: ['modern cozy vibes', 'relaxing environment', 'great ambience with music', 'clean and well-maintained'],
    service: ['prompt service', 'friendly and helpful staff', 'warm welcome', 'seamless experience']
  }
};

/**
 * Rating-Calibrated Context Transitions
 */
const RATING_CONTEXT_TRANSITIONS = {
  // ── 5 STARS: Glowing, Enthusiastic ──
  5: {
    'i': ['really loved the', 'ordered the', 'tried the', 'highly recommend the'],
    'we': ['loved the', 'ordered the', 'really enjoyed the', 'tried the'],
    'the': ['food was', 'service was', 'crispy chicken was', 'pizza was', 'shakes were', 'staff were', 'ambience was'],
    'food': ['was delicious', 'was super fresh', 'was piping hot', 'tasted amazing'],
    'food was': ['delicious', 'super fresh', 'piping hot and tasty', 'amazing'],
    'pizza was': ['cheesy and hot', 'delicious', 'freshly baked', 'loaded with toppings'],
    'chicken was': ['crispy and juicy', 'super crunchy', 'flavorful and fresh', 'perfect'],
    'ice cream was': ['creamy and rich', 'delicious', 'super refreshing'],
    'shake was': ['thick and chilled', 'creamy and rich', 'refreshing'],
    'service was': ['fast and friendly', 'prompt', 'quick', 'great'],
    'staff were': ['friendly and quick', 'very polite', 'welcoming and helpful'],
    'ambience was': ['cozy and clean', 'wonderful with fairy lights', 'peaceful'],
    'was': ['delicious', 'super fresh', 'piping hot', 'great'],
    'were': ['friendly and polite', 'delicious and fresh', 'super fast'],
    'is': ['fresh and tasty', 'definitely worth visiting', 'top-notch'],
    'are': ['super friendly', 'delicious', 'worth trying'],
    'highly': ['recommend', 'recommend this place', 'appreciate the service'],
    'definitely': ['coming back', 'worth a visit', 'recommending this']
  },

  // ── 4 STARS: Warm, Positive, Good Value ──
  4: {
    'i': ['liked the', 'ordered the', 'enjoyed the'],
    'we': ['had a good time with', 'enjoyed the', 'liked the'],
    'the': ['food was good', 'service was polite', 'pizza was tasty', 'chicken was crispy'],
    'food was': ['good and fresh', 'tasty and hot', 'well prepared'],
    'pizza was': ['fresh and tasty', 'served hot'],
    'chicken was': ['tasty and crispy', 'well seasoned'],
    'service was': ['good and prompt', 'polite and quick'],
    'staff were': ['friendly', 'helpful', 'polite'],
    'ambience was': ['pleasant', 'comfortable and clean'],
    'was': ['good', 'tasty', 'fresh', 'pleasant'],
    'were': ['friendly', 'good in taste'],
    'is': ['good value', 'a nice spot'],
    'highly': ['appreciate the service', 'recommend for a quick bite'],
    'definitely': ['a good spot', 'worth stopping by']
  },

  // ── 3 STARS: Balanced, Average ──
  3: {
    'i': ['thought the food was okay', 'had an average visit'],
    'we': ['found the food average', 'had a standard visit'],
    'the': ['food was okay', 'service was standard', 'wait time was average'],
    'food was': ['okay', 'average in taste', 'decent'],
    'service was': ['average', 'could be faster', 'okay'],
    'staff were': ['busy', 'polite but slow'],
    'was': ['okay', 'average', 'decent'],
    'were': ['okay', 'busy'],
    'is': ['an okay option', 'average'],
    'highly': ['suggest faster service', 'hope for improvement'],
    'definitely': ['has room to improve', 'an average place']
  },

  // ── 1-2 STARS: Constructive Criticism ──
  1: {
    'i': ['was disappointed with the', 'had to wait for'],
    'we': ['waited too long for', 'were not satisfied with'],
    'the': ['wait time was too long', 'service was slow', 'food was lukewarm'],
    'food was': ['below expectations', 'lukewarm', 'bland'],
    'service was': ['slow', 'delayed', 'inattentive'],
    'staff were': ['slow to respond', 'inattentive'],
    'was': ['delayed', 'below average', 'disappointing'],
    'were': ['delayed', 'unresponsive'],
    'is': ['in need of improvement', 'slow'],
    'highly': ['suggest faster turnaround', 'hope service improves'],
    'definitely': ['needs improvement', 'hoping for better next time']
  }
};
RATING_CONTEXT_TRANSITIONS[2] = RATING_CONTEXT_TRANSITIONS[1];

/**
 * Rating-Calibrated Word Prefix Dictionary (Snappy Word Completion)
 */
const RATING_PREFIX_DICTIONARY = {
  5: {
    'chick': 'en',
    'pizz': 'a',
    'burg': 'er',
    'shak': 'e',
    'milk': 'shake',
    'ice': ' cream',
    'crea': 'my',
    'tast': 'y',
    'delic': 'ious',
    'crisp': 'y',
    'cream': 'y',
    'ambi': 'ence',
    'atm': 'osphere',
    'fair': 'y lights',
    'serv': 'ice',
    'staf': 'f',
    'pric': 'ing',
    'pock': 'et-friendly',
    'hygi': 'enic',
    'clea': 'n',
    'high': 'ly',
    'def': 'initely',
    'must': ' try',
    'amaz': 'ing',
    'fant': 'astic',
    'grea': 't',
    'love': 'd',
    'wond': 'erful',
    'frie': 'ndly',
    'recom': 'mend',
    'orde': 'red'
  },
  4: {
    'chick': 'en',
    'pizz': 'a',
    'shak': 'es',
    'milk': 'shake',
    'ice': ' cream',
    'burg': 'er',
    'tast': 'y',
    'serv': 'ice',
    'staf': 'f',
    'clea': 'n',
    'high': 'ly',
    'def': 'initely',
    'frie': 'ndly'
  },
  3: {
    'chick': 'en',
    'pizz': 'a',
    'shak': 'es',
    'ice': ' cream',
    'burg': 'er',
    'serv': 'ice',
    'staf': 'f',
    'wait': 'ing time',
    'aver': 'age'
  },
  1: {
    'chick': 'en',
    'pizz': 'a',
    'serv': 'ice',
    'staf': 'f',
    'wait': 'ing time',
    'disa': 'ppointed',
    'poor': ' service'
  }
};
RATING_PREFIX_DICTIONARY[2] = RATING_PREFIX_DICTIONARY[1];

/**
 * Rating-Calibrated Adjective Maps (Next-Word Auto-Complete)
 */
const RATING_ADJECTIVE_MAP = {
  5: {
    'very': 'delicious',
    'super': 'fresh',
    'so': 'tasty',
    'extremely': 'friendly',
    'really': 'loved the food',
    'truly': 'amazing',
    'best': 'spot around',
    'great': 'taste and service'
  },
  4: {
    'very': 'good',
    'super': 'tasty',
    'so': 'fresh',
    'really': 'good',
    'quite': 'pleasant',
    'pretty': 'good'
  },
  3: {
    'very': 'average',
    'quite': 'okay',
    'pretty': 'standard',
    'somewhat': 'delayed'
  },
  1: {
    'very': 'slow',
    'too': 'delayed',
    'extremely': 'slow',
    'quite': 'disappointing'
  }
};
RATING_ADJECTIVE_MAP[2] = RATING_ADJECTIVE_MAP[1];

const RATING_FALLBACKS = {
  5: {
    primary: 'delicious',
    alternatives: ['super fresh', 'friendly staff', 'great vibes']
  },
  4: {
    primary: 'good and fresh',
    alternatives: ['tasty', 'friendly service', 'nice atmosphere']
  },
  3: {
    primary: 'average',
    alternatives: ['okay', 'standard', 'fair']
  },
  1: {
    primary: 'slow',
    alternatives: ['delayed', 'needs improvement']
  }
};
RATING_FALLBACKS[2] = RATING_FALLBACKS[1];

/**
 * Extract Business Persona & Domain Profile
 */
function getBusinessDomain(client) {
  if (!client) return DOMAIN_LEXICONS.general;
  const name = (client.business_name || '').toLowerCase();
  const cat = (client.category || '').toLowerCase();
  const desc = (client.description || '').toLowerCase();

  if (name.includes('spicy') || cat.includes('ice cream') || cat.includes('shake') || cat.includes('pizza') || desc.includes('chicken')) {
    return DOMAIN_LEXICONS.food_dessert;
  }
  if (name.includes('garden') || cat.includes('south indian') || cat.includes('dosa') || desc.includes('biryani')) {
    return DOMAIN_LEXICONS.south_indian;
  }
  return DOMAIN_LEXICONS.general;
}


// ═══════════════════════════════════════════════════════════════
//  NEXT-WORD PREDICTION (Instant Local Engine with Gemini Race)
// ═══════════════════════════════════════════════════════════════

async function suggestNextWords({ text = '', rating = 5, slug = '', client = null }) {
  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const businessType = client ? (client.category || client.business_name) : '';

  // 1. Prioritize AI Brain (Gemini / NVIDIA) first for smart contextual word prediction
  if (isGeminiAvailable()) {
    try {
      const geminiPromise = predictWithGemini({
        text,
        rating: r,
        businessType: businessType || 'restaurant',
      });
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 1500));
      const result = await Promise.race([geminiPromise, timeoutPromise]);
      if (result && result.primary && typeof result.primary === 'string' && result.primary.trim().length > 0) {
        return {
          source: 'brain',
          primary: result.primary.trim(),
          alternatives: Array.isArray(result.alternatives) ? result.alternatives : []
        };
      }
    } catch (e) {
      // ignore and fallback to local
    }
  }

  // 2. Instant local fallback
  return localSuggestNextWords(text, r);
}

function localSuggestNextWords(text, r = 5) {
  const tier = Math.max(1, Math.min(5, parseInt(r) || 5));
  const transitions = RATING_CONTEXT_TRANSITIONS[tier] || RATING_CONTEXT_TRANSITIONS[5];
  const prefixes = RATING_PREFIX_DICTIONARY[tier] || RATING_PREFIX_DICTIONARY[5];
  const adjMap = RATING_ADJECTIVE_MAP[tier] || RATING_ADJECTIVE_MAP[5];
  const fallback = RATING_FALLBACKS[tier] || RATING_FALLBACKS[5];

  const raw = text.toLowerCase();
  const trimmed = raw.trim();
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1];

  // 1. Partial Word Match
  if (lastWord.length >= 3 && prefixes[lastWord]) {
    const completion = prefixes[lastWord];
    return {
      primary: completion,
      alternatives: [
        ' ' + completion,
        tier >= 4 ? ' and wonderful hospitality throughout' : ' and service needs improvement',
        tier >= 4 ? ' — thoroughly enjoyed our visit!' : ' — quite disappointed with the visit'
      ]
    };
  }

  for (const [prefix, completion] of Object.entries(prefixes)) {
    if (lastWord.length >= 3 && lastWord.startsWith(prefix)) {
      const rest = completion.replace(new RegExp(`^${lastWord.slice(prefix.length)}`, 'i'), '');
      return {
        primary: rest,
        alternatives: [' ' + completion, tier >= 4 ? ' with great quality and taste' : ' but quality was lacking']
      };
    }
  }

  // 2. Context transition match (multi-word ending matches prioritized)
  for (const [trigger, continuations] of Object.entries(transitions)) {
    if (trimmed.endsWith(trigger)) {
      const chosen = continuations[Math.floor(Math.random() * continuations.length)];
      return {
        primary: chosen,
        alternatives: continuations.slice(0, 3)
      };
    }
  }

  // 3. Punctuation bridge
  if (trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith(',')) {
    const bridges = tier >= 4 ? [
      ' Also, the service was lightning fast and courteous.',
      ' In addition, the ambience with fairy lights was wonderful.',
      ' Highly recommended to anyone looking for great taste and hygiene!',
      ' Definitely coming back again with friends soon.'
    ] : (tier === 3 ? [
      ' Also, service could be a bit quicker during busy hours.',
      ' In addition, portion sizes could be slightly more generous.',
      ' Overall an average experience with room for improvement.'
    ] : [
      ' Also, the staff were unresponsive when we asked for help.',
      ' In addition, the waiting time was far too long.',
      ' Hope management takes note and fixes these service delays.'
    ]);
    return {
      primary: bridges[Math.floor(Math.random() * bridges.length)],
      alternatives: bridges
    };
  }

  // 4. Adjective map
  if (adjMap[lastWord]) {
    return {
      primary: ' ' + adjMap[lastWord],
      alternatives: [
        tier >= 4 ? ' and delicious in every single bite' : ' and below what we expected',
        tier >= 4 ? ' with top-tier presentation and taste' : ' with slow and inattentive service',
        tier >= 4 ? ' — completely exceeded all our expectations' : ' — needs significant improvement'
      ]
    };
  }

  // 5. General fallback
  return fallback;
}


async function generateTagsWithNvidia({ rating = 5, businessName = '', businessType = '', category = '', limit = 8 } = {}) {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) return null;
  const nvidiaBase = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
  const nvidiaModel = process.env.NVIDIA_MODEL || 'deepseek-ai/deepseek-v4-flash-0731';

  const prompt = `Generate ${limit} clickable quick review topic tags for a Google review writing assistant:
- Business: ${businessName || 'Local Business'}
- Category: ${businessType || category || 'Restaurant'}
- Rating: ${rating} out of 5 stars

Output ONLY a valid JSON array of objects with:
- "l": Short label with appropriate emoji (max 22 chars)
Example: [{"l":"🍗 Crispy Chicken"},{"l":"🍟 Peri Peri Fries"},{"l":"⚡ Fast Service"}]`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const resp = await fetch(nvidiaBase.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + nvidiaKey,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: nvidiaModel,
        messages: [
          { role: 'system', content: 'You are an AI that generates structured JSON array tags. Return ONLY the raw JSON array. No explanations, no thought process, no markdown fences.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 300
      })
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) return null;
    const data = await resp.json();
    const choice = data.choices?.[0]?.message;
    let raw = choice?.content || '';
    if (!raw && choice?.reasoning_content) raw = choice.reasoning_content;
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    const startIdx = raw.indexOf('[');
    const endIdx = raw.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;

    const jsonStr = raw.substring(startIdx, endIdx + 1);
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const normalized = parsed.map(item => {
        if (typeof item === 'string') return { l: item };
        if (item && item.l) return { l: item.l };
        return null;
      }).filter(Boolean);
      if (normalized.length > 0) {
        console.log('[getTagsForRating] Dynamic tags generated via NVIDIA AI Brain ✓');
        return normalized.slice(0, limit);
      }
    }
  } catch (e) {
    console.warn('[getTagsForRating] NVIDIA tag generation failed:', e.message);
  }
  return null;
}

const dynamicTagsCache = new Map();
const TAGS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getTagsForRating(rating = 5, limit = 8, client = null) {
  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const slug = client ? client.slug : 'default';
  const bizName = client ? client.business_name : '';
  const bizType = client ? (client.category || client.description) : '';
  const cacheKey = `${slug}:${r}:${limit}`;

  const cached = dynamicTagsCache.get(cacheKey);
  if (cached && Date.now() - cached.time < TAGS_CACHE_TTL) {
    return cached.tags;
  }

  // 1. Try Gemini AI Brain
  if (isGeminiAvailable() && client) {
    try {
      const tags = await generateTagsWithGemini({
        rating: r,
        businessName: bizName,
        businessType: bizType,
        category: bizType,
        limit,
      });
      if (tags && tags.length > 0) {
        dynamicTagsCache.set(cacheKey, { time: Date.now(), tags });
        return tags;
      }
    } catch (e) {
      console.warn('[getTagsForRating] Gemini tags failed:', e.message);
    }
  }

  // 2. Try NVIDIA NIM AI Brain
  try {
    const nvidiaTags = await generateTagsWithNvidia({
      rating: r,
      businessName: bizName,
      businessType: bizType,
      category: bizType,
      limit
    });
    if (nvidiaTags && nvidiaTags.length > 0) {
      dynamicTagsCache.set(cacheKey, { time: Date.now(), tags: nvidiaTags });
      return nvidiaTags;
    }
  } catch (e) {
    console.warn('[getTagsForRating] NVIDIA tags fallback:', e.message);
  }

  // 3. Fallback to client configured seed tags
  if (client && client.tags) {
    try {
      const parsed = JSON.parse(client.tags);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, limit);
      }
    } catch (e) {}
  }

  // 4. Local fallback tags
  return localGetTagsForRating(r, limit);
}

function localGetTagsForRating(r, limit = 8) {
  const fullPool = [
    { l: '🍦 Creamy ice creams', t: 'The ice creams are exquisitely creamy, rich, and full of delightful flavours.' },
    { l: '🥤 Thick milkshakes', t: 'The thick milkshakes are perfectly blended and an absolute treat.' },
    { l: '🍕 Cheesy hot pizza', t: 'The pizzas are freshly baked with a golden crispy crust and plenty of cheese.' },
    { l: '🍗 Crispy fried chicken', t: 'The fried chicken is crispy on the outside, tender and juicy inside.' },
    { l: '⚡ Lightning fast service', t: 'The service is exceptionally prompt, and the staff are warmly welcoming.' },
    { l: '💰 Pocket-friendly', t: 'Generous portions at very reasonable prices — outstanding value.' },
    { l: '🌟 Fairy light ambience', t: 'The night fairy lights and vibrant ambience create a wonderful cozy vibe.' },
    { l: '🍨 Cream More Delight', t: 'The Cream More special desserts and sundaes are top-notch and a must-try.' },
    { l: '👨👩👧 Family friendly', t: 'A wonderful, clean environment for family gatherings and evening hangouts.' },
    { l: '💖 Highly recommend', t: 'Hands down one of the finest food and dessert spots in town — 10/10 experience!' }
  ];

  if (r === 4) {
    return [
      { l: '🍦 Tasty ice creams', t: 'Good variety of ice cream options and delicious taste.' },
      { l: '🥤 Delicious shakes', t: 'Milkshakes had great consistency and rich flavour.' },
      { l: '🍕 Fresh hot pizza', t: 'Pizza was tasty and served fresh out of the oven.' },
      { l: '🍗 Good fried chicken', t: 'Crispy fried chicken seasoned nicely.' },
      { l: '⚡ Friendly staff', t: 'Friendly staff and prompt response throughout our visit.' },
      { l: '💰 Great value', t: 'Good food quality for the price paid.' },
      { l: '🌟 Cozy atmosphere', t: 'Pleasant lighting and comfortable seating.' }
    ];
  }

  if (r === 3) {
    return [
      { l: '🍦 Decent ice cream', t: 'Average ice cream options with standard quality.' },
      { l: '🥤 Standard shakes', t: 'Milkshakes were okay and reasonably chilled.' },
      { l: '🍕 Average pizza', t: 'Decent pizza crust and toppings.' },
      { l: '⚡ Normal service', t: 'Service was standard and food was served on time.' },
      { l: '💰 Fair pricing', t: 'Prices are reasonable for the portions.' }
    ];
  }

  if (r <= 2) {
    return [
      { l: '⏳ Long wait time', t: 'Had to wait longer than expected for our order to arrive.' },
      { l: '🍗 Chicken can be better', t: 'Fried chicken was a bit oily and could be crispier.' },
      { l: '⚡ Service needs speed', t: 'Staff could be more proactive during rush hours.' },
      { l: '❄️ Food served lukewarm', t: 'Food was not served as hot as expected.' }
    ];
  }

  return fullPool.slice(0, limit);
}


function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

function synthesizeFromSelectedTags({ tags = [], rating = 5, bizName = 'this place', client = null }) {
  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const tagList = Array.isArray(tags)
    ? tags.map(t => typeof t === 'object' ? (t.l || t.label || '') : String(t)).filter(Boolean)
    : [];

  const cleanTags = tagList.map(t =>
    t.replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F900}-\u{1F9FF}]/gu, '')
     .replace(/^[^\w\s]+/, '')
     .trim()
  ).filter(Boolean);

  const OPENERS_5 = [
    `Had such an amazing experience at ${bizName} today!`,
    `Honestly loved everything about ${bizName}!`,
    `Visited ${bizName} and was thoroughly impressed.`,
    `Such a fantastic spot!`,
    `Always a pleasure visiting ${bizName}.`,
    `Stopped by ${bizName} and had a wonderful time.`,
    `Hands down one of the best spots in town —`
  ];

  const OPENERS_4 = [
    `Really good experience at ${bizName} overall.`,
    `Stopped by ${bizName} for a quick bite.`,
    `Pretty solid spot with good quality food and drinks.`,
    `Had a pleasant visit to ${bizName} today.`
  ];

  const OPENERS_3 = [
    `Decent visit to ${bizName}.`,
    `Stopped by ${bizName} for a quick stop.`,
    `Fair experience overall at ${bizName}.`
  ];

  const OPENERS_LOW = [
    `Visited ${bizName} recently.`,
    `Had a quick visit to ${bizName}.`
  ];

  const CLOSINGS_5 = [
    'Definitely coming back for more!',
    '10/10 would highly recommend to everyone.',
    'A must-visit if you are around!',
    'Super happy with the quality and service.',
    'Can’t wait for our next visit!',
    'Will definitely be recommending to friends and family!'
  ];

  const CLOSINGS_4 = [
    'Solid experience and worth visiting again.',
    'Good value and quality overall.',
    'Would happily visit again.',
    'A nice reliable spot in the area.'
  ];

  const CLOSINGS_3 = [
    'Decent overall, with room for minor tweaks.',
    'Good for a casual quick bite.',
    'Fair experience for the price.'
  ];

  const CLOSINGS_LOW = [
    'Hoping service speed and consistency get a bit better next time.',
    'Decent potential, just needs slightly quicker service.'
  ];

  if (cleanTags.length === 0) {
    if (r === 5) return `${pickRandom(OPENERS_5)} Everything was fresh, delicious, and the service was super quick. ${pickRandom(CLOSINGS_5)}`;
    if (r === 4) return `${pickRandom(OPENERS_4)} Good food quality, friendly staff, and reasonable prices. ${pickRandom(CLOSINGS_4)}`;
    if (r === 3) return `${pickRandom(OPENERS_3)} Food was okay though service could be a bit faster during rush hours. ${pickRandom(CLOSINGS_3)}`;
    return `${pickRandom(OPENERS_LOW)} Food was okay, but had to wait longer than expected today. ${pickRandom(CLOSINGS_LOW)}`;
  }

  // Conversational aspect clauses tailored for natural flow & randomized picking
  const aspectDescriptions = {
    chicken: [
      'the crispy fried chicken was super crunchy and juicy',
      'the chicken was piping hot with the best crunch and seasoning',
      'the fried chicken pieces were fresh, flavorful, and seasoned just right',
      'loved the crispy chicken — juicy on the inside with great crunch'
    ],
    burger: [
      'the burgers had the perfect crunch and soft fresh buns',
      'the burger was super fresh and packed with flavor',
      'the burgers were delicious, juicy, and well prepared',
      'the zinger burgers were fresh, flavorful, and satisfying'
    ],
    fries: [
      'the peri peri fries were hot, crisp, and seasoned so well',
      'the fries had the perfect seasoning and crunch',
      'the crispy fries were piping hot and delicious',
      'the fries were perfectly golden, crisp, and tasty'
    ],
    service: [
      'the service was exceptionally quick and the staff were really welcoming',
      'the counter staff were super friendly and got our order out fast',
      'quick, attentive, and hassle-free service throughout our visit',
      'staff members were polite, helpful, and very accommodating'
    ],
    clean: [
      'the place was spotless and maintained great hygiene standards',
      'super clean and comfortable atmosphere throughout the dining area',
      'clean, well-organized tables with a very pleasant vibe',
      'the seating area was tidy and very well kept'
    ],
    ice_cream: [
      'the ice creams were rich, creamy, and super flavorful',
      'loved the thick creamy ice creams and desserts',
      'the ice cream flavors were rich, fresh, and delightfully sweet',
      'the sundaes and ice creams were top-tier in taste'
    ],
    shake: [
      'the milkshakes were thick, chilled, and perfectly blended',
      'thick shakes had fantastic consistency and rich taste',
      'the beverages and milkshakes were cold, creamy, and super refreshing',
      'the thick milkshakes were loaded with great flavor'
    ],
    pizza: [
      'the pizza was cheesy, hot, with a golden crispy baked crust',
      'loved the pizza — loaded with generous toppings and baked fresh',
      'the pizza crust had great crunch and plenty of gooey cheese',
      'freshly baked hot pizza with delicious flavors'
    ],
    coffee: [
      'the coffee was brewed fresh and had a rich aroma',
      'loved the fresh coffee — smooth, rich, and perfectly prepared',
      'the hot coffee and drinks were spot on'
    ],
    biryani: [
      'the biryani was fragrant, richly spiced, and full of tender pieces',
      'the biryani had authentic spices and amazing flavor in every spoonful',
      'delicious biryani with perfectly cooked rice and great aroma'
    ],
    family: [
      'great comfortable environment for family and friends',
      'very welcoming and family-friendly setting with good seating',
      'spacious and relaxed vibe for evening hangouts and gatherings',
      'cozy and vibrant ambience that makes you feel right at home'
    ],
    value: [
      'generous portions and very pocket-friendly pricing',
      'great value for money without compromising on quality',
      'prices are totally worth the generous portion sizes and taste',
      'very reasonable prices for the high food quality'
    ],
    taste: [
      '10/10 taste on everything we ordered today',
      'food tasted absolutely delicious and fresh',
      'incredible flavor and quality in every single bite',
      'everything we tried was packed with wonderful flavor'
    ]
  };

  function getClauseForTag(tagStr) {
    const s = tagStr.toLowerCase();
    let pool = null;
    if (s.includes('chicken') || s.includes('wings') || s.includes('strips') || s.includes('bucket') || s.includes('nugget')) pool = aspectDescriptions.chicken;
    else if (s.includes('burger') || s.includes('zinger') || s.includes('sandwich') || s.includes('roll')) pool = aspectDescriptions.burger;
    else if (s.includes('fries') || s.includes('peri peri') || s.includes('wedges') || s.includes('chips')) pool = aspectDescriptions.fries;
    else if (s.includes('service') || s.includes('staff') || s.includes('fast') || s.includes('quick') || s.includes('counter')) pool = aspectDescriptions.service;
    else if (s.includes('clean') || s.includes('hygien') || s.includes('spotless') || s.includes('neat')) pool = aspectDescriptions.clean;
    else if (s.includes('ice cream') || s.includes('sundae') || s.includes('dessert') || s.includes('creamy') || s.includes('waffle')) pool = aspectDescriptions.ice_cream;
    else if (s.includes('shake') || s.includes('krusher') || s.includes('beverage') || s.includes('drink') || s.includes('smoothie')) pool = aspectDescriptions.shake;
    else if (s.includes('pizza') || s.includes('cheese') || s.includes('crust')) pool = aspectDescriptions.pizza;
    else if (s.includes('coffee') || s.includes('tea') || s.includes('chai') || s.includes('brew')) pool = aspectDescriptions.coffee;
    else if (s.includes('biryani') || s.includes('rice') || s.includes('pulao')) pool = aspectDescriptions.biryani;
    else if (s.includes('family') || s.includes('kids') || s.includes('group') || s.includes('hangout') || s.includes('ambience') || s.includes('light') || s.includes('vibe')) pool = aspectDescriptions.family;
    else if (s.includes('value') || s.includes('pocket') || s.includes('price') || s.includes('affordable') || s.includes('worth')) pool = aspectDescriptions.value;
    else if (s.includes('taste') || s.includes('delicious') || s.includes('recommend') || s.includes('flavour') || s.includes('quality') || s.includes('good')) pool = aspectDescriptions.taste;

    if (pool && pool.length > 0) {
      return pickRandom(pool);
    }
    const fallbacks = [
      `the ${tagStr.toLowerCase()} was top-notch and super fresh`,
      `really enjoyed the ${tagStr.toLowerCase()}`,
      `the ${tagStr.toLowerCase()} was freshly prepared and full of flavor`
    ];
    return pickRandom(fallbacks);
  }

  // Generate unique clauses for each selected tag
  const clauses = cleanTags.map(t => getClauseForTag(t));

  const opener = r === 5 ? pickRandom(OPENERS_5) : r === 4 ? pickRandom(OPENERS_4) : r === 3 ? pickRandom(OPENERS_3) : pickRandom(OPENERS_LOW);
  const closing = r === 5 ? pickRandom(CLOSINGS_5) : r === 4 ? pickRandom(CLOSINGS_4) : r === 3 ? pickRandom(CLOSINGS_3) : pickRandom(CLOSINGS_LOW);

  if (clauses.length === 1) {
    const c0 = clauses[0];
    const patterns = [
      `${opener} ${c0.charAt(0).toUpperCase() + c0.slice(1)}. ${closing}`,
      `${opener} Especially loved that ${c0}. ${closing}`,
      `${opener} — ${c0}! ${closing}`
    ];
    return pickRandom(patterns);
  }

  if (clauses.length === 2) {
    const c0 = clauses[0];
    const c1 = clauses[1];
    const connectors = [', and ', ', plus ', ' along with '];
    const conn = pickRandom(connectors);
    const patterns = [
      `${opener} ${c0.charAt(0).toUpperCase() + c0.slice(1)}${conn}${c1}. ${closing}`,
      `${opener} Both ${c0} and ${c1}. ${closing}`,
      `${c0.charAt(0).toUpperCase() + c0.slice(1)}, while ${c1}. ${opener} ${closing}`
    ];
    return pickRandom(patterns);
  }

  // 3 or more tags (mix all tags smoothly across 2 sentences)
  const c0 = clauses[0];
  const c1 = clauses[1];
  const cRest = clauses.slice(2);
  const restJoined = cRest.length === 1 ? cRest[0] : cRest.slice(0, -1).join(', ') + ', and ' + cRest[cRest.length - 1];

  const multiPatterns = [
    `${opener} ${c0.charAt(0).toUpperCase() + c0.slice(1)}, and ${c1}. On top of that, ${restJoined}. ${closing}`,
    `${opener} Really loved that ${c0} plus ${c1}. Also, ${restJoined}. ${closing}`,
    `Everything was on point at ${bizName} today! ${c0.charAt(0).toUpperCase() + c0.slice(1)}, ${c1}, and ${restJoined}. ${closing}`
  ];
  return pickRandom(multiPatterns);
}

async function generateReview({ slug, rating = 5, tags = [], previousText = '', client = null }) {
  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const bizName = client ? client.business_name : 'this place';
  const bizType = client ? (client.category || client.description) : 'restaurant';

  // 1. Instantly prepare local randomized multi-tag mixed review
  const instantReview = synthesizeFromSelectedTags({ tags, rating: r, bizName, client });

  // 2. Race with fast AI call (1200ms max)
  if (isGeminiAvailable()) {
    try {
      const userText = tags.length > 0 ? tags.join(', ') : (previousText || '');
      const aiPromise = generateReviewWithGemini({
        rating: r,
        businessName: bizName,
        businessType: bizType,
        userText,
        tags,
      });

      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 1200));
      const review = await Promise.race([aiPromise, timeoutPromise]);
      if (review && typeof review === 'string' && review.trim().length > 15 && !review.includes('User wants') && !review.includes('1.')) {
        console.log('[AI Engine] Fast AI review generated ✓');
        return review.trim();
      }
    } catch (e) {
      // ignore and return instantReview
    }
  }

  console.log('[AI Engine] Instant randomized multi-tag synthesis returned ✓');
  return instantReview;
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
