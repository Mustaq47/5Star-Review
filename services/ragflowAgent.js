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
    'i': [
      ' really loved the food and the wonderful fairy light atmosphere here',
      ' had an extraordinary experience and thoroughly enjoyed everything we ordered',
      ' tried their signature ice creams and crispy chicken — both were incredible',
      ' visited with my family and was genuinely blown away by the taste and hospitality',
      ' ordered the thick shakes and pizzas, and the taste was pure perfection',
      ' would highly recommend this place to anyone looking for great taste and good vibes'
    ],
    'we': [
      ' had a fantastic time enjoying the delicious food and cozy ambience',
      ' tried multiple items from the menu and each one was prepared to perfection',
      ' loved the crispy fried chicken, loaded pizzas, and creamy thick shakes',
      ' came here for an evening hangout with friends and had a wonderful time',
      ' were very impressed with the cleanliness, prompt service, and portion sizes'
    ],
    'the': [
      ' food quality, taste, and hospitality here are absolutely outstanding',
      ' ice creams and thick shakes are rich, creamy, and an absolute treat',
      ' crispy fried chicken is super crunchy on the outside and juicy inside',
      ' pizzas have a wonderful golden crust with plenty of delicious toppings',
      ' ambience with fairy lights creates a cozy and magical evening vibe',
      ' staff members are polite, attentive, and provide lightning fast service'
    ],
    'food': [
      ' was fresh, flavorful, and served piping hot with great presentation',
      ' quality exceeded all our expectations — absolutely delicious',
      ' here is authentic, hygienic, and prepared with high quality ingredients'
    ],
    'food was': [
      ' fresh, delicious, and prepared with top quality ingredients',
      ' served piping hot with wonderful presentation and rich flavors',
      ' super tasty and exceeded all our expectations'
    ],
    'pizza was': [
      ' cheesy, hot, with a perfectly baked crispy golden crust',
      ' loaded with toppings and had amazing flavor in every bite'
    ],
    'chicken was': [
      ' crispy on the outside, juicy inside, and seasoned to perfection',
      ' super crunchy and full of authentic spicy flavor'
    ],
    'ice cream was': [
      ' thick, creamy, rich, and made with genuine premium ingredients',
      ' delightfully refreshing and bursting with authentic flavour'
    ],
    'shake was': [
      ' thick, chilled, and packed with rich authentic flavor',
      ' very creamy and satisfying from first sip to last'
    ],
    'service was': [
      ' lightning fast, warm, and attentive throughout our visit',
      ' courteous, prompt, and delivered with a welcoming smile'
    ],
    'staff were': [
      ' extremely welcoming, helpful with recommendations, and very polite',
      ' courteous, attentive, and maintain high hygiene standards'
    ],
    'ambience was': [
      ' cozy, relaxing, and beautifully lit with fairy lights in the evening',
      ' peaceful, clean, and perfect for family and friends hangout'
    ],
    'was': [
      ' fresh, flavorful, and served with great presentation',
      ' absolutely delicious and exceeded all our expectations',
      ' prepared to perfection and worth every single penny'
    ],
    'were': [
      ' extremely courteous, prompt, and attentive to every detail',
      ' delicious, rich in flavor, and served piping hot'
    ],
    'is': [
      ' fresh, authentic, and bursting with great flavors',
      ' definitely one of the top spots in town for foodies'
    ],
    'are': [
      ' super friendly, attentive, and ensure a memorable visit',
      ' rich, creamy, and made with top-quality ingredients'
    ],
    'highly': [
      ' recommend this spot to all foodies, families, and dessert lovers',
      ' satisfied with the taste, cleanliness, and wonderful hospitality'
    ],
    'definitely': [
      ' coming back again soon with friends and family for another treat',
      ' worth visiting if you appreciate great taste and quality'
    ]
  },

  // ── 4 STARS: Warm, Positive, Good Value ──
  4: {
    'i': [
      ' had a pleasant dining experience and enjoyed the food overall',
      ' liked the taste of the dishes and the friendly service',
      ' ordered pizza and shakes, and both were good in quality'
    ],
    'we': [
      ' had a good time dining here and liked the atmosphere',
      ' enjoyed our meal and found the pricing quite reasonable'
    ],
    'the': [
      ' food was delicious and served fresh in good portion sizes',
      ' shakes and pizzas were tasty and well prepared',
      ' staff were friendly and attentive throughout our meal'
    ],
    'food': [
      ' was good, flavorful, and well-seasoned',
      ' arrived in reasonable time and tasted fresh'
    ],
    'food was': [
      ' tasty, well-prepared, and served fresh',
      ' good in flavor and nicely presented'
    ],
    'pizza was': [
      ' flavorful with good cheese and crispy crust',
      ' freshly baked and tasted nice'
    ],
    'chicken was': [
      ' nice and crispy with good seasoning',
      ' well cooked and tasty'
    ],
    'ice cream was': [
      ' smooth and flavorful with nice varieties',
      ' good and served nicely chilled'
    ],
    'shake was': [
      ' thick, tasty, and good in texture',
      ' refreshing and nicely made'
    ],
    'service was': [
      ' prompt, polite, and handled with care',
      ' friendly and accommodating'
    ],
    'staff were': [
      ' helpful, courteous, and polite',
      ' welcoming and took our orders smoothly'
    ],
    'ambience was': [
      ' pleasant, clean, and nicely maintained',
      ' comfortable for a quick meal with friends'
    ],
    'was': [
      ' tasty, well-made, and satisfied our cravings',
      ' good and definitely worth trying'
    ],
    'were': [
      ' polite, attentive, and helpful',
      ' tasty and served warm'
    ],
    'is': [
      ' a solid spot for good food and reasonable prices',
      ' clean and comfortable'
    ],
    'are': [
      ' friendly and attentive to customer requests',
      ' reasonably priced with good portions'
    ],
    'highly': [
      ' recommend giving this place a try for good food',
      ' happy with the service and taste'
    ],
    'definitely': [
      ' a good option for an evening snack and desserts',
      ' plan to visit again sometime'
    ]
  },

  // ── 3 STARS: Balanced, Average, Scope for Improvement ──
  3: {
    'i': [
      ' had an average experience, some dishes were fine while others could be improved',
      ' felt the food was okay, but expected a bit more flavor for the price',
      ' visited for a quick bite, overall an average visit'
    ],
    'we': [
      ' had a mixed experience with some items being better than others',
      ' found the food average and service could be a bit quicker'
    ],
    'the': [
      ' food was okay, though there is scope for improvement in portion size',
      ' taste was decent and average for the price',
      ' ambience was fine but could use some better seating'
    ],
    'food': [
      ' was okay, though nothing extraordinary',
      ' took a while to arrive and was moderately warm'
    ],
    'food was': [
      ' decent and average, but could have been served warmer',
      ' okay, though lacked a bit of punch in seasoning'
    ],
    'pizza was': [
      ' average, crust could be a bit softer and toppings more generous',
      ' okay, standard bakery style taste'
    ],
    'chicken was': [
      ' a bit oily, though flavor was acceptable',
      ' average and could have been crispier'
    ],
    'ice cream was': [
      ' standard taste, nothing special compared to other places',
      ' okay, could offer more variety'
    ],
    'shake was': [
      ' a bit watery and could be thicker',
      ' average in taste and standard sweetness'
    ],
    'service was': [
      ' standard and okay, though a bit slow during rush hours',
      ' fine, but could be slightly more attentive'
    ],
    'staff were': [
      ' okay, but seemed a bit busy and occupied',
      ' polite enough, though service was slightly delayed'
    ],
    'ambience was': [
      ' average and could be maintained a bit better',
      ' okay for a quick casual stop'
    ],
    'was': [
      ' average and standard, could be improved with better consistency',
      ' decent but nothing extraordinary'
    ],
    'were': [
      ' okay, but took longer than expected to serve',
      ' standard in quality'
    ],
    'is': [
      ' an okay option if you are nearby, but has room to improve',
      ' average in pricing and quality'
    ],
    'are': [
      ' okay, but could be improved in portion size and taste',
      ' standard, nothing exceptional'
    ],
    'highly': [
      ' suggest focusing on faster service and food consistency',
      ' recommend minor tweaks to improve the taste'
    ],
    'definitely': [
      ' has potential if they improve the wait times and food temperature',
      ' an okay place for a quick stop'
    ]
  },

  // ── 1-2 STARS: Constructive Criticism, Issues, Delays ──
  1: {
    'i': [
      ' was disappointed with the long wait time and food temperature',
      ' had an underwhelming experience and expected much better quality',
      ' was not satisfied with the service and attitude of the staff'
    ],
    'we': [
      ' waited over 35 minutes for our order and the food arrived cold',
      ' were disappointed with the overall quality and slow response'
    ],
    'the': [
      ' waiting time was quite long and the food arrived lukewarm',
      ' food quality was below expectations and lacked flavor',
      ' service was slow and staff seemed indifferent to requests'
    ],
    'food': [
      ' was cold when served and took too long to arrive',
      ' lacked seasoning and was not freshly prepared'
    ],
    'food was': [
      ' below expectations, cold, and took far too long',
      ' bland and not prepared with fresh ingredients'
    ],
    'pizza was': [
      ' soggy, underbaked, and had very little cheese',
      ' cold when it arrived at our table'
    ],
    'chicken was': [
      ' overly greasy and not crispy at all',
      ' undercooked inside and disappointing'
    ],
    'ice cream was': [
      ' melted by the time it was brought to the table',
      ' tasted artificial and lacked richness'
    ],
    'shake was': [
      ' very runny and tasted like plain milk with syrup',
      ' not chilled properly and lacked flavor'
    ],
    'service was': [
      ' extremely slow and unresponsive to our requests',
      ' disappointing and needs urgent management attention'
    ],
    'staff were': [
      ' unhelpful and ignored our requests multiple times',
      ' inattentive and showed very little customer care'
    ],
    'ambience was': [
      ' noisy, disorganized, and tables were not cleaned promptly',
      ' uncomfortable and stuffy'
    ],
    'was': [
      ' below expectations and needs serious improvement',
      ' delayed, cold, and not worth the price paid'
    ],
    'were': [
      ' disappointed with the service delay and food quality',
      ' unresponsive when we asked for basic assistance'
    ],
    'is': [
      ' in serious need of better staff training and kitchen management',
      ' not meeting the standard expected for these prices'
    ],
    'are': [
      ' very slow and need better coordination during peak hours',
      ' underwhelming in quality and overpriced'
    ],
    'highly': [
      ' disappointed with the lack of attention and slow turnaround',
      ' suggest management improve food temperature and hygiene'
    ],
    'definitely': [
      ' not returning until service speed and quality are fixed',
      ' need significant improvements before we consider visiting again'
    ]
  }
};
// Aliases for 2-star to use tier 1
RATING_CONTEXT_TRANSITIONS[2] = RATING_CONTEXT_TRANSITIONS[1];

/**
 * Rating-Calibrated Prefix Dictionaries
 */
const RATING_PREFIX_DICTIONARY = {
  5: {
    'chick': 'en was crispy outside and juicy inside',
    'fri': 'ed chicken is crunchy, flavorful and cooked to perfection',
    'pizz': 'as here have a crispy crust and generous cheese toppings',
    'shake': 's are thick, creamy and rich in flavor',
    'milk': 'shakes are thick, chilled and absolutely delightful',
    'ice': ' creams are smooth, rich and have amazing varieties',
    'crea': 'm More ice cream specials are top notch',
    'burg': 'er was juicy, loaded and very filling',
    'tast': 'e is authentic, fresh and full of flavor',
    'delic': 'ious food with great presentation and hygiene',
    'crisp': 'y, flavorful and made fresh to order',
    'cream': 'y, rich and satisfying in every bite',
    'ambi': 'ence with fairy lights is cozy and peaceful',
    'atm': 'osphere is warm, lively and perfect for hangouts',
    'fair': 'y lights create a magical evening hangout vibe',
    'serv': 'ice was prompt, attentive and friendly',
    'staf': 'f are welcoming, courteous and fast',
    'pric': 'es are very affordable and offer great value',
    'pock': 'et-friendly pricing with generous portions',
    'hygi': 'enic kitchen and spotless dining area',
    'clea': 'n, well-maintained and comfortable space',
    'high': 'ly recommend this place to all food lovers',
    'def': 'initely coming back with family and friends',
    'must': ' try their signature dishes and desserts',
    'amaz': 'ing dining experience with 5-star taste',
    'fant': 'astic food and wonderful hospitality',
    'grea': 't taste, fast service and pleasant ambience',
    'love': 'd every single dish we ordered here',
    'wond': 'erful evening spent with great food and drinks'
  },
  4: {
    'chick': 'en was tasty, crispy and well seasoned',
    'fri': 'ed chicken had good flavor and nice crunch',
    'pizz': 'a was fresh and tasted good',
    'shake': 's were thick and nicely flavored',
    'milk': 'shakes were cold, sweet, and satisfying',
    'ice': ' cream was smooth with nice choices',
    'burg': 'er was good and reasonably sized',
    'tast': 'e was good and well-balanced',
    'serv': 'ice was good and polite',
    'staf': 'f were friendly and helpful',
    'pric': 'ing is fair for the portion size',
    'clea': 'n and pleasant dining space',
    'high': 'ly appreciate the friendly service',
    'def': 'initely a good spot to grab a bite'
  },
  3: {
    'chick': 'en was okay, could be a bit less oily',
    'fri': 'ed items were standard, nothing special',
    'pizz': 'a was decent but average toppings',
    'shake': 's were a bit runny and could be thicker',
    'ice': ' cream was standard quality',
    'burg': 'er was average in taste',
    'tast': 'e was acceptable but has room to improve',
    'serv': 'ice was standard, could be faster',
    'staf': 'f were okay but busy',
    'pric': 'es are slightly on the higher side for what you get',
    'wait': 'ing time was slightly long',
    'aver': 'age experience overall'
  },
  1: {
    'chick': 'en was undercooked and overly greasy',
    'fri': 'ed food was cold and not crispy',
    'pizz': 'a was soggy and lacked toppings',
    'shake': 's were watery and warm',
    'ice': ' cream was melted and artificial',
    'burg': 'er was cold and dry',
    'tast': 'e was disappointing and lacked freshness',
    'serv': 'ice was extremely slow and unhelpful',
    'staf': 'f were inattentive and ignored our table',
    'pric': 'es are not justified given the poor quality',
    'wait': 'ing time was over 30 minutes for a simple order',
    'disa': 'ppointed with the whole experience',
    'poor': ' service and lukewarm food'
  }
};
RATING_PREFIX_DICTIONARY[2] = RATING_PREFIX_DICTIONARY[1];

/**
 * Rating-Calibrated Adjective Maps
 */
const RATING_ADJECTIVE_MAP = {
  5: {
    'very': ' tasty, fresh, and served with a welcoming smile',
    'super': ' crispy on the outside, juicy inside, and full of flavor',
    'so': ' creamy, rich, and made with fresh ingredients',
    'extremely': ' polite staff and prompt service throughout',
    'really': ' enjoyed the peaceful ambience and delicious snacks',
    'truly': ' an exceptional experience from start to finish',
    'best': ' spot in town for desserts, pizzas, and crispy chicken',
    'great': ' taste, generous portions, and pocket-friendly pricing',
    'nice': ' fairy light ambience and great music in the background',
    'clean': ' seating area with high hygiene standards',
    'fresh': ' ingredients that make every dish taste authentic'
  },
  4: {
    'very': ' good food, nicely seasoned and served fresh',
    'super': ' friendly staff and quick turnaround',
    'so': ' tasty and satisfying for the price',
    'really': ' liked the pleasant vibe and food quality',
    'great': ' value for money and good portions',
    'nice': ' atmosphere and clean dining tables',
    'fresh': ' taste and good presentation'
  },
  3: {
    'very': ' average taste and ordinary presentation',
    'quite': ' standard and could be improved',
    'fairly': ' decent, but nothing memorable',
    'somewhat': ' slow during peak hours',
    'moderately': ' good, but expected slightly better'
  },
  1: {
    'very': ' slow service and disappointing food quality',
    'too': ' slow, cold, and overpriced for what was offered',
    'extremely': ' unhappy with the long delay and cold food',
    'quite': ' disappointing from start to finish',
    'terribly': ' slow service and inattentive staff',
    'really': ' bad experience with delayed orders and cold food'
  }
};
RATING_ADJECTIVE_MAP[2] = RATING_ADJECTIVE_MAP[1];

const RATING_FALLBACKS = {
  5: {
    primary: 'is fresh, delicious, and worth visiting again',
    alternatives: [
      'and the staff were very polite and attentive',
      'with great portions and affordable pricing',
      'highly recommended to everyone!'
    ]
  },
  4: {
    primary: 'was really good and we had a pleasant visit',
    alternatives: [
      'and the food was prepared nicely',
      'with good service and reasonable prices',
      'a good option for a casual meal'
    ]
  },
  3: {
    primary: 'was okay, but there is room for improvement in speed and taste',
    alternatives: [
      'though service could be a bit faster',
      'decent for a quick bite but nothing special',
      'hope they improve food consistency'
    ]
  },
  1: {
    primary: 'was below expectations and needs urgent improvement in service and quality',
    alternatives: [
      'due to excessive waiting time and cold food',
      'and staff need to be much more responsive',
      'quite disappointed with our visit'
    ]
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

  // 1. Calculate local instant prediction immediately (<5ms) calibrated to star rating
  const localResult = localSuggestNextWords(text, r);

  // 2. If Gemini is available, attempt fast 350ms race
  if (isGeminiAvailable()) {
    try {
      const geminiPromise = predictWithGemini({
        text,
        rating: r,
        businessType: businessType || 'restaurant',
      });
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 350));
      const result = await Promise.race([geminiPromise, timeoutPromise]);
      if (result && result.primary && result.primary.trim().length > 0) {
        return result;
      }
    } catch (e) {
      // ignore and return localResult
    }
  }

  return localResult;
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

  const prompt = `Generate ${limit} clickable quick review tags for a Google review writing assistant:
- Business: ${businessName || 'Local Business'}
- Category: ${businessType || category || 'Restaurant'}
- Rating: ${rating} out of 5 stars

Output ONLY a valid JSON array of objects with:
- "l": Short label with appropriate emoji (max 25 chars)
- "t": Natural review sentence (15-25 words) matching the ${rating}-star tone.
Example: [{"l":"🍕 Cheesy pizza","t":"The pizzas are freshly baked with a golden crispy crust and loaded with cheese."}]`;

  try {
    const resp = await fetch(nvidiaBase.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + nvidiaKey,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: nvidiaModel,
        messages: [
          { role: 'system', content: 'You are an AI that generates structured JSON array tags.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 600
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const choice = data.choices?.[0]?.message;
    const raw = choice?.content || choice?.reasoning_content || '';
    const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].l && parsed[0].t) {
      console.log('[getTagsForRating] Dynamic tags generated via NVIDIA AI Brain ✓');
      return parsed.slice(0, limit);
    }
  } catch (e) {
    console.warn('[getTagsForRating] NVIDIA tag generation failed:', e.message);
  }
  return null;
}

async function getTagsForRating(rating = 5, limit = 8, client = null) {
  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const bizName = client ? client.business_name : '';
  const bizType = client ? (client.category || client.description) : '';

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
      return nvidiaTags;
    }
  } catch (e) {
    console.warn('[getTagsForRating] NVIDIA tags fallback:', e.message);
  }

  // 3. Local fallback tags
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


// ═══════════════════════════════════════════════════════════════
//  REVIEW GENERATION (Gemini → ReviewWriter Agent → Local)
// ═══════════════════════════════════════════════════════════════

const { generateReviewWithAgent } = require('./reviewWriterAgent');

async function generateReview({ slug, rating = 5, tags = [], previousText = '', client = null }) {
  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const bizName = client ? client.business_name : 'this wonderful place';
  const bizType = client ? client.category : 'restaurant and dessert spot';

  // ═══ 1. TRY GEMINI FIRST (smartest, truly unique every time) ═══
  if (isGeminiAvailable()) {
    try {
      const userText = tags.length > 0 ? tags.join(', ') : (previousText || '');
      const review = await generateReviewWithGemini({
        rating: r,
        businessName: bizName,
        businessType: bizType,
        userText,
        tags,
      });
      if (review && review.length > 20) {
        console.log('[AI Engine] Review generated via Gemini ✓');
        return review;
      }
    } catch (e) {
      console.warn('[AI Engine] Gemini review failed, falling back:', e.message);
    }
  }

  // ═══ 2. TRY REVIEW-WRITER AGENT (RAGFlow → OpenAI → local) ═══
  try {
    const userText = tags.length > 0 ? tags.join(', ') : (previousText || 'Great food and service');
    const agentRes = await generateReviewWithAgent({
      rating: r,
      businessName: bizName,
      businessType: bizType,
      userText: userText
    });
    if (agentRes && agentRes.ok && agentRes.review) {
      console.log('[AI Engine] Review generated via', agentRes.source, '✓');
      return agentRes.review;
    }
  } catch (err) {
    console.warn('[AI Engine] review-writer agent fallback to local synthesizer:', err.message);
  }

  // ═══ 3. LOCAL SYNTHESIZER (last resort) ═══
  const domain = getBusinessDomain(client);

  const INTROS_5 = [
    `Had a truly memorable visit to ${bizName} recently!`,
    `Without a doubt, one of our absolute favourite spots in the area.`,
    `Stopped by ${bizName} for an evening food and dessert trip, and loved every bit of it.`,
    `Everything about ${bizName} was on point from start to finish.`,
    `Such a delightful experience dining here with friends and family!`
  ];

  const OUTROS_5 = [
    `Highly recommended to everyone looking for great food, desserts, and good vibes!`,
    `Will definitely be coming back again and again — easily a 5-star experience!`,
    `Kudos to the entire team for maintaining top-notch food standards and hospitality.`,
    `Leaving 5 stars without hesitation. A must-visit spot!`
  ];

  const INTROS_LOW = [
    `Visited ${bizName} recently.`,
    `Had our dinner here earlier this week.`
  ];

  const OUTROS_LOW = [
    `Hope the management works on service speed and quality improvements.`,
    `Has good potential with better kitchen consistency.`
  ];

  const intro = r >= 4 ? INTROS_5[Math.floor(Math.random() * INTROS_5.length)] : INTROS_LOW[Math.floor(Math.random() * INTROS_LOW.length)];
  const outro = r >= 4 ? OUTROS_5[Math.floor(Math.random() * OUTROS_5.length)] : OUTROS_LOW[Math.floor(Math.random() * OUTROS_LOW.length)];

  let sentences = [];
  const tagPool = localGetTagsForRating(r, 12);

const TAG_VARIATION_BANKS = {
  ice_cream: [
    'The ice creams are exquisitely creamy, rich, and full of delightful flavours.',
    'Their ice cream flavours have the perfect velvety texture with generous scoops.',
    'Tried the artisan ice cream varieties and every single one was pure bliss.',
    'The ice creams here are smooth, freshly prepared, and genuinely delicious.',
    'You get generous portions of creamy, indulgent ice cream that hits the spot.',
    'Hands down some of the most decadent and flavourful ice creams in town.'
  ],
  milkshake: [
    'The thick milkshakes are perfectly blended and an absolute treat.',
    'Milkshakes had an incredibly rich, velvety consistency and rich flavour.',
    'Every sip of their thick shake is packed with creamy, chilled perfection.',
    'Loved the milkshake selection — super thick, creamy, and made with top ingredients.',
    'The milkshakes are thick, cold, and loaded with authentic flavour.',
    'Ordered the signature thick shakes and they completely exceeded all expectations.'
  ],
  pizza: [
    'The pizzas are freshly baked with a golden crispy crust and plenty of cheese.',
    'Freshly baked pizza with generous mozzarella and mouth-watering toppings.',
    'The pizza crust was crispy on the edges with rich sauce and gooey melted cheese.',
    'Loved the pizza — piping hot, flavourful, and baked to golden perfection.',
    'The pizza toppings are fresh and the crust has the ultimate crunch.',
    'Deliciously cheesy, hot, and satisfying pizzas made fresh to order.'
  ],
  chicken: [
    'The fried chicken is crispy on the outside, tender and juicy inside.',
    'Crispy chicken seasoned to perfection with an irresistible crunch.',
    'Chicken was fried fresh, wonderfully juicy, and served piping hot.',
    'The crispy fried chicken and spicy wings were crunchy, tender, and bursting with flavor.',
    'Chicken pieces are well-marinated, crispy, and full of authentic spice.',
    'Tender, juicy, and coated in the crispiest golden batter.'
  ],
  service: [
    'The service is exceptionally prompt, and the staff are warmly welcoming.',
    'Staff members are attentive, courteous, and provide lightning fast service.',
    'Impressed by the friendly hospitality and quick turnaround times.',
    'Service was smooth, professional, and handled with genuine care.',
    'The team was proactive, polite, and made sure we had everything we needed.',
    'Quick service and welcoming smiles made the visit extra special.'
  ],
  pocket_friendly: [
    'Generous portions at very reasonable prices — outstanding value.',
    'Pricing is very reasonable and gives incredible value for every rupee spent.',
    'Pocket-friendly pricing combined with top-tier food quality is a huge plus.',
    'Great food at prices that are easy on the pocket without compromising on taste.',
    'Super affordable menu with large portions that leave you completely satisfied.',
    'Outstanding value for money — generous servings and very honest pricing.'
  ],
  ambience: [
    'The night fairy lights and vibrant ambience create a wonderful cozy vibe.',
    'Ambience is warm, lively, and beautifully lit for evening hangouts.',
    'Loved the aesthetic decor, fairy lights, and relaxing background music.',
    'The seating area is cozy, modern, and has a great welcoming atmosphere.',
    'Fairy lights and comfortable seating make this the ultimate evening spot.',
    'Great vibe, peaceful seating, and beautiful lighting throughout the place.'
  ],
  cream_more: [
    'The Cream More special desserts and sundaes are top-notch and a must-try.',
    'Cream More desserts are rich, layered with goodness, and wonderfully satisfying.',
    'Their signature Cream More sundaes are an absolute masterpiece of sweetness.',
    'Tried the Cream More special sundae and it was decadent from first bite to last.'
  ],
  family: [
    'A wonderful, clean environment for family gatherings and evening hangouts.',
    'Spacious, hygienic, and very accommodating for families and groups.',
    'Family-friendly setting with clean tables, great music, and comfortable seating.',
    'A fantastic spot to bring family and kids for a relaxed and delicious meal.'
  ],
  recommend: [
    'Hands down one of the finest food and dessert spots in town — 10/10 experience!',
    'Would recommend this wonderful spot to all foodies and dessert lovers without hesitation.',
    'An absolute 10/10 experience that I will gladly recommend to all my friends.',
    'Definitely a must-visit spot in the area — top quality in every aspect.'
  ]
};

function getSentenceForTag(tagLabel) {
  const t = (tagLabel || '').toLowerCase();
  let pool = null;
  if (t.includes('ice cream') || t.includes('gelato')) pool = TAG_VARIATION_BANKS.ice_cream;
  else if (t.includes('shake') || t.includes('milk')) pool = TAG_VARIATION_BANKS.milkshake;
  else if (t.includes('pizza')) pool = TAG_VARIATION_BANKS.pizza;
  else if (t.includes('chicken') || t.includes('wing')) pool = TAG_VARIATION_BANKS.chicken;
  else if (t.includes('service') || t.includes('staff') || t.includes('fast')) pool = TAG_VARIATION_BANKS.service;
  else if (t.includes('pocket') || t.includes('value') || t.includes('price')) pool = TAG_VARIATION_BANKS.pocket_friendly;
  else if (t.includes('ambien') || t.includes('light') || t.includes('cozy') || t.includes('vibe')) pool = TAG_VARIATION_BANKS.ambience;
  else if (t.includes('cream more') || t.includes('sundae') || t.includes('dessert')) pool = TAG_VARIATION_BANKS.cream_more;
  else if (t.includes('family') || t.includes('clean') || t.includes('hygiene')) pool = TAG_VARIATION_BANKS.family;
  else if (t.includes('recommend') || t.includes('favourite') || t.includes('10/10')) pool = TAG_VARIATION_BANKS.recommend;

  if (pool && pool.length > 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const cleanTag = tagLabel.replace(/^[^\w\s]+/, '').trim();
  const genericVariations = [
    `The ${cleanTag.toLowerCase()} was exceptionally fresh, flavorful, and prepared with great care.`,
    `Really impressed with the ${cleanTag.toLowerCase()} — outstanding taste and presentation.`,
    `The ${cleanTag.toLowerCase()} stood out as a highlight of our visit.`,
    `Enjoyed the quality of the ${cleanTag.toLowerCase()}, completely satisfied with the taste.`
  ];
  return genericVariations[Math.floor(Math.random() * genericVariations.length)];
}

  if (tags.length > 0) {
    tags.forEach(selectedTag => {
      sentences.push(getSentenceForTag(selectedTag));
    });
  } else {
    const sampleDish = domain.dishes[Math.floor(Math.random() * domain.dishes.length)];
    const sampleQuality = domain.qualities[Math.floor(Math.random() * domain.qualities.length)];
    sentences.push(`The ${sampleDish.toLowerCase()} was ${sampleQuality} and exceeded expectations.`);
    sentences.push(`The staff were courteous and the ambience made for a very relaxing visit.`);
  }

  const uniqueSentences = Array.from(new Set(sentences));
  const connectors = [' ', ' Moreover, ', ' Plus, ', ' In addition, ', ' Also, '];

  let body = '';
  uniqueSentences.forEach((s, idx) => {
    if (idx === 0) body += s;
    else {
      const conn = connectors[Math.floor(Math.random() * connectors.length)];
      body += conn + s;
    }
  });

  return `${intro} ${body} ${outro}`.replace(/\s+/g, ' ').trim();
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
