// services/reviewBrain.js
// Scalable "review brain" knowledge layer.
//
// The brain is a large, sharded corpus of positive Google-review exemplars plus
// concise per-type guidance, stored as JSONL shards under data/brain/.
// Shards are loaded lazily (per business-type) so the corpus can grow towards a
// ~500MB budget without loading everything into memory at once. Retrieval mixes:
//   - rating-tier matched exemplars (0-3, score weighted)
//   - type-keyword matched exemplars
//   - token overlap with the user's experience text
// The result is a compact, high-signal prompt context, not the whole corpus.

const fs = require('fs');
const path = require('path');

const BRAIN_DIR = path.join(__dirname, '..', 'data', 'brain');
const SEED_DIR = path.join(BRAIN_DIR, 'seed');
const SHARD_DIR = path.join(BRAIN_DIR, 'shards');
const INDEX_FILE = path.join(SHARD_DIR, 'index.json');
const MANIFEST_FILE = path.join(BRAIN_DIR, 'manifest.json');

// Keep at most this many parsed records in memory per business type.
const SHARD_CACHE_LIMIT = 8;
const MAX_CTX_RECORDS = 4;          // exemplars embedded in prompt context
const MAX_CTX_GUIDANCE = 6;         // type guidance lines
const BUDGET_BYTES = 524288000;     // 500 MB corpus budget (matches manifest)

// Runtime caches: typeLower -> array of {file, records}
const shardCache = new Map();
// typeLower -> array of guidance lines (strings)
const guidanceCache = new Map();

const m = (() => {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  } catch (e) {
    return { budgetBytes: BUDGET_BYTES };
  }
})();

const budgetBytes = Number(m.budgetBytes) || BUDGET_BYTES;

/** Compact tokenizer: lowercase alphanumeric runs. */
const WORDS_RE = /[a-z0-9]+/g;
function tokens(str) {
  return String(str || '').toLowerCase().match(WORDS_RE) || [];
}
function wordSet(str) {
  return new Set(tokens(str));
}

/** Broad business-type normalization so both "Courier" and "courier service" hit the same slice. */
const TYPE_ALIASES = {
  restaurant: 'restaurant', restaurants: 'restaurant', cafe: 'cafe', cafes: 'cafe',
  'coffee shop': 'cafe', 'coffee house': 'cafe', coffee: 'cafe',
  'fast food': 'food', 'fast-food': 'food', 'food joint': 'food', snack: 'food', 'snack bar': 'food',
  pizza: 'pizza', pizzeria: 'pizza', 'ice cream': 'dessert', 'ice-cream': 'dessert',
  'icecream': 'dessert', desserts: 'dessert', bakery: 'bakery', 'bakeries': 'bakery',
  'baking studio': 'bakery', salon: 'salon', salons: 'salon', 'beauty salon': 'salon',
  'hair salon': 'salon', spa: 'salon', 'beauty parlor': 'salon', 'beauty parlour': 'salon',
  barbershop: 'barbershop', 'barber shop': 'barbershop', barber: 'barbershop',
  gym: 'gym', 'gymnasium': 'gym', 'fitness center': 'gym', 'fitness centre': 'gym',
  'fitness studio': 'gym', yoga: 'gym', courier: 'courier', 'courier service': 'courier',
  'delivery service': 'courier', 'parcel service': 'courier', logistics: 'courier',
  hotel: 'hotel', 'hotels': 'hotel', resort: 'hotel', inn: 'hotel', 'bed and breakfast': 'hotel',
  clinic: 'clinic', 'dental clinic': 'clinic', dentist: 'clinic', 'dental': 'clinic',
  diagnostics: 'clinic', lab: 'clinic', pharmacy: 'pharmacy', 'medical store': 'pharmacy',
  'medical shop': 'pharmacy', 'chemist': 'pharmacy', 'drug store': 'pharmacy',
  garage: 'garage', workshop: 'garage', 'auto repair': 'garage', 'car service': 'garage',
  'car repair': 'garage', 'bike service': 'garage', 'two wheeler service': 'garage',
  laundry: 'laundry', 'dry cleaning': 'laundry', 'drycleaners': 'laundry', 'launderette': 'laundry',
  taxi: 'taxi', cab: 'taxi', 'cab service': 'taxi', 'travel agency': 'travel',
  'travel agent': 'travel', tours: 'travel', tour: 'travel', tuition: 'tuition',
  'tuition center': 'tuition', 'tutoring': 'tuition', 'tutorial': 'tuition', 'coaching': 'tuition',
  'coaching center': 'tuition', classes: 'tuition', 'training institute': 'tuition',
  tailor: 'tailor', 'tailoring': 'tailor', 'alterations': 'tailor',
  'packers and movers': 'shifting', 'packers & movers': 'shifting', 'shifting service': 'shifting',
  movers: 'shifting', 'moving company': 'shifting', stationery: 'stationery',
  'stationary shop': 'stationery', 'book store': 'bookstore', 'bookstore': 'bookstore',
  'mobile repair': 'repairs', 'repair shop': 'repairs', 'phone repair': 'repairs',
  'electronics repair': 'repairs', 'watch repair': 'repairs', 'repair': 'repairs',
  'grocery store': 'grocery', 'supermarket': 'grocery', 'grocery': 'grocery', 'kirana': 'grocery',
  'general store': 'grocery', 'provision store': 'grocery', 'menswear': 'apparel',
  'apparel store': 'apparel', 'clothing store': 'apparel', boutique: 'apparel',
  'electronics store': 'electronics', 'electronics shop': 'electronics',
  'electronics showroom': 'electronics', 'jewellery': 'jewellery', 'gold store': 'jewellery',
  'jewelry shop': 'jewellery', 'jewellery store': 'jewellery',
  'pet store': 'pets', 'pet shop': 'pets', grooming: 'pets', 'pet grooming': 'pets',
  veterinary: 'pets', 'pet clinic': 'pets', park: 'park', 'amusement park': 'park',
  'theme park': 'park', attraction: 'park', museum: 'park', 'art gallery': 'park',
  'play area': 'play', 'kids area': 'play', 'childrens play area': 'play',
  'watering hole': 'bar', bar: 'bar', pub: 'bar', lounge: 'bar', brewery: 'bar',
  'breakfast': 'breakfast', 'breakfast place': 'breakfast', 'brunch spot': 'breakfast',
  'breakfast joint': 'breakfast', parlour: 'parlour', 'icecream parlour': 'dessert',
  'ice cream parlour': 'dessert', 'car wash': 'carwash', 'carwash': 'carwash',
  'car cleaning': 'carwash', 'autocare': 'carwash', 'bike wash': 'carwash',
  'print shop': 'printing', 'printing': 'printing', 'print and copy': 'printing',
  'xerox': 'printing', 'photocopy': 'printing', 'locksmith': 'locksmith',
  'plumber': 'plumber', 'plumbing service': 'plumber', 'electrician': 'electrician',
  'electrical service': 'electrician', 'real estate': 'realtor', 'real estate agent': 'realtor',
  'realtor': 'realtor', 'property dealer': 'realtor', 'photographer': 'photographer',
  'photography': 'photographer', 'photo studio': 'photographer', 'bakery cafe': 'bakery',
  'cloud kitchen': 'cloudkitchen', 'cloud kitchen delivery': 'cloudkitchen',
  'home cooking': 'cloudkitchen', 'online food': 'cloudkitchen'
};

function normalizeType(type) {
  let key = String(type || '').trim().toLowerCase().replace(/^the\s+/, '');
  if (!key) return '';
  if (TYPE_ALIASES[key]) return TYPE_ALIASES[key];
  // Try singular forms ("ice creams" -> "ice cream", "pizzas" -> "pizza").
  const singular = key.replace(/ies$/i, 'y').replace(/es$/i, '').replace(/s$/i, '');
  if (singular !== key && TYPE_ALIASES[singular]) return TYPE_ALIASES[singular];
  // Fall back to the first literal token if it looks like a known slice keyword.
  const first = key.split(/\s+/)[0];
  const firstSingular = first.replace(/ies$/i, 'y').replace(/es$/i, '').replace(/s$/i, '');
  return TYPE_ALIASES[first] || TYPE_ALIASES[firstSingular] || firstSingular;
}

function typeSlices(type) {
  const set = new Set();
  // Business types often arrive comma-separated ("Ice creams, Pizzas, Snacks").
  for (const part of String(type || '').split(/[,/&;]/)) {
    const partSlices = typeSlicesPart(part);
    for (const s of partSlices) set.add(s);
  }
  if (!set.size) set.add('generic');
  set.add('generic'); // always fall back to generic exemplars
  return [...set];
}

function typeSlicesPart(type) {
  const n = normalizeType(type);
  return n ? [n] : [];
}

/** Percentage overlap of the user text tokens vs record tokens. */
function overlapScore(recordTokenSet, textTokenList) {
  if (!textTokenList.length) return 0;
  let hit = 0;
  for (const t of textTokenList) if (recordTokenSet.has(t)) hit++;
  return hit / textTokenList.length;
}

function listSeedFiles() {
  try {
    return fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.jsonl')).sort();
  } catch (e) {
    return [];
  }
}

const seedRecords = (() => {
  const map = new Map(); // typeLower -> records[]
  for (const file of listSeedFiles()) {
    const type = normalizeType(file.replace(/\.jsonl$/, ''));
    const records = [];
    try {
      for (const line of fs.readFileSync(path.join(SEED_DIR, file), 'utf8').split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try {
          records.push(JSON.parse(t));
        } catch (e) { /* skip malformed seed line */ }
      }
    } catch (e) { /* skip unreadable seed file */ }
    if (records.length) map.set(type, records);
  }
  return map;
})();

function listShardFilesFor(type) {
  try {
    return fs.readdirSync(SHARD_DIR)
      .filter(f => f.endsWith('.jsonl') && f.includes(normalizeType(type)))
      .sort();
  } catch (e) {
    return [];
  }
}

/** Load all records for a type: seed baseline + lazily-loaded shards (bounded LRU-style cache). */
function getTypeRecords(type) {
  const key = normalizeType(type) || 'generic';
  if (shardCache.has(key)) return shardCache.get(key);

  // Seed records are the curated baseline for this type/generic.
  const records = [...(seedRecords.get(key) || [])];

  // Shards extend the baseline toward the 500MB budget (lazy load).
  const files = listShardFilesFor(type);
  for (const file of files) {
    try {
      for (const line of fs.readFileSync(path.join(SHARD_DIR, file), 'utf8').split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try { records.push(JSON.parse(t)); } catch (e) { /* skip */ }
      }
    } catch (e) { /* skip missing shard */ }
  }

  shardCache.set(key, records);
  if (shardCache.size > SHARD_CACHE_LIMIT) {
    shardCache.delete(shardCache.keys().next().value);
  }
  return records;
}

/** Concise per-type style guidance embedded in context (from seed records). */
function getGuidance(type) {
  const key = normalizeType(type) || 'generic';
  if (guidanceCache.has(key)) return guidanceCache.get(key);

  const records = getTypeRecords(type);
  const guidance = [];
  const seen = new Set();
  for (const r of records) {
    if (r.role !== 'guide') continue;
    const text = String(r.text || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    guidance.push(text.slice(0, 180));
    if (guidance.length >= MAX_CTX_GUIDANCE) break;
  }
  guidanceCache.set(key, guidance);
  return guidance;
}

/**
 * Retrieve a compact set of exemplar records for building prompt context.
 *
 * @param {{rating?:number, businessType?:string, userText?:string}} opts
 * @returns {Array<{role:string, rating?:number, type?:string, text:string, tokens?:number}>}
 */
function retrieve({ rating, businessType, userText }) {
  const r = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
  const textList = tokens(userText);
  const textSet = new Set(textList);
  const slices = typeSlices(businessType);
  const seen = new Set();
  const scored = [];

  const consider = (type, rec, w) => {
    if (!rec || seen.has(rec.text)) return;
    seen.add(rec.text);
    let s = 0;
    if (rec.rating === r) s += 6;
    else s += 4 - Math.abs(rec.rating - r) * 0.8;
    s += overlapScore(rec.tokens || wordSet(rec.text), textList) * 8;
    for (const t of textList) if ((rec.tokens || wordSet(rec.text)).has(t)) s += 0.5;
    scored.push({ rec, s: s + w });
  };

  for (const type of slices) {
    const recs = getTypeRecords(type);
    for (const rec of recs) {
      if (rec.role && rec.role !== 'exemplar') continue;
      consider(type, rec, type === 'generic' ? 0 : 1.5);
    }
  }
  // Also consider generic exemplars when an explicit type yielded none.
  if (!scored.length && !slices.includes('generic')) {
    for (const rec of getTypeRecords('generic')) consider('generic', rec, 0.5);
  }

  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, MAX_CTX_RECORDS).map(({ rec }) => ({
    role: 'exemplar',
    rating: rec.rating,
    type: rec.type,
    text: String(rec.text).trim().slice(0, 280),
    tokens: (rec.tokens || []).length
  }));
}

function usedTokens(records) {
  return records.reduce((acc, r) => acc + tokens(r.text).length, 0);
}

/**
 * Build the prompt-context block for a review request.
 * Looks like a "huge in-context review knowledge bank" but is actually a
 * retrieved slice - the full corpus can grow toward the 500MB budget without
 * ever being loaded wholesale into the prompt.
 *
 * @returns {{context?:string, records:Array, guidance:string[]}}
 */
function buildBrainContext({ rating, businessType, userText }) {
  const records = retrieve({ rating, businessType, userText });
  const guidance = getGuidance(businessType);
  const lines = [];

  if (guidance.length) {
    lines.push('## Style guidance for this business type');
    guidance.forEach((g, i) => lines.push(String(i + 1) + '. ' + g));
  }
  if (records.length) {
    lines.push('## Exemplar reviews (study voice & rating fit; never copy verbatim)');
    records.forEach((rec, i) => {
      lines.push('Ex.' + (i + 1) + ' [' + (rec.rating || '?') + '★] ' + rec.text);
    });
  }

  return {
    context: lines.length ? lines.join('\n') : '',
    records,
    guidance,
    stats: { usedTokens: usedTokens(records) }
  };
}

/** Total corpus size in bytes (seed + shards), cheap and streamed. */
function brainSize() {
  let total = 0;
  for (const file of listSeedFiles()) {
    total += fs.statSync(path.join(SEED_DIR, file)).size;
  }
  try {
    for (const file of fs.readdirSync(SHARD_DIR)) {
      if (file.endsWith('.jsonl')) total += fs.statSync(path.join(SHARD_DIR, file)).size;
    }
  } catch (e) { /* ignore */ }
  return total;
}

function budgetRemaining() {
  return Math.max(0, budgetBytes - brainSize());
}

module.exports = {
  BRAIN_DIR, SEED_DIR, SHARD_DIR,
  normalizeType, typeSlices, retrieve, buildBrainContext, brainSize, budgetRemaining,
  listSeedFiles, loadSeedRecords: () => seedRecords,
  manifest: { budgetBytes, recordCacheLimit: SHARD_CACHE_LIMIT },
  budgetBytes, WORD_CACHE_LIMIT: SHARD_CACHE_LIMIT
};