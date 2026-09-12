// scripts/build-brain.js
// Grow the review brain corpus toward its 500MB budget using the Gemini API.
//
// The seed corpus (data/brain/seed/*.jsonl) is the curated baseline. This
// script generates additional high-quality exemplar records per business type
// and rating tier via Gemini and appends them to per-type shard files under
// data/brain/shards/shard-<type>.jsonl.
//
// Budget is enforced (manifest.budgetBytes, 500MB): once total corpus size
// reaches the budget the script stops adding more records.
//
// Run:
//   node scripts/build-brain.js               # add one batch per type
//   node scripts/build-brain.js --types cafe  # only 'cafe'
//   node scripts/build-brain.js --per-type 2  # 2 batches per type (default 1)
//   node scripts/build-brain.js --check       # print corpus stats only
//
// Notes:
//   - Resumable: records are batch-windowed per type so re-runs skip types that
//     already reached their target shard count and continue where they left off.
//   - Rate-limit aware: Gemini 429 throttling is detected and the script backs
//     off, or stops politely if the plan quota is exhausted.
const fs = require('fs');
const path = require('path');
const {
  SEED_DIR, SHARD_DIR, manifest, budgetBytes, brainSize
} = (() => {
  const brain = require('../services/reviewBrain');
  return {
    SEED_DIR: brain.SEED_DIR,
    SHARD_DIR: brain.SHARD_DIR,
    manifest: brain.manifest,
    budgetBytes: brain.budgetBytes,
    brainSize: brain.brainSize
  };
})();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

const VERBOSE = process.argv.includes('--verbose');

function log(...a) { if (VERBOSE) console.log(...a); }

function escJson(s) {
  return JSON.stringify({ s }).replace(/^\{|}$/g, '').slice(5, -1); // crude single-quote-safe
}

function shardFileFor(type) {
  return path.join(SHARD_DIR, 'shard-' + type + '.jsonl');
}

function countShardRecords(type) {
  const f = shardFileFor(type);
  try {
    const txt = fs.readFileSync(f, 'utf8');
    return txt.split('\n').filter(l => l.trim()).length;
  } catch (e) { return 0; }
}

function listTypes() {
  return fs.readdirSync(SEED_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => f.replace(/\.jsonl$/, ''));
}

/** Build the per-type Gemini prompt to author a batch of exemplars. */
function buildTypePrompt(type, rating, count) {
  // Load 2 exemplars of the same rating from the seed for voice grounding.
  const seedFile = path.join(SEED_DIR, type + '.jsonl');
  const sameRating = [];
  try {
    for (const line of fs.readFileSync(seedFile, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t) continue;
      let rec;
      try { rec = JSON.parse(t); } catch (e) { continue; }
      if (rec.role === 'exemplar' && rec.rating === rating) {
        sameRating.push(rec.text);
        if (sameRating.length >= 2) break;
      }
    }
  } catch (e) { /* no seed grounding */ }

  const ground = sameRating.length
    ? '\nVoice anchor examples for this type and rating (study the rhythm, do not repeat them):\n- ' + sameRating.join('\n- ')
    : '';

  const tierGuide = {
    5: 'glowing yet specific; show why the customer would return; at most one exclamation point.',
    4: 'warm and positive; optionally one tiny constructive note.',
    3: 'balanced and friendly; name one thing that was good and one thing that could improve.',
    2: 'constructive, never a rant; acknowledge one issue briefly, pivot to a positive, close with a hope.',
    1: 'fair-minded and forward-looking; calm acknowledgment, one neutral/positive note, genuine hope for improvement.'
  }[rating];

  return [
    'You are writing realistic, natural Google reviews in English.',
    'Business type: ' + type.replace(/_/g, ' '),
    'Rating: ' + rating + ' out of 5 stars.',
    'Tone requirement: ' + tierGuide,
    'Rules:',
    '- 2 to 4 sentences, first person, human voice, no emojis, no hashtags, no clichés like "highly recommended".',
    '- Be SPECIFIC in a believable way (dish, wait time, cleanliness, staff, price, location) without inventing exact facts.',
    '- For low ratings, stay constructive - never negative or ranting.',
    '- Each review must be DIFFERENT from all others and from the anchors.',
    ground,
    '',
    'Return JSON: {"reviews": ["<review 1>", ...]} exactly ' + count + ' reviews. No markdown, no commentary.',
    'Output only valid JSON.'
  ].join('\n');
}

async function callGemini(promptText, retries = 1) {
  const url = GEMINI_BASE + '/models/' + GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(GEMINI_API_KEY);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: { reviews: { type: 'array', items: { type: 'string' } } },
            required: ['reviews']
          }
        }
      })
    });
  } catch (e) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1500));
      return callGemini(promptText, retries - 1);
    }
    throw new Error('Gemini network error: ' + e.message);
  } finally {
    clearTimeout(t);
  }

  if (res.status === 429) {
    throw Object.assign(new Error('Gemini 429 quota exceeded'), { quota: true });
  }
  if (!res.ok) {
    throw new Error('Gemini HTTP ' + res.status + ': ' + (await res.text()).slice(0, 160));
  }

  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let parsed;
  try {
    const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Gemini returned unparseable JSON');
    parsed = JSON.parse(content.slice(start, end + 1));
  }
  const reviews = Array.isArray(parsed.reviews) ? parsed.reviews.map(r => String(r).trim()).filter(Boolean) : [];
  if (!reviews.length) throw new Error('Gemini returned no reviews');
  return reviews;
}

/** Append a batch of exemplar records to the per-type shard, enforcing budget. */
function appendShard(type, reviews, rating) {
  // Budget guard
  if (brainSize() >= budgetBytes) {
    throw Object.assign(new Error('Review brain already at budget (' + brainSize() + ' bytes)'), { budget: true });
  }
  const lines = reviews.map(r => JSON.stringify({
    role: 'exemplar', type, rating, text: r,
    origin: 'gemini'
  }));
  fs.appendFileSync(shardFileFor(type), lines.join('\n') + '\n');
  return lines.length;
}

async function buildOneType(type, batches, perType) {
  const existing = countShardRecords(type);
  // one batch = 5 raters; if already at target, skip.
  const target = batches * 5;
  if (existing >= target) {
    log('skip ' + type + ' (already has ' + existing + ' records)');
    return 0;
  }
  const needed = Math.max(0, target - existing);
  const ratingsToGen = [5, 5, 4, 3, 3, 2, 1].slice(0, Math.min(needed, 7));
  let added = 0;
  for (const rating of ratingsToGen) {
    if (brainSize() >= budgetBytes) {
      log('budget reached, stopping.');
      break;
    }
    try {
      log('  generating ' + type + ' rating ' + rating + ' ...');
      const reviews = await callGemini(buildTypePrompt(type, rating, perType));
      added += appendShard(type, reviews, rating);
      log('  +' + reviews.length + ' records (rating ' + rating + ')');
      await new Promise(r => setTimeout(r, 600));
    } catch (e) {
      if (e.quota) {
        console.warn('Quota exceeded - stopping. Re-run after your Gemini quota resets.');
        return { stopped: 'quota', added };
      }
      console.warn('  error for ' + type + ' rating ' + rating + ': ' + e.message);
      await new Promise(r => setTimeout(r, 900));
    }
  }
  return { added };
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  if (!fs.existsSync(SHARD_DIR)) fs.mkdirSync(SHARD_DIR, { recursive: true });

  if (checkOnly) {
    const seedB = fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.jsonl')).reduce((a, f) => a + fs.statSync(path.join(SEED_DIR, f)).size, 0);
    const shardB = fs.existsSync(SHARD_DIR) ? fs.readdirSync(SHARD_DIR).filter(f => f.endsWith('.jsonl')).reduce((a, f) => a + fs.statSync(path.join(SHARD_DIR, f)).size, 0) : 0;
    console.log('Brain corpus: seed ' + (seedB / 1024).toFixed(1) + ' KB | shards ' + (shardB / 1024).toFixed(1) + ' KB | total ' + ((seedB + shardB) / 1024).toFixed(1) + ' KB | budget ' + (budgetBytes / 1024 / 1024).toFixed(0) + ' MB');
    return;
  }

  if (!GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not set - nothing to build (seed corpus already present).');
    return;
  }

  const typeArg = process.argv.indexOf('--types');
  let types = listTypes();
  if (typeArg !== -1 && process.argv[typeArg + 1]) {
    types = process.argv[typeArg + 1].split(',').map(s => s.trim()).filter(Boolean);
  }
  const pb = process.argv.indexOf('--per-type');
  const perType = pb !== -1 && Number(process.argv[pb + 1]) ? Number(process.argv[pb + 1]) : 1;
  const batches = pb !== -1 ? Math.ceil(7 / perType) : perType; // default: 1 batch of 5 raters

  console.log('Scanning types: ' + types.join(', '));
  let totalAdded = 0;
  let stopped = false;
  for (const type of types) {
    if (stopped) break;
    try {
      const res = await buildOneType(type, batches, perType);
      if (res && res.stopped === 'quota') { stopped = true; break; }
      totalAdded += res ? res.added : 0;
    } catch (e) { console.warn('build failed for ' + type + ': ' + e.message); }
  }
  console.log('Done. Added ' + totalAdded + ' shard records. Total corpus now ' + (brainSize() / 1024).toFixed(1) + ' KB.');
}

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { buildTypePrompt, callGemini, appendShard, countShardRecords, listTypes, shardFileFor };