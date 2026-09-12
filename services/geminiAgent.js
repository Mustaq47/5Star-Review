// services/geminiAgent.js
// Gemini-powered enhanced review suggestion engine.
// Returns natural, context-aware next-phrase suggestions (primary + alternatives)
// for the review textarea using Google's Gemini API, with graceful failure
// (throws) so callers can fall back to the static engine.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

// --- shared dedup / cache layer ---
const suggestionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const inflight = new Map();
const failedAt = new Map();
const FAIL_COOLDOWN = 60 * 1000;

function cacheKeyOf(text, rating, businessName, businessType, tagLabels) {
  const tags = Array.isArray(tagLabels) ? tagLabels.join(',') : (tagLabels || '');
  return `${String(text).trim()}|${rating}|${businessName}|${businessType}|${tags}`;
}

/**
 * Returns a promise for a Gemini suggestion, deduplicated per input key.
 * Caches successful results so repeat calls are instant.
 */
function getSuggestedSuggestion({ text, rating, businessName, businessType, tagLabels }) {
  const key = cacheKeyOf(text, rating, businessName, businessType, tagLabels);

  const hit = suggestionCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return Promise.resolve(hit.value);

  if (inflight.has(key)) return inflight.get(key);

  const lastFail = failedAt.get(key);
  if (lastFail && Date.now() - lastFail < FAIL_COOLDOWN) {
    return Promise.reject(new Error('Gemini suggestion throttled (recent failure)'));
  }

  const p = suggestWithGemini({ text, rating, businessName, businessType, tagLabels })
    .then((value) => {
      suggestionCache.set(key, { at: Date.now(), value });
      if (suggestionCache.size > 60) {
        suggestionCache.delete(suggestionCache.keys().next().value);
      }
      return value;
    })
    .catch((e) => {
      failedAt.set(key, Date.now());
      throw e;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** @returns {boolean} whether a fresh Gemini computation is (or could still be) worth waiting for. */
function isEnhancing(text, rating, businessName, businessType, tagLabels) {
  const key = cacheKeyOf(text, rating, businessName, businessType, tagLabels);
  if (inflight.has(key)) return true;
  const lastFail = failedAt.get(key);
  if (lastFail && Date.now() - lastFail < FAIL_COOLDOWN) return false;
  const hit = suggestionCache.get(key);
  return !hit || Date.now() - hit.at >= CACHE_TTL;
}

async function fetchWithTimeout(url, options, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

const STAR_TONES = {
  5: 'glowing, enthusiastic, joyful',
  4: 'warm, positive, appreciative',
  3: 'balanced, fair, friendly',
  2: 'constructive, gently reframing, polite',
  1: 'fair-minded, forward-looking, polite'
};

function buildSuggestionPrompt({ text, rating = 5, businessName = '', businessType = '', tagLabels = [], brainContext = '' }) {
  const tone = STAR_TONES[rating] || STAR_TONES[5];
  const biz = [businessName, businessType].filter(Boolean).join(' - ');
  const tags = (tagLabels && tagLabels.length) ? tagLabels.join(', ') : 'no specific tags';
  const brain = brainContext ? '\n\nVoice bank (study rhythm, never copy):\n' + brainContext : '';
  return [
    'You are an expert assistant that helps a customer finish writing a short Google review.',
    '',
    `Rating: ${rating} out of 5 stars (tone: ${tone}).`,
    biz ? `Business: ${biz}.` : '',
    `Relevant experience tags the customer may mention: ${tags}.`,
    'Partial review so far: "' + (text || '(empty)') + '"',
    '',
    'Write the MOST natural continuation the customer would type next:',
    '- 1-2 short sentences, first person, human phrasing, no emojis, no hashtags, no clichés like "highly recommended".',
    '- The continuation must be a real sentence fragment/phrase that extends the partial text.',
    '- For low ratings (1-3), stay polite and constructive - never negative or ranting.',
    '- Echo only NEW text that follows naturally after the partial review (do not repeat the partial text).',
    '',
    'Respond ONLY with valid JSON in this exact shape (no markdown fences, no commentary):',
    '{"primary": "<best single continuation>", "alternatives": ["<alt 1>", "<alt 2>", "<alt 3>"]}',
    brain
  ].filter(Boolean).join('\n');
}

async function suggestWithGemini({ text, rating = 5, businessName = '', businessType = '', tagLabels = [], brainContext = '' }) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const prompt = buildSuggestionPrompt({ text, rating, businessName, businessType, tagLabels, brainContext });
  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            primary: { type: 'string' },
            alternatives: { type: 'array', items: { type: 'string' } }
          },
          required: ['primary', 'alternatives']
        }
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new Error('Gemini API returned no content');
  }

  // responseMimeType=application/json usually returns plain JSON; defend against fences.
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // Fall back to extracting balanced JSON object if the model wrapped it oddly.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw e;
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  }

  const primary = String(parsed.primary || '').trim();
  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives.map(a => String(a).trim()).filter(Boolean).slice(0, 4)
    : [];

  if (!primary) throw new Error('Gemini suggestion empty');

  return { source: 'gemini', primary, alternatives };
}

module.exports = { suggestWithGemini, buildSuggestionPrompt, getSuggestedSuggestion, isEnhancing };