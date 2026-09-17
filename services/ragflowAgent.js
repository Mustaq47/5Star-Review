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

/**
 * Rating-Calibrated Word & Phrase Prediction Dictionary
 * Supports continuous 1+ character progressive word completion & sentence continuation
 */
const WORD_PHRASE_DICTIONARY = {
  5: [
    { word: 'food', phrases: [' was fresh, delicious, and cooked to perfection.', ' quality and presentation were absolutely outstanding.', ' here is 10/10 — full of rich authentic flavors.'] },
    { word: 'chicken', phrases: [' was crispy on the outside, juicy inside, and perfectly seasoned.', ' tenders and hot wings were golden, crisp, and flavorful.', ' bucket was freshly fried with unbeatable crunch in every bite.'] },
    { word: 'crispy', phrases: [' fried chicken and crunchy burgers were top-notch.', ' fries were hot, golden, and seasoned to perfection.'] },
    { word: 'burger', phrases: [' was super fresh, delightfully juicy, and packed with flavor.', ' buns were soft and toasted with the best crunchy patty.', ' had the perfect spicy crunch, fresh lettuce, and savory dressing.'] },
    { word: 'zinger', phrases: [' burger was loaded with flavor and had a fantastic crunch.', ' burger patty was thick, crispy on the outside, and very juicy.'] },
    { word: 'fries', phrases: [' were hot, crisp, and dusted with flavorful peri peri seasoning.', ' had the perfect golden crispiness and generous seasoning.', ' were piping hot, delightfully crunchy, and not soggy at all.'] },
    { word: 'peri', phrases: [' peri fries were spicy, tangy, and super addictive.', ' peri seasoning had great zesty crunch and bold flavor.'] },
    { word: 'krushers', phrases: [' and chilled beverages were refreshing and perfectly blended.', ' were thick, icy cold, and complemented the meal wonderfully.'] },
    { word: 'shakes', phrases: [' were thick, velvety smooth, and loaded with authentic flavor.', ' and cold drinks were served at the perfect temperature.'] },
    { word: 'milkshakes', phrases: [' were thick, chilled, and packed with authentic flavor.', ' were creamy and delightful from first sip to last.'] },
    { word: 'service', phrases: [' was lightning fast, warm, and attentive throughout our visit.', ' was exceptionally prompt and the staff were warmly welcoming.', ' was smooth, efficient, and delivered with a genuine smile.'] },
    { word: 'staff', phrases: [' were extremely welcoming, polite, and very helpful.', ' were courteous, attentive, and maintain high hygiene standards.', ' processed our order in record time and checked on our comfort.'] },
    { word: 'clean', phrases: [' dining area, spotless tables, and pristine surroundings.', ' and well-maintained environment following great hygiene standards.'] },
    { word: 'hygiene', phrases: [' and cleanliness standards were visibly top tier.', ' was well maintained with spotless tables and tidy presentation.'] },
    { word: 'ambience', phrases: [' was cozy, vibrant, and perfect for family and friends.', ' was pleasant, relaxing, and made our dining visit memorable.'] },
    { word: 'atmosphere', phrases: [' is warm, lively, and great for evening hangouts.', ' was welcoming, cheerful, and very comfortable.'] },
    { word: 'taste', phrases: [' was 10/10 and consistent 5-star quality as always.', ' was authentic, rich, and bursting with flavor in every bite.', ' was mouthwatering and exceeded all our expectations.'] },
    { word: 'delicious', phrases: [' food, generous portions, and lightning fast service.', ' flavors and wonderful hospitality from start to finish.', ' meal that satisfied all our cravings.'] },
    { word: 'great', phrases: [' food quality, amazing ambience, and courteous staff.', ' taste, fast service, and pocket-friendly pricing.', ' experience with wonderful hospitality and delicious flavors.'] },
    { word: 'generous', phrases: [' portion sizes and very affordable pricing across the menu.', ' toppings, rich sauces, and steaming hot food.'] },
    { word: 'value', phrases: [' for money with hearty portions and reasonable pricing.', ' for money is outstanding considering the premium quality.'] },
    { word: 'pocket', phrases: ['-friendly pricing with generous portions and top quality.', '-friendly combo meals that offer great value.'] },
    { word: 'highly', phrases: [' recommend this spot to anyone looking for great taste and quick service!', ' recommend trying their signature items — truly 5-star quality!'] },
    { word: 'definitely', phrases: [' coming back again soon with friends and family!', ' worth visiting if you appreciate great taste and quality.'] },
    { word: 'loved', phrases: [' the crispy fried chicken, burgers, and peri peri fries.', ' every single dish we ordered today — fresh and flavorful!'] },
    { word: 'everything', phrases: [' was freshly prepared, piping hot, and full of flavor.', ' was on point today from the food to the service!'] },
    { word: 'pizza', phrases: [' was cheesy, hot, with a golden crispy baked crust.', ' had generous toppings and amazing flavor in every bite.'] },
    { word: 'ice', phrases: [' creams and thick shakes were rich, creamy, and delightful.', ' creams were velvety smooth and had great variety.'] },
    { word: 'biryani', phrases: [' was fragrant, richly spiced, and full of tender meat pieces.', ' had authentic aroma and cooked to fluffy perfection.'] },
    { word: 'coffee', phrases: [' was brewed fresh and had a rich inviting aroma.', ' was strong, smooth, and perfectly prepared.'] }
  ],
  4: [
    { word: 'food', phrases: [' was tasty, well-prepared, and served fresh.', ' arrived in good time and was enjoyable.'] },
    { word: 'chicken', phrases: [' was nice and crispy with good flavor.', ' was well cooked and served hot.'] },
    { word: 'burger', phrases: [' was tasty and reasonably sized.', ' had good flavor and fresh buns.'] },
    { word: 'fries', phrases: [' were crispy, hot, and well salted.', ' had good crunch and nice seasoning.'] },
    { word: 'service', phrases: [' was prompt, polite, and handled with care.', ' was friendly and accommodating.'] },
    { word: 'staff', phrases: [' were helpful, courteous, and polite.', ' took our orders smoothly.'] },
    { word: 'taste', phrases: [' was good and well-balanced across all items.', ' was enjoyable and consistent.'] },
    { word: 'great', phrases: [' experience overall with good food.', ' place for a casual quick meal.'] }
  ],
  1: [
    { word: 'food', phrases: [' was cold when served and took far too long.', ' lacked seasoning and was not fresh.'] },
    { word: 'service', phrases: [' was extremely slow and staff were unresponsive.', ' needs urgent management attention.'] },
    { word: 'staff', phrases: [' were unhelpful and ignored our requests.', ' were inattentive to customers.'] },
    { word: 'waiting', phrases: [' time was over 35 minutes for a basic order.', ' was far too long and disorganized.'] },
    { word: 'taste', phrases: [' was below expectations and quite bland.', ' was disappointing compared to usual.'] }
  ]
};
WORD_PHRASE_DICTIONARY[2] = WORD_PHRASE_DICTIONARY[1];
WORD_PHRASE_DICTIONARY[3] = WORD_PHRASE_DICTIONARY[4];


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
  const dict = WORD_PHRASE_DICTIONARY[tier] || WORD_PHRASE_DICTIONARY[5];
  const transitions = RATING_CONTEXT_TRANSITIONS[tier] || RATING_CONTEXT_TRANSITIONS[5];
  const raw = (text || '').toLowerCase();

  if (!raw || raw.trim().length === 0) {
    const defaultSuggestions = tier >= 4 ? [
      'Food was absolutely delicious and service was super fast!',
      'Loved the crispy chicken and delicious burgers!'
    ] : [
      'Food took too long to arrive and service was slow.'
    ];
    return { primary: defaultSuggestions[0], alternatives: defaultSuggestions };
  }

  const endsWithSpace = /\s$/.test(raw);
  const trimmed = raw.trim();
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1] || '';

  // 1. Continuous Word Completion: when user is typing a word (not ending in space)
  if (!endsWithSpace && lastWord.length >= 1) {
    // Exact or prefix match against dictionary
    const match = dict.find(item => item.word.startsWith(lastWord));
    if (match) {
      const restOfWord = match.word.slice(lastWord.length);
      const phrase = match.phrases[Math.floor(Math.random() * match.phrases.length)];
      const primary = restOfWord + phrase;
      return {
        primary,
        alternatives: match.phrases.map(p => restOfWord + p)
      };
    }
  }

  // 2. Context Transitions (multi-word ending matches prioritized)
  for (const [trigger, continuations] of Object.entries(transitions)) {
    if (trimmed.endsWith(trigger)) {
      const chosen = continuations[Math.floor(Math.random() * continuations.length)];
      const prefix = endsWithSpace ? chosen.trim() : (' ' + chosen.trim());
      return {
        primary: prefix,
        alternatives: continuations.map(c => endsWithSpace ? c.trim() : (' ' + c.trim()))
      };
    }
  }

  // 3. Sentence Ending / Punctuation Bridge
  if (trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith(',')) {
    const bridges = tier >= 4 ? [
      ' Also, the service was lightning fast and courteous.',
      ' In addition, the ambience was wonderful and cozy.',
      ' Highly recommended to anyone looking for great taste and hygiene!',
      ' Definitely coming back again with friends soon.'
    ] : [
      ' Also, the staff were unresponsive when we asked for help.',
      ' In addition, the waiting time was far too long.'
    ];
    const bridge = bridges[Math.floor(Math.random() * bridges.length)];
    return {
      primary: endsWithSpace ? bridge.trim() : (' ' + bridge.trim()),
      alternatives: bridges
    };
  }

  // 4. Default graceful continuation
  const fallback = tier >= 4
    ? ' was fresh, flavorful, and served with great hospitality!'
    : ' needs significant improvement in service and quality.';
  return {
    primary: endsWithSpace ? fallback.trim() : (' ' + fallback.trim()),
    alternatives: [fallback]
  };
}


async function generateTagsWithNvidia({ rating = 5, businessName = '', businessType = '', category = '', limit = 8 } = {}) {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) return null;
  const nvidiaBase = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
  const nvidiaModel = process.env.NVIDIA_MODEL || 'deepseek-ai/deepseek-v4-flash-0731';

  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const sentimentGuidance = r === 5
    ? '5-star glowing praise, top signature dishes, fast service, cleanliness'
    : r === 4
    ? '4-star positive, good food, friendly staff, fair value'
    : r === 3
    ? '3-star neutral/average experience (e.g. ⏳ Average Wait Time, 🍗 Decent Taste, ⚡ Normal Service, 💰 Fair Price)'
    : r === 2
    ? '2-star constructive issues (e.g. ⏳ Delayed Order, 🍗 Greasy Food, ⚡ Slow Service, ⚠️ Inattentive Staff)'
    : '1-star critical complaints (e.g. ❌ Disappointing Taste, ⏳ Long Delay, ❄️ Food Served Cold, ⚡ Unresponsive Staff, 🧼 Poor Hygiene)';

  const prompt = `Generate ${limit} clickable quick review topic tags for a Google review writing assistant:
- Business: ${businessName || 'Local Business'}
- Category: ${businessType || category || 'Restaurant'}
- Rating: ${r} out of 5 stars (${sentimentGuidance})

Output ONLY a valid JSON array of objects with:
- "l": Short label with appropriate emoji (max 22 chars) that reflects the ${r}-star experience.`;

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
  const targetLimit = Math.max(limit, 8);
  const cacheKey = `${slug}:${r}:${targetLimit}`;

  const cached = dynamicTagsCache.get(cacheKey);
  if (cached && Date.now() - cached.time < TAGS_CACHE_TTL && Array.isArray(cached.tags) && cached.tags.length >= 5) {
    return cached.tags;
  }

  // Fast path for 5-star rating with pre-configured client tags
  if (r === 5 && client && client.tags) {
    try {
      const parsed = JSON.parse(client.tags);
      if (Array.isArray(parsed) && parsed.length >= 5) {
        const final5 = parsed.slice(0, targetLimit);
        dynamicTagsCache.set(cacheKey, { time: Date.now(), tags: final5 });
        return final5;
      }
    } catch (e) {}
  }

  let resultTags = [];

  // Helper with fast timeout for AI tags to prevent page load stalling
  const fastAiTimeout = (promise, ms = 3000) => {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI tag timeout')), ms))
    ]);
  };

  // 1. Try Gemini AI Brain with rating-calibrated prompt
  if (isGeminiAvailable() && client) {
    try {
      const tags = await fastAiTimeout(generateTagsWithGemini({
        rating: r,
        businessName: bizName,
        businessType: bizType,
        category: bizType,
        limit: targetLimit,
      }), 3000);
      if (tags && tags.length >= 5) {
        dynamicTagsCache.set(cacheKey, { time: Date.now(), tags });
        return tags;
      } else if (tags && tags.length > 0) {
        resultTags = tags;
      }
    } catch (e) {
      console.warn('[getTagsForRating] Gemini tags skipped/timed out:', e.message);
    }
  }

  // 2. Try NVIDIA NIM AI Brain
  if (resultTags.length < 5) {
    try {
      const nvidiaTags = await generateTagsWithNvidia({
        rating: r,
        businessName: bizName,
        businessType: bizType,
        category: bizType,
        limit: targetLimit
      });
      if (nvidiaTags && nvidiaTags.length >= 5) {
        dynamicTagsCache.set(cacheKey, { time: Date.now(), tags: nvidiaTags });
        return nvidiaTags;
      } else if (nvidiaTags && nvidiaTags.length > 0) {
        resultTags = [...resultTags, ...nvidiaTags];
      }
    } catch (e) {
      console.warn('[getTagsForRating] NVIDIA tags fallback:', e.message);
    }
  }

  // 3. Fallback to client configured seed tags ONLY for 5-star ratings
  if (r === 5 && client && client.tags) {
    try {
      const parsed = JSON.parse(client.tags);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const existingLabels = new Set(resultTags.map(t => (t.l || t.label || '').toLowerCase()));
        for (const pt of parsed) {
          const l = (pt.l || pt.label || '').toLowerCase();
          if (!existingLabels.has(l)) {
            resultTags.push(pt);
            existingLabels.add(l);
          }
        }
        if (resultTags.length >= 5) {
          const final5 = resultTags.slice(0, targetLimit);
          dynamicTagsCache.set(cacheKey, { time: Date.now(), tags: final5 });
          return final5;
        }
      }
    } catch (e) { }
  }

  // 4. Rating-Calibrated Local Generator (Guarantees distinct, star-accurate tags for 1, 2, 3, 4, 5 stars)
  const localFallback = localGetTagsForRating(r, targetLimit, client);
  const existingLabels = new Set(resultTags.map(t => (t.l || t.label || '').toLowerCase()));
  for (const lt of localFallback) {
    const l = (lt.l || lt.label || '').toLowerCase();
    if (!existingLabels.has(l)) {
      resultTags.push(lt);
      existingLabels.add(l);
    }
    if (resultTags.length >= targetLimit) break;
  }

  const finalTags = resultTags.slice(0, targetLimit);
  dynamicTagsCache.set(cacheKey, { time: Date.now(), tags: finalTags });
  return finalTags;
}

function localGetTagsForRating(r, limit = 8, client = null) {
  const name = ((client && client.business_name) || '').toLowerCase();
  const slug = ((client && client.slug) || '').toLowerCase();
  const cat = ((client && client.category) || '').toLowerCase();
  const desc = ((client && client.description) || '').toLowerCase();

  const isKfcOrBurger = slug.includes('kfc') || name.includes('kfc') || desc.includes('zinger') || (cat.includes('burger') && !cat.includes('ice cream'));
  const isDessertCafe = !isKfcOrBurger && (slug.includes('spicy') || name.includes('spicy') || cat.includes('ice cream') || cat.includes('shake') || cat.includes('pizza'));

  if (isKfcOrBurger) {
    if (r === 5) {
      return [
        {
          l: '🍗 Crispy Fried Chicken',
          t: 'The Hot & Crispy fried chicken was super crunchy on the outside, juicy inside, and served fresh. | The fried chicken was piping hot with the absolute best crunch and seasoning. | The chicken tenders and wings were golden, crisp, and succulent. | Loved the crispy chicken — tender, juicy, and packed with authentic spices. | The fried chicken bucket was freshly fried with unbeatable crunch in every bite. | Each piece of chicken was hot, tender, and seasoned generously.'
        },
        {
          l: '🍔 Zinger Burger',
          t: 'The Zinger burger had the perfect spicy crunch, fresh lettuce, and soft toasted buns. | The burger was super fresh, delightfully juicy, and packed with flavor. | The spicy chicken burger hit the spot with its bold taste and crunchy bite. | Loved the burger patty — thick, crispy on the outside, and very juicy. | The zinger burger was loaded with flavor and had a fantastic crunch. | Buns were soft and toasted with the best crunchy patty.'
        },
        {
          l: '🍟 Peri Peri Fries',
          t: 'The fries were piping hot, crisp, and dusted with flavorful peri peri seasoning. | The French fries had the perfect golden crispiness and generous seasoning. | The peri peri fries were spicy, tangy, and super addictive. | Loved the crunchy texture and bold peri peri flavor on the fries. | The fries arrived fresh from the fryer with a satisfying crunch. | French fries were crispy, hot, and seasoned just right.'
        },
        {
          l: '🍗 Hot Wings & Strips',
          t: 'Hot wings and chicken tenders were golden, crisp, and succulent. | The spicy hot wings had an amazing kick and crunchy coating. | Boneless strips were tender, moist, and delightfully crispy. | The hot wings were served piping hot and seasoned to perfection. | Loved the spicy glaze and crunch on the chicken tenders.'
        },
        {
          l: '🥤 Chilled Krushers',
          t: 'The beverages and thick shakes were refreshing, perfectly chilled, and delicious. | The thick shakes had fantastic consistency and rich creamy taste. | Loved the chilled drinks and Krushers — served at the perfect temperature. | The thick milkshakes were velvety smooth and loaded with authentic flavor. | Cold drinks were a great thirst-quencher with the spicy chicken.'
        },
        {
          l: '⚡ Lightning Fast Service',
          t: 'Counter service was exceptionally prompt and the staff were warmly welcoming. | Order was prepared in record time with great efficiency. | Quick, smooth, and hassle-free service from the moment we walked in. | Staff was friendly, helpful with recommendations, and served with a smile. | The service was lightning fast even during peak rush hours.'
        },
        {
          l: '✨ Clean & Hygienic',
          t: 'The dining area and counters were spotless, following excellent hygiene standards. | Super clean tables, sanitized dining space, and pristine surroundings. | The entire space was remarkably neat, well-maintained, and hygienic. | Impressed by how clean and well-kept the dining hall and counters were. | Spotless presentation, clean trays, and very pleasant atmosphere.'
        },
        {
          l: '👨‍👩‍👧 Family Friendly',
          t: 'A comfortable, spacious environment for a quick bite with friends and family. | Very welcoming and family-friendly setting with comfortable seating. | Spacious and relaxed vibe, making it perfect for group hangouts. | Cozy and inviting ambience with pleasant lighting and good music. | The atmosphere is lively, upbeat, and wonderful for an evening meal.'
        },
        {
          l: '💖 10/10 Taste',
          t: 'Consistent 5-star quality and delicious flavors as always — highly recommended! | Food tasted absolutely delicious, fresh, and bursting with flavor. | Incredible flavor profile and premium quality in every single bite. | Everything we ordered was cooked to perfection and tasted fantastic. | Truly delicious flavors that make you want to visit again.'
        }
      ].slice(0, limit);
    }
    if (r === 4) {
      return [
        {
          l: '🍗 Tasty Fried Chicken',
          t: 'The fried chicken was tasty, seasoned well, and served hot. | Good crunch on the chicken pieces with decent juiciness. | Chicken was prepared well and had good flavor throughout. | Satisfied with the fried chicken quality and crispiness. | Enjoyed the fried chicken meal, cooked nicely.'
        },
        {
          l: '🍔 Good Zinger Burger',
          t: 'The Zinger burger had good flavor and fresh crunchy lettuce. | Burger patty was crispy and buns were fresh. | A satisfying burger that hit the spot for a quick lunch. | Good portion size on the burger with tasty mayo sauce. | Decent chicken burger with nice seasoning.'
        },
        {
          l: '🍟 Crispy French Fries',
          t: 'Fries were hot, nicely salted, and crisp. | French fries had good crunch and were served warm. | Enjoyed the seasoned fries alongside our meal. | Good crispy texture on the fries without too much oil. | Satisfying fries with good portion size.'
        },
        {
          l: '🥤 Refreshing Krushers',
          t: 'Drinks and Krushers were chilled and paired well with the meal. | Refreshing cold beverages served at the right temperature. | Good flavor and texture on the cold shakes. | Shakes were tasty and reasonably thick. | Nice refreshing drink options available.'
        },
        {
          l: '⚡ Friendly Staff',
          t: 'Staff were polite, helpful, and took our orders quickly. | Pleasant customer service and prompt order handling. | Courteous counter staff who answered questions nicely. | Friendly team and smooth ordering experience. | Staff were attentive and handed over our food promptly.'
        },
        {
          l: '💰 Fair Value',
          t: 'Good portions and reasonable combo meal pricing. | Value for money fast food combos that fill you up. | Decent pricing for the food quality offered. | Good value options available on the menu. | Fair deal on family buckets and burger combos.'
        },
        {
          l: '🌟 Pleasant Ambience',
          t: 'Comfortable seating and pleasant atmosphere for a casual meal. | Clean environment with good air conditioning and lighting. | Nice casual spot to sit and eat with friends. | Comfortable tables and good background music. | Relaxing spot for an evening fast-food bite.'
        },
        {
          l: '👍 Solid Overall Experience',
          t: 'Overall a very solid and enjoyable fast-food visit. | Good experience and would gladly drop by again. | Reliable quality and pleasant meal overall. | Satisfied with our meal and the service speed. | A dependable choice when craving fried chicken.'
        }
      ].slice(0, limit);
    }
    if (r === 3) {
      return [
        {
          l: '⏳ Average Wait Time',
          t: 'Order took a moderate amount of time to be prepared during the rush. | Had to wait around 15 minutes before the order was called. | Wait time was a bit longer than expected for fast food. | Order processing was moderate during busy hours. | Had to stand in queue for a while to collect the food.'
        },
        {
          l: '🍗 Decent Fried Chicken',
          t: 'Chicken was okay, but could have been slightly crispier. | Fried chicken was average, flavor was acceptable but nothing special. | Chicken pieces were a bit smaller than usual today. | Decent taste though slightly oily on the outside. | Taste was standard fast-food quality.'
        },
        {
          l: '🍔 Standard Burger',
          t: 'Burger was average in taste, bun was slightly dry. | Zinger burger was okay, could use a bit more sauce. | Patty was moderately crisp but expected more flavor. | Standard fast food burger, nothing extraordinary. | Bun felt slightly toasted too long.'
        },
        {
          l: '🍟 Okay Fries',
          t: 'Fries were standard, could use a bit more seasoning. | Fries were moderately warm but not ultra crispy. | Average fries, flavor was okay but could be crispier. | Standard portion of fries with light salt. | Fries were decent though a bit soft.'
        },
        {
          l: '⚡ Normal Service Speed',
          t: 'Counter service was standard, took a little time at the billing counter. | Service was average and took some time to get our tray. | Staff were busy and moving at a moderate pace. | Service was neither fast nor very slow. | Standard counter interaction.'
        },
        {
          l: '💰 Fair Pricing',
          t: 'Pricing is okay for the portion sizes. | Prices are average compared to other fast food chains. | Combos are reasonably priced though ala-carte feels high. | Fair pricing for what is served. | Cost is standard for fast food.'
        },
        {
          l: '🧼 Standard Cleanliness',
          t: 'Dining area was okay, though tables could be cleared faster. | Seating area was standard, few tables needed wiping. | Cleanliness was acceptable but has room to improve. | Restroom and counter were okay. | Average upkeep in the dining hall.'
        },
        {
          l: '😐 Mixed Experience',
          t: 'Average visit with some items better than others. | Overall an okay experience, met basic expectations. | Some dishes were good while others were just okay. | Nothing stood out particularly during this visit. | A standard average fast-food visit.'
        }
      ].slice(0, limit);
    }
    if (r === 2) {
      return [
        {
          l: '⏳ Delayed Order Delivery',
          t: 'Had to wait quite a long time for our order to arrive. | Took over 25 minutes to get a basic meal. | Unreasonable wait time for a fast-food outlet. | Multiple people who came after us got their orders first. | Order preparation was noticeably delayed.'
        },
        {
          l: '🍗 Chicken Was Greasy',
          t: 'Fried chicken was overly oily and lacked the signature crispiness. | Chicken skin was soggy and too greasy to enjoy. | Meat felt dry inside while the crust was overly oily. | Chicken was lukewarm and lacked fresh crunch. | Underwhelming chicken quality today.'
        },
        {
          l: '🍔 Burger Lacked Freshness',
          t: 'Burger was lukewarm and bun was not fresh. | Bun was dry and crumbly, and lettuce was wilted. | Burger patty felt like it was sitting under a warmer for too long. | Very little sauce and burger was bland. | Burger was sloppily put together.'
        },
        {
          l: '🍟 Soggy Fries',
          t: 'Fries were limp, greasy, and not crispy at all. | French fries arrived cold and soft. | Fries lacked seasoning and tasted stale. | Very disappointing limp fries. | Fries had no crunch and tasted reheated.'
        },
        {
          l: '⚡ Slow Counter Service',
          t: 'Staff seemed overwhelmed and service was noticeably slow. | Counter staff took a long time to punch in simple orders. | Staff communication was poor regarding order delays. | Long queue with only one billing counter open. | Service turnaround needs serious improvement.'
        },
        {
          l: '⚠️ Inattentive Staff',
          t: 'Staff took multiple reminders to assist with our order. | Staff seemed indifferent when we pointed out missing items. | Had to ask multiple times for napkins and sauce packets. | Lack of customer focus at the counter. | Unhelpful attitude when handling customer queries.'
        },
        {
          l: '🧼 Needs Better Hygiene',
          t: 'Tables needed proper wiping and clearing. | Tables were sticky and trash bins were overflowing. | Dining area looked untidy with trays left uncleaned. | Floor was sticky around the beverage dispenser. | Hygiene standards need immediate attention.'
        },
        {
          l: '📉 Scope for Improvement',
          t: 'Quality and turnaround time need significant improvement. | Disappointing visit compared to past experiences. | Food consistency was lacking today. | Hope management fixes the service speed and food freshness. | Overall below the standard expected.'
        }
      ].slice(0, limit);
    }
    // r === 1
    return [
      {
        l: '❌ Disappointing Taste',
        t: 'Food was far below expectations, bland, and lacked freshness. | Worst fast food experience we have had in a long time. | Food tasted stale, completely unseasoned, and unpleasant. | Completely unsatisfied with the flavor and food quality. | None of the food items met basic quality standards.'
      },
      {
        l: '⏳ Excessive Wait Time',
        t: 'Waited over 35 minutes for a simple fast food order. | Horrendous delay with zero explanation from the team. | Kept waiting endlessly while the staff seemed unbothered. | Order took almost 45 minutes for fast food. | Extreme delays that ruined our dining schedule.'
      },
      {
        l: '❄️ Food Served Cold',
        t: 'Food arrived cold, stale, and not freshly prepared. | Chicken and fries were completely cold when handed to us. | Food felt like it was sitting on the counter for hours. | Cold burger with hardened cheese and chilly patty. | Lukewarm, soggy, and completely unappetizing.'
      },
      {
        l: '🍗 Undercooked / Oily Chicken',
        t: 'Chicken pieces were soggy, overly greasy, and poorly fried. | Chicken had strange smell and was not cooked properly inside. | Heavy rancid oil taste on the chicken coating. | Chicken was completely rubbery and undercooked. | Oily mess with no crunch whatsoever.'
      },
      {
        l: '🍔 Cold Stale Burger',
        t: 'Burger patty was dry, cold, and bun was stale. | Stale, rock hard bun with cold chicken patty. | Burger was completely ruined and fell apart immediately. | Disgusting burger quality that was inedible. | Sloppy, cold, and missing key ingredients.'
      },
      {
        l: '🍟 Limp & Stale Fries',
        t: 'Fries were cold, soggy, and completely unseasoned. | Stale limp fries that tasted like they were fried hours ago. | Oily, cold potato fries with zero crispiness. | Inedible fries that were thrown away. | Complete waste of money on the fries.'
      },
      {
        l: '⚡ Unresponsive Staff',
        t: 'Staff were indifferent, rude, and unhelpful when we reported the issue. | Counter staff completely ignored customer complaints. | Extremely unprofessional and disrespectful behavior from staff. | Staff showed zero empathy or willingness to fix our order. | Worst customer service encounter.'
      },
      {
        l: '🧼 Poor Cleanliness',
        t: 'Messy dining area with unclean tables and dirty floors. | Dirty tables everywhere with leftover food and flies. | Disgusting hygiene conditions in the eating area. | Trash all over the floor and bins overflowing. | Needs serious health inspection and cleaning.'
      }
    ].slice(0, limit);
  }

  if (isDessertCafe) {
    if (r === 5) {
      return [
        {
          l: '🍦 Creamy ice creams',
          t: 'The ice creams are exquisitely creamy, rich, and full of delightful flavours. | Incredible range of rich ice cream varieties made with top quality ingredients. | Ice creams were velvety smooth and packed with authentic flavors. | Loved the ice cream sundaes — absolute perfection in every spoonful. | The texture and creaminess of their ice creams are unmatched in town.'
        },
        {
          l: '🥤 Thick milkshakes',
          t: 'The thick milkshakes are perfectly blended and an absolute treat. | The milkshakes are thick, creamy, and totally worth every rupee. | Shakes were thick, chilled, and rich with authentic flavors. | Loved the thick shake blends — so filling and delightful. | One of the best thick shake spots with great topping combinations.'
        },
        {
          l: '🍕 Cheesy hot pizza',
          t: 'The pizzas are freshly baked with a golden crispy crust and plenty of cheese. | Pizza was fresh, cheesy, and perfectly baked — loved every bite. | The crust was wonderfully crispy and loaded with delicious toppings. | Delicious melted mozzarella and rich savory pizza sauce. | Hot out of the oven pizza that exceeded all expectations.'
        },
        {
          l: '🍗 Crispy fried chicken',
          t: 'The fried chicken is super crispy outside, tender and juicy inside. | Fried chicken had amazing crunch and bold seasoning. | Piping hot fried chicken that is full of rich flavor. | Crispy chicken pieces cooked to golden perfection. | Loved the fried chicken tenders and crunchy bites.'
        },
        {
          l: '⚡ Lightning fast service',
          t: 'Service was quick and the staff were very friendly and welcoming. | Counter service was exceptionally prompt and polite. | Fast turnaround and great hospitality throughout our visit. | Staff greeted us warmly and brought our order swiftly. | Extremely prompt and attentive service.'
        },
        {
          l: '💰 Pocket-friendly',
          t: 'Great food at very affordable prices — outstanding value for money. | Generous portion sizes with pocket-friendly pricing. | Fantastic value considering the premium taste and quality. | Affordable menu combos that are great for students and families. | Very reasonable rates for high quality food and desserts.'
        },
        {
          l: '🌟 Fairy light ambience',
          t: 'The fairy light ambience is stunning — perfect for hangouts with family and friends. | Beautiful outdoor lighting and cozy seating arrangement. | Magical night vibe with fairy lights and great music. | Wonderful atmosphere for evening coffee, desserts, and talks. | Picturesque ambience that makes dining here special.'
        },
        {
          l: '🍨 Cream More Delight',
          t: 'The Cream More special desserts and sundaes are top-notch and a must-try. | Signature sundaes and desserts are pure bliss. | Loaded dessert bowls that satisfy every sweet craving. | Incredible flavor combinations on their special dessert menu. | A must-try dessert experience for everyone visiting.'
        },
        {
          l: '💖 Highly recommend',
          t: 'Hands down one of the finest food and dessert spots in town — 10/10 experience! | Highly recommend this place to all foodies, friends, and families! | An absolute gem for snacks, pizzas, and desserts. | Loved every single thing we ordered — will definitely be back! | 5-star experience from start to finish.'
        }
      ].slice(0, limit);
    }
    if (r === 4) {
      return [
        {
          l: '🍦 Tasty ice creams',
          t: 'Good variety of ice cream options and delicious taste. | Enjoyed the smooth ice cream flavors and scoops. | Nice quality ice cream with good sweetness balance. | Ice creams were refreshing and enjoyable. | Good dessert options on the menu.'
        },
        {
          l: '🥤 Delicious shakes',
          t: 'Milkshakes had great consistency and rich flavour. | Shakes were tasty, chilled, and nicely blended. | Good thickness and enjoyable shake flavors. | Satisfying milkshakes that paired nicely with the food. | Enjoyed the shake varieties on offer.'
        },
        {
          l: '🍕 Fresh hot pizza',
          t: 'Pizza was tasty and served fresh out of the oven. | Good crust texture and tasty cheese on the pizza. | Hot and freshly baked pizza that satisfied our craving. | Enjoyed the pizza slice portions and flavors. | Decent pizza with good toppings.'
        },
        {
          l: '🍗 Good fried chicken',
          t: 'Crispy fried chicken seasoned nicely. | Chicken was crispy on the outside and cooked well. | Enjoyed the fried chicken snack with our drinks. | Good flavor and warmth on the chicken pieces. | Tasty chicken sides.'
        },
        {
          l: '⚡ Friendly staff',
          t: 'Friendly staff and prompt response throughout our visit. | Polite counter team who took our orders smoothly. | Helpful staff with quick order preparation. | Courteous service and pleasant interaction. | Staff handled our requests with a smile.'
        },
        {
          l: '💰 Great value',
          t: 'Good food quality for the price paid. | Reasonable prices across the dessert and snack menu. | Good value for families and groups. | Fair pricing for the portion sizes. | Affordable and satisfying.'
        },
        {
          l: '🌟 Cozy atmosphere',
          t: 'Pleasant lighting and comfortable seating. | Nice casual environment for an evening hangout. | Cozy seating area with nice vibes. | Clean and comfortable cafe setup. | Relaxing spot to spend time with friends.'
        }
      ].slice(0, limit);
    }
    if (r === 3) {
      return [
        {
          l: '⏳ Average Wait Time',
          t: 'Order took a moderate amount of time to arrive. | Waited about 15-20 minutes for our desserts and pizza. | Moderate service turnaround during evening hours. | Order was a bit delayed but acceptable. | Average waiting time for preparation.'
        },
        {
          l: '🍦 Standard Ice Cream',
          t: 'Average ice cream options with standard quality. | Ice cream was okay, standard taste and flavors. | Nothing extraordinary, standard commercial ice cream. | Decent ice cream scoop though sweetness was a bit high. | Okay quality for a casual treat.'
        },
        {
          l: '🥤 Okay Milkshakes',
          t: 'Milkshakes were okay and reasonably chilled. | Shake was a bit thinner than expected but tasted fine. | Standard milkshake, decent flavor. | Average shake consistency. | Okay drink for a quick stop.'
        },
        {
          l: '🍕 Average Pizza',
          t: 'Decent pizza crust and toppings, nothing extraordinary. | Pizza was okay, standard bakery style crust. | Moderate cheese and toppings on the pizza. | Average pizza flavor, could use more herbs. | Okay pizza for a quick snack.'
        },
        {
          l: '⚡ Normal Service',
          t: 'Service was standard and handled reasonably. | Standard counter interaction with moderate speed. | Staff were busy and service was okay. | Normal turnaround for desserts and snacks. | Standard customer experience.'
        },
        {
          l: '💰 Fair Pricing',
          t: 'Prices are reasonable for the portions. | Standard cafe pricing for desserts and drinks. | Average value for the items ordered. | Prices are okay, neither cheap nor expensive. | Fair menu rates.'
        },
        {
          l: '🧼 Standard Cleanliness',
          t: 'Ambience was fine for a quick stop. | Tables were okay, some needed clearing. | Average cafe upkeep and lighting. | Moderate cleanliness in the seating area. | Standard casual environment.'
        }
      ].slice(0, limit);
    }
    if (r === 2) {
      return [
        {
          l: '⏳ Long Waiting Delay',
          t: 'Had to wait much longer than expected for ice creams and food. | Took over 30 minutes for simple shakes and pizza. | Inordinate delay with no communication from staff. | Slow kitchen turnaround during our visit. | Long wait that dampened our mood.'
        },
        {
          l: '🍦 Melted Ice Cream',
          t: 'Ice cream was partially melted by the time it was served. | Sundae arrived soft and runny instead of chilled. | Ice cream had icy crystallization and lacked creaminess. | Melted mess served in a sticky bowl. | Poor temperature maintenance on ice creams.'
        },
        {
          l: '🥤 Watery Milkshake',
          t: 'Milkshake was too thin and lacked flavor. | Shake tasted like plain milk with little syrup. | Watery consistency with barely any ice cream. | Lack of thickness and flavor in the shake. | Disappointing milkshake quality.'
        },
        {
          l: '🍕 Soggy Pizza Crust',
          t: 'Pizza crust was soft and toppings were sparse. | Pizza was underbaked and doughy in the center. | Very little cheese and flavorless sauce. | Soggy base with uneven cooking. | Substandard pizza quality.'
        },
        {
          l: '⚡ Slow Service',
          t: 'Staff seemed busy and service was delayed. | Had to remind staff multiple times about our order. | Disorganized counter and slow order dispatch. | Staff took long to clear and serve tables. | Service needs better management.'
        },
        {
          l: '🧼 Needs Better Upkeep',
          t: 'Tables were not wiped promptly after previous guests. | Sticky tables and floor needed cleaning. | Lighting was dim and area felt neglected. | Waste bins were full and seating was untidy. | Cleanliness needs serious improvement.'
        }
      ].slice(0, limit);
    }
    // r === 1
    return [
      {
        l: '❌ Disappointing Experience',
        t: 'Food and desserts were well below standard. | Terribly disappointing visit with poor food and drinks. | None of the ordered items tasted fresh or enjoyable. | Complete waste of time and money today. | Would not recommend based on this experience.'
      },
      {
        l: '⏳ Excessive Wait Delay',
        t: 'Waited over 40 minutes with no updates from staff. | Left waiting endlessly for simple ice creams and snacks. | Worst turnaround time imaginable for a dessert spot. | Staff kept stalling and making excuses. | Unacceptable delay from the kitchen.'
      },
      {
        l: '❄️ Food Served Cold',
        t: 'Hot items arrived cold and ice cream arrived melted. | Pizza was stone cold and unbaked. | Fried items were cold, oily, and stale. | Ice cream was served completely melted as soup. | Terribly mishandled food temperature.'
      },
      {
        l: '🥤 Poor Quality Shakes',
        t: 'Shakes were watery and lacked authentic flavor. | Shakes tasted stale with sour milk undertone. | Horrible watery taste with artificial flavoring. | Inedible shakes that we could not finish. | Completely ruined beverage order.'
      },
      {
        l: '⚡ Unresponsive Staff',
        t: 'Staff ignored requests and showed poor customer care. | Rude and argumentative counter personnel. | Staff showed zero interest in resolving order issues. | Horrible customer service experience. | Completely unhelpful staff behavior.'
      },
      {
        l: '🧼 Unclean Tables',
        t: 'Tables and floor were messy and not maintained. | Sticky tables with flies and leftover plates everywhere. | Gross hygiene in the dining area. | Filthy seating and messy surroundings. | Needs immediate deep cleaning and sanitation.'
      }
    ].slice(0, limit);
  }

  // General Business Fallback
  if (r === 5) {
    return [
      {
        l: '⚡ Outstanding Service',
        t: 'Service was lightning fast, professional, and handled with great care. | The staff provided top-tier customer assistance throughout. | Prompt, efficient, and exceptionally courteous service. | Fast, reliable, and very pleasant experience. | Handled everything smoothly and with a warm smile.'
      },
      {
        l: '🌟 Top Quality',
        t: 'Exceptional quality that exceeded all our expectations. | 5-star quality and top-notch standards across the board. | Unmatched quality and attention to detail. | Consistently great results and premium experience. | Top tier in every aspect of their offering.'
      },
      {
        l: '💼 Professional Team',
        t: 'Staff were extremely welcoming, polite, and attentive. | Professional, knowledgeable, and helpful team. | Courteous professionals who care about their customers. | Great team coordination and seamless assistance. | Warm hospitality and utmost professionalism.'
      },
      {
        l: '💰 Great Value',
        t: 'Outstanding value for money with high quality standards. | Reasonable rates for such exceptional service and quality. | Pocket-friendly pricing with premium delivery. | Best value for money you can find in the area. | Worth every single penny spent.'
      },
      {
        l: '🧼 Spotless & Clean',
        t: 'Very clean, neat, and well-maintained environment. | Spotless cleanliness and high hygiene standards maintained. | Clean, comfortable, and welcoming space. | Pristine surroundings and tidy presentation. | Beautiful, spotless, and sanitized area.'
      },
      {
        l: '💖 Highly Recommended',
        t: '10/10 experience — highly recommend to everyone! | Hands down one of the best places around. | Will definitely be returning and recommending to others! | A truly delightful experience from start to finish. | 5 stars all the way — exceptional service!'
      }
    ].slice(0, limit);
  }
  if (r === 4) {
    return [
      {
        l: '⚡ Prompt Service',
        t: 'Service was quick and staff were helpful throughout. | Prompt response and smooth overall process. | Good customer service and timely assistance. | Handled our request efficiently. | Reliable and pleasant service.'
      },
      {
        l: '🌟 Good Quality',
        t: 'Good quality and satisfied with our overall visit. | Solid standards and dependable experience. | Quality met our expectations nicely. | Good overall delivery and presentation. | Enjoyable and satisfactory experience.'
      },
      {
        l: '💼 Helpful Team',
        t: 'Staff were polite and assisted us promptly. | Friendly team who answered our questions clearly. | Good communication and helpful attitude. | Courteous and attentive staff members. | Smooth interaction with the team.'
      },
      {
        l: '💰 Fair Price',
        t: 'Good pricing for the service received. | Reasonable rates and fair value overall. | Decent pricing structure. | Good balance of price and quality. | Affordable and well-priced.'
      },
      {
        l: '🧼 Clean & Tidy',
        t: 'Clean environment and comfortable experience. | Well-kept premises with pleasant atmosphere. | Neat, tidy, and organized setup. | Comfortable seating and clean surroundings. | Pleasant and well-maintained.'
      }
    ].slice(0, limit);
  }
  if (r === 3) {
    return [
      {
        l: '⏳ Average Wait Time',
        t: 'Moderate wait time, average overall experience. | Took a normal amount of time to be served. | Turnaround was acceptable though could be faster. | Moderate queue and standard waiting time. | Average processing speed.'
      },
      {
        l: '⚡ Standard Service',
        t: 'Service was standard and acceptable. | Routine service, met basic expectations. | Staff were polite enough, standard interaction. | Average assistance provided. | Standard experience with no major highlights.'
      },
      {
        l: '🌟 Decent Quality',
        t: 'Quality was okay, but has room for improvement. | Decent overall, met everyday standards. | Standard quality, nothing extraordinary. | Acceptable outcome though expected a bit more. | Fair quality for casual needs.'
      },
      {
        l: '💰 Fair Pricing',
        t: 'Standard pricing for what is offered. | Fair rates in line with market averages. | Pricing was okay for the level of service. | Reasonable cost overall. | Fair charges.'
      },
      {
        l: '😐 Mixed Experience',
        t: 'Some things were good, while other areas need attention. | Overall an okay visit with moderate satisfaction. | Mixed feelings, decent but could be polished. | Average experience overall. | Standard visit.'
      }
    ].slice(0, limit);
  }
  if (r === 2) {
    return [
      {
        l: '⏳ Long Waiting Delay',
        t: 'Had to wait far longer than expected. | Unreasonable delay before we received assistance. | Long wait time that caused frustration. | Poor timing and delayed delivery. | Slow process from start to finish.'
      },
      {
        l: '⚡ Slow Service',
        t: 'Service was sluggish and poorly coordinated. | Staff seemed disorganized and slow to respond. | Lack of urgency in handling requests. | Slow turnaround that needs improvement. | Disappointing service efficiency.'
      },
      {
        l: '⚠️ Inattentive Staff',
        t: 'Staff seemed indifferent to customer requests. | Had to follow up repeatedly to get basic help. | Lack of attentiveness from the on-duty staff. | Poor customer focus and communication. | Staff appeared disengaged.'
      },
      {
        l: '📉 Quality Below Standard',
        t: 'Quality did not meet expectations. | Substandard output that needs rework. | Quality was below the promised standard. | Disappointed with the final result. | Expected much better quality.'
      },
      {
        l: '🧼 Hygiene Needs Work',
        t: 'Cleanliness and maintenance need improvement. | Premises looked untidy and neglected. | Needs better upkeep and regular cleaning. | Poor maintenance in key areas. | Cleanliness was below acceptable levels.'
      }
    ].slice(0, limit);
  }
  // r === 1
  return [
    {
      l: '❌ Poor Experience',
      t: 'Extremely disappointing experience from start to finish. | Completely unsatisfied with the entire visit. | Terribly handled and fell far short of basic standards. | Worst experience we have had here. | Would not recommend based on this experience.'
    },
    {
      l: '⏳ Excessive Delay',
      t: 'Unreasonable delays and lack of communication. | Left waiting endlessly with zero explanation. | Unacceptable wait times that ruined our plans. | Extreme delays with no customer consideration. | Terrible turnaround.'
    },
    {
      l: '⚡ Unresponsive Staff',
      t: 'Staff were unhelpful, inattentive, and rude. | Disrespectful attitude when we raised concerns. | Complete lack of professionalism from staff. | Inattentive team that ignored customer requests. | Worst customer service.'
    },
    {
      l: '⚠️ Unacceptable Quality',
      t: 'Quality was completely below standard. | Terrible quality that was unusable. | Unacceptable defects and poor execution. | Total failure in meeting quality standards. | Complete waste of money.'
    },
    {
      l: '🧼 Unhygienic Conditions',
      t: 'Poor hygiene and lack of proper cleanliness. | Disgustingly dirty premises and poor sanitation. | Terrible upkeep and unhygienic surroundings. | Health hazard with zero maintenance. | Needs urgent inspection and deep clean.'
    }
  ].slice(0, limit);
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
    `Hands down one of the best spots around!`,
    `Super happy with our visit to ${bizName}!`,
    `Had an absolute 10/10 experience here today.`,
    `A truly delightful visit to ${bizName}!`
  ];

  const OPENERS_4 = [
    `Really good experience at ${bizName} overall.`,
    `Stopped by ${bizName} for a quick bite.`,
    `Pretty solid spot with good quality food and drinks.`,
    `Had a pleasant visit to ${bizName} today.`,
    `Enjoyed our time at ${bizName} earlier today.`
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
    'Will definitely be recommending to friends and family!',
    'Easily one of our favorite spots now.',
    'Leaving with a full stomach and a big smile!',
    'Keep up the phenomenal work team!',
    'Will be back very soon for sure!'
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

  // 15 Conversational aspect clauses per category tailored for natural flow & randomized picking
  const aspectDescriptions = {
    chicken: [
      'the crispy fried chicken was super crunchy on the outside and wonderfully juicy inside',
      'the fried chicken was piping hot with the absolute best crunch and seasoning',
      'the chicken pieces were freshly prepared, flavorful, and seasoned to perfection',
      'loved the crispy chicken — tender, juicy, and packed with authentic spices',
      'the fried chicken bucket was freshly fried with unbeatable crunch in every bite',
      'the chicken tenders and wings were golden, crisp, and succulent',
      'the fried chicken had that signature golden crispiness without feeling greasy',
      'each piece of chicken was hot, tender, and seasoned generously',
      'the fried chicken aroma and flavor were simply irresistible',
      'the crispy chicken coating was delightfully crunchy and the meat was ultra moist',
      'the spiced fried chicken had an amazing crunch and bold, savory flavor',
      'the chicken was cooked fresh to order and served steaming hot',
      'the hot wings and fried chicken had just the right amount of spicy kick',
      'the fried chicken quality was outstanding — fresh, juicy, and flavorful',
      'the crispy fried chicken was top-notch and satisfied all our cravings'
    ],
    burger: [
      'the zinger burger had the perfect crunch, fresh lettuce, and soft toasted buns',
      'the burger was super fresh, delightfully juicy, and packed with flavor',
      'the crispy chicken burgers were delicious, satisfying, and seasoned generously',
      'loved the burger patty — thick, crispy on the outside, and very juicy',
      'the burgers were served hot and fresh with just the right amount of sauce',
      'the zinger burger was loaded with flavor and had a fantastic crunch',
      'the burger buns were soft, fresh, and paired perfectly with the crisp patty',
      'the spicy chicken burger hit the spot with its bold taste and crunchy bite',
      'the burgers were wholesome, filling, and tasted absolutely wonderful',
      'the burger was neatly assembled with fresh crisp greens and savory dressing',
      'loved the double patty burger — tender, juicy, and full of flavor',
      'the zinger burger was one of the best we have had in a long time',
      'the burgers had fantastic texture with great balance of crunch and sauce',
      'every bite of the burger was flavorful, fresh, and hearty',
      'the burger was piping hot, well-sauced, and super satisfying'
    ],
    fries: [
      'the peri peri fries were hot, crisp, and dusted with flavorful tangy seasoning',
      'the French fries had the perfect golden crispiness and generous seasoning',
      'the fries were piping hot, delightfully crunchy, and not soggy at all',
      'the peri peri fries were spicy, tangy, and super addictive',
      'the crispy fries were salted and spiced to absolute perfection',
      'loved the potato fries — golden on the outside and fluffy on the inside',
      'the fries were freshly fried and stayed crispy throughout our meal',
      'the seasoned fries paired amazingly well with the dips and sauces',
      'the peri peri fries had a great zesty flavor with plenty of crunch',
      'the fries portion was generous, steaming hot, and thoroughly enjoyable',
      'the crispy fries were golden brown, light, and perfectly spiced',
      'loved the crunchy texture and bold peri peri flavor on the fries',
      'the fries arrived fresh from the fryer with a satisfying crunch',
      'the loaded peri peri fries were spicy, tasty, and freshly prepared',
      'the fries were crisp, well-seasoned, and disappeared within minutes'
    ],
    shake: [
      'the chilled Krushers and milkshakes were thick, refreshing, and perfectly blended',
      'the thick shakes had fantastic consistency and rich creamy taste',
      'the beverages were icy cold, super refreshing, and complemented the meal wonderfully',
      'the thick milkshakes were velvety smooth and loaded with authentic flavor',
      'loved the chilled drinks and shakes — served at the perfect temperature',
      'the chocolate and oreo thick shakes were decadent and satisfying',
      'the beverages were refreshing, delicious, and not overly sweet',
      'the cold drinks and Krushers were a great thirst-quencher with the spicy food',
      'the milkshakes were rich, creamy, and made with top-quality ingredients',
      'the chilled beverages were served quick and tasted delightfully fresh',
      'the fruit and chocolate shakes had amazing thickness and flavor',
      'loved the refreshing coolers and thick milkshakes on a hot afternoon',
      'the drinks had wonderful flavor and were freshly prepared',
      'the thick shake was rich, creamy, and an absolute treat to sip on',
      'the beverages were well-chilled, flavorful, and hit the spot'
    ],
    service: [
      'the counter service was exceptionally prompt and the staff were warmly welcoming',
      'the staff members were courteous, attentive, and handled our order with great care',
      'the order preparation was remarkably fast with almost zero waiting time',
      'the team was polite, professional, and very efficient at the billing counter',
      'quick, smooth, and hassle-free service from the moment we walked in',
      'staff was friendly, helpful with recommendations, and served with a smile',
      'the service was lightning fast even during peak rush hours',
      'very polite and accommodating staff who ensured everything was accurate',
      'service was top-tier — swift order turnaround and attentive hospitality',
      'the staff went above and beyond to make our dining experience pleasant',
      'the cashier was patient, friendly, and processed the order immediately',
      'impressed with how organized and fast the entire team was',
      'the staff was courteous, polite, and checked in to see if we needed anything',
      'food was handed over hot and fresh in record time',
      'seamless service experience with very warm and hospitable staff'
    ],
    clean: [
      'the dining area was spotless, tidy, and maintained high hygiene standards',
      'super clean tables, sanitized dining space, and pristine surroundings',
      'the entire space was remarkably neat, well-maintained, and hygienic',
      'impressed by how clean and well-kept the dining hall and counters were',
      'spotless presentation, clean trays, and very pleasant atmosphere',
      'the premises were sparkling clean with clear attention to hygiene',
      'clean seating area with tidy tables and a fresh, welcoming feel',
      'the washrooms and dining area were clean and properly sanitized',
      'great hygiene practices visible across food preparation and service areas',
      'the tables were cleared and wiped down promptly after each guest',
      'a spotless, modern, and very well-kept environment to enjoy food',
      'high standards of cleanliness throughout the entire outlet',
      'neatly arranged seating with clean cutlery and pristine tables',
      'the dining room felt fresh, clean, and extremely comfortable',
      'spotless and sanitary environment that gives complete peace of mind'
    ],
    family: [
      'a comfortable, spacious, and vibrant environment for family and friends',
      'very welcoming and family-friendly setting with great comfortable seating',
      'spacious and relaxed vibe, making it perfect for group hangouts and gatherings',
      'cozy and inviting ambience with pleasant lighting and good music',
      'the atmosphere is lively, upbeat, and wonderful for an evening meal',
      'a great spot to relax, unwind, and enjoy good food with loved ones',
      'the seating arrangement is comfortable with plenty of room for large groups',
      'loved the modern decor, comfortable booths, and pleasant dining ambiance',
      'a safe, clean, and cheerful atmosphere for families with kids',
      'the ambient vibe was warm, energetic, and made the visit memorable',
      'great atmosphere with a contemporary feel and comfortable temperature',
      'perfect hangout spot with vibrant decor and relaxing seating',
      'the overall vibe was cheerful, relaxing, and very enjoyable',
      'wonderful space to celebrate small get-togethers and casual meals',
      'the welcoming environment made us feel right at home throughout'
    ],
    value: [
      'generous portion sizes and very reasonable pricing across the menu',
      'outstanding value for money considering the high food quality and taste',
      'combo deals and meal boxes offer great savings and hearty portions',
      'very pocket-friendly without any compromise on taste or freshness',
      'generous servings at prices that are totally worth every single rupee',
      'great deals that make dining here both delicious and economical',
      'the meal combos offer phenomenal value and leave you completely satisfied',
      'fair and transparent pricing with generous food quantities',
      'top-notch food quality at very accessible and budget-friendly prices',
      'definitely one of the most value-packed dining options in the area',
      'impressive portion sizes that provide excellent bang for your buck',
      'affordable prices combined with consistent quality makes it a no-brainer',
      'the combo meals are super filling and exceptionally well-priced',
      'great cost-to-quality ratio that keeps us coming back regularly',
      'you get plenty of great food at very fair and reasonable rates'
    ],
    taste: [
      '10/10 taste and consistent 5-star food quality as always',
      'food tasted absolutely delicious, fresh, and bursting with flavor',
      'incredible flavor profile and premium quality in every single bite',
      'everything we ordered was cooked to perfection and tasted fantastic',
      'consistently mouthwatering flavors that never fail to impress',
      'the food was piping hot, rich in flavor, and delightfully seasoned',
      'authentic, bold taste that completely satisfied our food cravings',
      'every dish had the right balance of spices, crunch, and freshness',
      'truly delicious flavors that make you want to order more',
      'the taste was top-tier and exceeded all our expectations',
      'freshly prepared food with rich, savory, and memorable taste',
      'the flavors were spot on — fresh ingredients and superb seasoning',
      'exceptional taste and food presentation from start to finish',
      'one of the best culinary experiences we have enjoyed recently',
      'mouth-watering taste and top notch freshness in every item'
    ],
    ice_cream: [
      'the ice creams were rich, creamy, and super flavorful',
      'loved the thick creamy ice creams and desserts',
      'the ice cream flavors were rich, fresh, and delightfully sweet',
      'the sundaes and ice creams were top-tier in taste',
      'the desserts were exquisitely creamy and satisfied our sweet tooth',
      'delicious ice creams with generous toppings and sauces',
      'rich Belgian chocolate and creamy vanilla scoops were fantastic',
      'the sundaes were beautifully presented and tasted heavenly',
      'loved the wide variety of creative and rich dessert flavors',
      'the ice creams were cold, velvety smooth, and not overly sweet',
      'the sundae cups were loaded with generous nuts and syrups',
      'fresh waffle cones with rich creamy scoops made my day',
      'top quality artisanal ice creams with pure, natural ingredients',
      'every scoop of ice cream was pure bliss and super fresh',
      'the dessert options were rich, decadent, and delightfully chilled'
    ],
    pizza: [
      'the pizza was cheesy, hot, with a golden crispy baked crust',
      'loved the pizza — loaded with generous toppings and baked fresh',
      'the pizza crust had great crunch and plenty of gooey cheese',
      'freshly baked hot pizza with delicious flavors',
      'the cheese pull on the pizza was incredible and the sauce was savory',
      'crispy thin crust baked to golden perfection with rich mozzarella',
      'generous vegetable and chicken toppings that tasted super fresh',
      'the pizza sauce had great depth of flavor with aromatic herbs',
      'hot out of the oven pizza that exceeded all expectations',
      'the crust was light and airy on the inside with a crunchy edge',
      'loaded cheese slices that melt right in your mouth',
      'freshly seasoned pizza with great balance of spices and cheese',
      'the paneer and chicken pizza varieties were exceptionally flavorful',
      'the garlic bread and pizza combo was fresh, hot, and satisfying',
      'one of the finest pizzas in the area with superb dough and toppings'
    ],
    coffee: [
      'the coffee was brewed fresh and had a rich aroma',
      'loved the fresh coffee — smooth, rich, and perfectly prepared',
      'the hot coffee and drinks were spot on',
      'aromatic freshly ground coffee with rich crema',
      'the traditional filter coffee was strong, aromatic, and authentic',
      'loved the cold brew and iced coffee on a warm day',
      'the coffee had a wonderful rich roast and smooth finish',
      'perfect cup of coffee to kickstart the afternoon',
      'the espresso and cappuccino were creamy and expertly crafted',
      'great balance of milk, froth, and bold coffee beans',
      'warm and soothing hot beverages that taste homemade',
      'the coffee quality was top tier with great bean selection',
      'steaming hot cups with intoxicating aroma and robust flavor',
      'smooth and velvety latte with wonderful coffee notes',
      'consistently great coffee every single time we order'
    ],
    biryani: [
      'the biryani was fragrant, richly spiced, and full of tender pieces',
      'the biryani had authentic spices and amazing flavor in every spoonful',
      'delicious biryani with perfectly cooked rice and great aroma',
      'the long-grain basmati rice was cooked to fluffy perfection',
      'tender and succulent meat pieces marinated in authentic masala',
      'the biryani spices were aromatic, flavorful, and not overpowering',
      'served steaming hot with rich salan and chilled raita',
      'the dum cooking method gave the biryani an unforgettable flavor',
      'generous quantity of biryani with mouthwatering aroma',
      'authentic regional biryani taste that is hard to find anywhere else',
      'every grain of rice was infused with rich saffron and ghee flavors',
      'the biryani had the perfect spicy kick and juicy meat pieces',
      'traditional slow-cooked biryani packed with rich southern spices',
      'one of the best biryanis in town — aromatic, rich, and delicious',
      'freshly served biryani that hits all the right flavor notes'
    ]
  };

  function getClauseForTag(tagStr) {
    const s = tagStr.toLowerCase();
    
    // Check if client has custom tag template in database (for 5-star)
    if (r === 5 && client && client.tags) {
      try {
        const clientTags = JSON.parse(client.tags);
        const match = clientTags.find(t => (t.l || t.label || '').toLowerCase().includes(s) || s.includes((t.l || t.label || '').toLowerCase()));
        if (match && match.t) {
          const variants = match.t.split(/\||\n/).map(x => x.trim()).filter(Boolean);
          if (variants.length > 0) {
            const chosen = pickRandom(variants);
            return chosen.replace(/\.+$/, '');
          }
        }
      } catch(e) {}
    }

    // Check rating-calibrated local tags (guaranteed 5+ review variants per tag for 1-5 stars)
    const localTags = localGetTagsForRating(r, 20, client);
    const localMatch = localTags.find(t => (t.l || t.label || '').toLowerCase().includes(s) || s.includes((t.l || t.label || '').toLowerCase()));
    if (localMatch && localMatch.t) {
      const variants = localMatch.t.split(/\||\n/).map(x => x.trim()).filter(Boolean);
      if (variants.length > 0) {
        const chosen = pickRandom(variants);
        return chosen.replace(/\.+$/, '');
      }
    }

    let pool = null;
    if (s.includes('chicken') || s.includes('wings') || s.includes('strips') || s.includes('bucket') || s.includes('nugget') || s.includes('popcorn') || s.includes('leg')) pool = aspectDescriptions.chicken;
    else if (s.includes('burger') || s.includes('zinger') || s.includes('sandwich') || s.includes('roll') || s.includes('patty')) pool = aspectDescriptions.burger;
    else if (s.includes('fries') || s.includes('peri peri') || s.includes('wedges') || s.includes('chips') || s.includes('potato')) pool = aspectDescriptions.fries;
    else if (s.includes('shake') || s.includes('krusher') || s.includes('beverage') || s.includes('drink') || s.includes('smoothie') || s.includes('cooler') || s.includes('mojito')) pool = aspectDescriptions.shake;
    else if (s.includes('service') || s.includes('staff') || s.includes('fast') || s.includes('quick') || s.includes('counter') || s.includes('cashier')) pool = aspectDescriptions.service;
    else if (s.includes('clean') || s.includes('hygien') || s.includes('spotless') || s.includes('neat') || s.includes('sanitiz')) pool = aspectDescriptions.clean;
    else if (s.includes('ice cream') || s.includes('sundae') || s.includes('dessert') || s.includes('creamy') || s.includes('waffle')) pool = aspectDescriptions.ice_cream;
    else if (s.includes('pizza') || s.includes('cheese') || s.includes('crust') || s.includes('garlic bread')) pool = aspectDescriptions.pizza;
    else if (s.includes('coffee') || s.includes('tea') || s.includes('chai') || s.includes('brew')) pool = aspectDescriptions.coffee;
    else if (s.includes('biryani') || s.includes('rice') || s.includes('pulao') || s.includes('dosa')) pool = aspectDescriptions.biryani;
    else if (s.includes('family') || s.includes('kids') || s.includes('group') || s.includes('hangout') || s.includes('ambience') || s.includes('light') || s.includes('vibe') || s.includes('decor')) pool = aspectDescriptions.family;
    else if (s.includes('value') || s.includes('pocket') || s.includes('price') || s.includes('affordable') || s.includes('worth') || s.includes('combo') || s.includes('budget')) pool = aspectDescriptions.value;
    else if (s.includes('taste') || s.includes('delicious') || s.includes('recommend') || s.includes('flavour') || s.includes('quality') || s.includes('good') || s.includes('10/10') || s.includes('5-star')) pool = aspectDescriptions.taste;

    if (pool && pool.length > 0) {
      return pickRandom(pool);
    }
    const fallbacks = [
      `the ${tagStr.toLowerCase()} was top-notch and super fresh`,
      `really enjoyed the ${tagStr.toLowerCase()}`,
      `the ${tagStr.toLowerCase()} was freshly prepared and full of flavor`,
      `loved the high quality and taste of the ${tagStr.toLowerCase()}`,
      `the ${tagStr.toLowerCase()} exceeded our expectations in every way`
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

  const multiPatterns = r >= 4 ? [
    `${opener} ${c0.charAt(0).toUpperCase() + c0.slice(1)}, and ${c1}. On top of that, ${restJoined}. ${closing}`,
    `${opener} Really loved that ${c0} plus ${c1}. Also, ${restJoined}. ${closing}`,
    `Everything was great at ${bizName}! ${c0.charAt(0).toUpperCase() + c0.slice(1)}, ${c1}, and ${restJoined}. ${closing}`
  ] : [
    `${opener} ${c0.charAt(0).toUpperCase() + c0.slice(1)}, and ${c1}. On top of that, ${restJoined}. ${closing}`,
    `${opener} Main issue was that ${c0}, along with ${c1}. Furthermore, ${restJoined}. ${closing}`,
    `${opener} We experienced that ${c0}, plus ${c1}. Also, ${restJoined}. ${closing}`
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
