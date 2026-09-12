// services/geminiAgent.js
// ═══════════════════════════════════════════════════════════════
//  AI-POWERED REVIEW AGENT WITH MEMORY, EMBEDDINGS & SUGGESTIONS
// ═══════════════════════════════════════════════════════════════
// Features:
//   1. Review Generation with Semantic Memory (avoids repetition)
//   2. Dynamic Context-Aware Tag Generation (learns per business)
//   3. Intelligent Next-Word Prediction (adapts to user style)
//   4. Vector Embeddings for Semantic Similarity
//   5. Gemini-powered enhanced review suggestion engine (primary + alternatives)
// Falls back to local engine if Gemini is unavailable.
// ═══════════════════════════════════════════════════════════════

const db = require('../db/setup');
const path = require('path');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';
const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

// --- shared dedup / cache layer for suggestions ---
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

function buildSuggestionPrompt({ text, rating = 5, businessName = '', businessType = '', tagLabels = [] }) {
  const tone = STAR_TONES[rating] || STAR_TONES[5];
  const biz = [businessName, businessType].filter(Boolean).join(' - ');
  const tags = (tagLabels && tagLabels.length) ? tagLabels.join(', ') : 'no specific tags';
  return [
    'You are a smart autocomplete engine helping a customer finish their casual Google review.',
    '',
    `Rating: ${rating}/5 stars (${tone}).`,
    biz ? `Business: ${biz}.` : '',
    `Customer picked topics: ${tags}.`,
    'Partial text typed so far: "' + (text || '(empty)') + '"',
    '',
    'Generate the most natural, casual continuation a real customer would type next on their phone:',
    '- 1 short natural phrase/sentence, casual human phrasing (e.g. "and the food was super fresh", "staff were really sweet and quick").',
    '- No robotic corporate jargon, no emojis, no hashtags.',
    '- Provide only the CONTINUATION that attaches smoothly after the partial text.',
    '',
    'Respond ONLY with valid JSON in this exact shape:',
    '{"primary": "<best casual continuation>", "alternatives": ["<alt 1>", "<alt 2>", "<alt 3>"]}'
  ].filter(Boolean).join('\n');
}

async function suggestWithGemini({ text, rating = 5, businessName = '', businessType = '', tagLabels = [] }) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const prompt = buildSuggestionPrompt({ text, rating, businessName, businessType, tagLabels });
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

  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
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

// ═══════════════════════════════════════════════════════════════
//  CORE: Gemini API caller
// ═══════════════════════════════════════════════════════════════

async function callGemini(prompt, { temperature = 0.95, maxTokens = 120, systemInstruction = '' } = {}) {
  // 1. Try Gemini
  if (GEMINI_API_KEY) {
    try {
      const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: Math.max(16, Math.min(maxTokens, 1024)),
          topP: 0.95,
          thinkingConfig: { thinkingBudget: 0 }
        },
      };
      if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };

      const resp = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 8000);
      if (resp.ok) {
        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      } else {
        console.warn(`[callGemini] Gemini API ${resp.status}, trying NVIDIA NIM...`);
      }
    } catch (err) {
      console.warn('[callGemini] Gemini failed, trying NVIDIA NIM:', err.message);
    }
  }

  // 2. Fallback to NVIDIA NIM
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (nvidiaKey) {
    try {
      const nvidiaBase = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
      const nvidiaModel = process.env.NVIDIA_MODEL || 'deepseek-ai/deepseek-v4-flash-0731';
      const messages = [];
      if (systemInstruction) messages.push({ role: 'system', content: systemInstruction + ' Return ONLY the final casual review text.' });
      messages.push({ role: 'user', content: prompt + ' Output ONLY the review text directly. No steps, no analysis.' });
      const resp = await fetchWithTimeout(nvidiaBase.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + nvidiaKey
        },
        body: JSON.stringify({
          model: nvidiaModel,
          messages,
          temperature,
          max_tokens: maxTokens
        })
      }, 8000);
      if (resp.ok) {
        const data = await resp.json();
        const choice = data.choices?.[0]?.message;
        let content = choice?.content || '';
        if (!content && choice?.reasoning_content) content = choice.reasoning_content;
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (content) return content;
      }
    } catch (e) {
      console.warn('[callGemini] NVIDIA fallback failed:', e.message);
    }
  }

  // 3. Fallback to Groq (ultra-fast <300ms)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const messages = [];
      if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
      messages.push({ role: 'user', content: prompt });
      const resp = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature, max_tokens: maxTokens })
      }, 4000);
      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content.trim();
      }
    } catch (e) {}
  }

  // 4. Fallback to OpenAI
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const messages = [];
      if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
      messages.push({ role: 'user', content: prompt });
      const resp = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + openaiKey },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature, max_tokens: maxTokens })
      }, 4000);
      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content.trim();
      }
    } catch (e) {}
  }

  throw new Error('AI providers unavailable');
}

// ═══════════════════════════════════════════════════════════════
//  EMBEDDINGS: Vector Similarity for Review Memory
// ═══════════════════════════════════════════════════════════════

async function getEmbedding(text) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  const url = `${GEMINI_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text: String(text).slice(0, 2000) }] }, taskType: 'SEMANTIC_SIMILARITY' })
  });
  if (!resp.ok) throw new Error(`Embedding API ${resp.status}`);
  const data = await resp.json();
  return data?.embedding?.values || null;
}

// Cosine similarity between two vectors
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

// Find similar past reviews to avoid repetition
async function findSimilarReviews(clientId, newReview, rating, threshold = 0.75) {
  try {
    const past = db.prepare('SELECT review_text, embedding FROM review_memory WHERE client_id = ? AND rating = ? ORDER BY created_at DESC LIMIT 20').all(clientId, rating);
    if (past.length === 0) return [];

    const newEmbedding = await getEmbedding(newReview);
    if (!newEmbedding) return [];

    const similar = [];
    for (const p of past) {
      try {
        const pastEmbedding = JSON.parse(p.embedding);
        const sim = cosineSimilarity(newEmbedding, pastEmbedding);
        if (sim > threshold) similar.push(p.review_text);
      } catch (e) { /* ignore parse errors */ }
    }
    return similar;
  } catch (e) {
    console.warn('[geminiAgent] Similarity search failed:', e.message);
    return [];
  }
}

// Store a generated review in memory
async function storeReviewMemory(clientId, rating, tags, reviewText) {
  try {
    const embedding = await getEmbedding(reviewText);
    if (!embedding) return;
    db.prepare('INSERT INTO review_memory (client_id, rating, tags, review_text, embedding) VALUES (?, ?, ?, ?, ?)').run(clientId, rating, JSON.stringify(tags), reviewText, JSON.stringify(embedding));
  } catch (e) {
    console.warn('[geminiAgent] Failed to store review memory:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
//  SMART TAGS: Learn from review history per business
// ═══════════════════════════════════════════════════════════════

async function getLearnedTags(clientId) {
  try {
    const rows = db.prepare('SELECT tags FROM review_memory WHERE client_id = ? ORDER BY created_at DESC LIMIT 50').all(clientId);
    const tagCounts = {};
    for (const row of rows) {
      try {
        const tags = JSON.parse(row.tags);
        for (const tag of tags) {
          const key = typeof tag === 'string' ? tag.toLowerCase() : (tag.l || tag.label || '');
          if (key) tagCounts[key] = (tagCounts[key] || 0) + 1;
        }
      } catch (e) { /* ignore */ }
    }
    return Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag]) => tag);
  } catch (e) {
    return [];
  }
}

// Extract emerging themes from recent reviews
async function getEmergingThemes(clientId, days = 7) {
  try {
    const rows = db.prepare("SELECT review_text FROM review_memory WHERE client_id = ? AND created_at > datetime('now', '-7 days')").all(clientId);
    if (rows.length < 3) return [];

    const prompt = `Extract 3-5 emerging themes/positive aspects from these recent customer reviews:\n\n${rows.slice(0, 10).map(r => r.review_text).join('\n---\n')}\n\nOutput as comma-separated phrases like: "friendly staff", "quick service", "great ambiance".`;
    const themes = await callGemini(prompt, { temperature: 0.5, maxTokens: 100 });
    return themes.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  } catch (e) {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
//  USER STYLE LEARNING: Adapt to typing patterns
// ═══════════════════════════════════════════════════════════════

const userStyleCache = new Map(); // In-memory cache per session

function getUserStyle(slug) {
  if (!userStyleCache.has(slug)) {
    userStyleCache.set(slug, {
      commonStarts: {},     // First words/phrases user types
      commonPhrases: {},    // Phrases user completes with
      completionsCount: 0,
      lastActivity: Date.now()
    });
  }
  const style = userStyleCache.get(slug);
  style.lastActivity = Date.now();
  return style;
}

function learnFromCompletion(slug, partialText, chosenCompletion) {
  const style = getUserStyle(slug);
  const firstWord = partialText.trim().split(/\s+/)[0].toLowerCase();
  style.commonStarts[firstWord] = (style.commonStarts[firstWord] || 0) + 1;

  const lastThree = partialText.trim().split(/\s+/).slice(-3).join(' ').toLowerCase();
  style.commonPhrases[lastThree] = (style.commonPhrases[lastThree] || 0) + 1;
  style.completionsCount++;

  // Cleanup old entries
  if (userStyleCache.size > 100) {
    const now = Date.now();
    for (const [key, val] of userStyleCache.entries()) {
      if (now - val.lastActivity > 3600000) userStyleCache.delete(key);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  1. REVIEW GENERATION WITH MEMORY & UNIQUENESS
// ═══════════════════════════════════════════════════════════════

const REVIEW_SYSTEM_PROMPT = `You write genuine, informal, 100% human Google reviews (1-2 casual sentences) as an everyday customer typing quickly on their phone.

VOICE & TONE:
- First-person ("I" or "we"), informal, casual, warm and friendly.
- Sound like a real person talking to a friend (use words like: loved, honestly, super, totally, definitely, pretty good, really enjoyed, so tasty).
- Strictly ban corporate/robotic words like "establishment", "exemplary", "delicacies", "culinary", "patron", "commendable", "in conclusion".
- Weave the chosen topics/tags effortlessly into natural casual phrasing.
- 5 Stars: enthusiastic, cheerful ("Honestly so good, crispy chicken was super crunchy and fries were fresh. Definitely coming back!").
- 3-4 Stars: casual and positive ("Pretty good spot for a quick bite, food came out hot and staff were friendly.").
- 1-2 Stars: polite and constructive ("Food was okay but had to wait a bit long for the order today, hope it improves next time.").
- Output ONLY the review text. No emojis, no hashtags, no quotation marks.
- Length: 15-35 words max.`;

const reviewCache = new Map();
const REVIEW_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function generateReviewWithGemini({ rating = 5, businessName, businessType, userText, tags = [], clientId } = {}) {
  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const tagList = Array.isArray(tags) ? tags.map(t => typeof t === 'object' ? (t.l || '') : String(t)).filter(Boolean) : [];
  const cacheKey = `${businessName || 'biz'}:${r}:${tagList.slice().sort().join('+')}:${(userText || '').trim()}`;

  const cached = reviewCache.get(cacheKey);
  if (cached && Date.now() - cached.time < REVIEW_CACHE_TTL) {
    return cached.review;
  }

  const aspects = tagList.length > 0 ? `Selected topics: ${tagList.join(', ')}.` : '';
  const notes = userText ? `Customer notes: "${userText}".` : '';

  const prompt = `Write a quick informal 1-2 sentence Google review for ${businessName || 'this spot'} (${businessType || 'place'}). Rating: ${r} stars. ${aspects} ${notes} Keep it casual, human, and natural.`;

  let review = await callGemini(prompt, {
    temperature: 0.7,
    maxTokens: 80,
    systemInstruction: REVIEW_SYSTEM_PROMPT,
  });

  review = review.replace(/^["']|["']$/g, '').replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|#\w+/gu, '').trim();

  if (review && review.length > 15) {
    reviewCache.set(cacheKey, { time: Date.now(), review });
    if (reviewCache.size > 100) reviewCache.delete(reviewCache.keys().next().value);
  }

  if (clientId) {
    storeReviewMemory(clientId, r, tagList, review).catch(() => {});
  }

  return review;
}

// ═══════════════════════════════════════════════════════════════
//  2. DYNAMIC TAG GENERATION (SMART + LEARNED)
// ═══════════════════════════════════════════════════════════════

const TAG_SYSTEM_PROMPT = `Generate ${8} short clickable review topic tags for a Google review assistant.
Output format: JSON array of objects with "l" (label with emoji, max 22 chars).
Example: [{"l":"🍗 Crispy Chicken"},{"l":"🍟 Peri Peri Fries"},{"l":"⚡ Quick Service"}]
Valid JSON only.`;

const uniqueSeed = () => `[id:${Date.now().toString(36)}]`;

async function generateTagsWithGemini({ rating = 5, businessName, businessType, category, limit = 8, clientId } = {}) {
  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));

  let learnedContext = '';
  if (clientId) {
    const learned = await getLearnedTags(clientId);
    const themes = await getEmergingThemes(clientId);
    if (learned.length > 0 || themes.length > 0) {
      learnedContext = `\nContext: ${[...learned.slice(0, 3), ...themes.slice(0, 2)].join(', ')}`;
    }
  }

  const prompt = `${uniqueSeed()}
Generate ${limit} quick review topic tags for ${businessName || 'a local business'} (${businessType || category || 'restaurant'}), ${r} stars rating.${learnedContext}
Output JSON array with "l" key only.`;

  const raw = await callGemini(prompt, {
    temperature: 0.8,
    maxTokens: 140,
    systemInstruction: TAG_SYSTEM_PROMPT,
  });

  let jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const startIdx = jsonStr.indexOf('[');
  const endIdx = jsonStr.lastIndexOf(']');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    jsonStr = jsonStr.substring(startIdx, endIdx + 1);
  }
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const normalized = parsed.map(item => {
        if (typeof item === 'string') return { l: item };
        if (item && item.l) return { l: item.l };
        return null;
      }).filter(Boolean);
      if (normalized.length > 0) return normalized.slice(0, limit);
    }
  } catch (e) {
    console.warn('[geminiAgent] Tag parse failed:', raw.slice(0, 100));
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  3. NEXT-WORD PREDICTION (ADAPTIVE + CONTEXT-AWARE)
// ═══════════════════════════════════════════════════════════════

const PREDICT_SYSTEM_PROMPT = `You are an autocomplete engine for Google reviews.

Output: JSON with "primary" (best 5-15 word continuation) and "alternatives" (2-3 options).

Rules:
- Continuations flow naturally from the text.
- Positive, review-appropriate tone.
- No leading space. No emojis. Valid JSON only.`;

async function predictWithGemini({ text, rating = 5, businessType, clientId } = {}) {
  if (!text || text.trim().length < 2) return null;

  const r = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const slug = clientId ? `client_${clientId}` : 'default';

  const style = getUserStyle(slug);
  let styleContext = '';
  if (style.completionsCount > 5) {
    const topStarts = Object.entries(style.commonStarts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
    if (topStarts.length > 0) {
      styleContext = `\n\nUser typically starts with: "${topStarts.join('", "')}"`;
    }
  }

  const prompt = `Autocomplete this ${r}-star review for a ${businessType || 'business'}:\n\n"${text.trim()}"${styleContext}\n\nPredict next phrase. Output JSON with "primary" and "alternatives".`;

  const raw = await callGemini(prompt, {
    temperature: 0.8,
    maxTokens: 150,
    systemInstruction: PREDICT_SYSTEM_PROMPT,
  });

  const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    const result = JSON.parse(jsonStr);
    if (result.primary) {
      return {
        primary: result.primary,
        alternatives: Array.isArray(result.alternatives) ? result.alternatives : [],
      };
    }
  } catch (e) {
    console.warn('[geminiAgent] Predict parse failed:', raw.slice(0, 100));
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  4. REVIEW OPTIMIZATION / REWRITING
// ═══════════════════════════════════════════════════════════════

async function optimizeReviewWithGemini({ text, rating = 5, businessName } = {}) {
  if (!text || text.trim().length < 5) return null;

  const prompt = `${uniqueSeed()}
Polish this Google review into a natural 2-4 sentence review.
Keep meaning and details. Improve grammar, flow, and tone.
Rating: ${rating} stars for ${businessName || 'a business'}.

Original:
"${text.trim()}"

Output only the polished review.`;

  const optimized = await callGemini(prompt, {
    temperature: 0.7,
    maxTokens: 200,
    systemInstruction: REVIEW_SYSTEM_PROMPT,
  });

  return optimized.replace(/^["']|["']$/g, '').trim();
}

// ═══════════════════════════════════════════════════════════════
//  5. REVIEW STYLE ANALYSIS (What makes past reviews good)
// ═══════════════════════════════════════════════════════════════

async function analyzeReviewStyle(clientId) {
  try {
    const reviews = db.prepare('SELECT review_text FROM review_memory WHERE client_id = ? ORDER BY created_at DESC LIMIT 20').all(clientId);
    if (reviews.length < 5) return null;

    const text = reviews.map(r => r.review_text).join('\n---\n');
    const prompt = `Analyze the style of these customer reviews. Output JSON with:\n- "avg_length": average word count\n- "common_phrases": array of 3-5 frequently used phrases\n- "tone": overall tone description\n- "suggestions": 2-3 tips for writing similar reviews\n\nReviews:\n${text.slice(0, 2000)}`;

    const result = await callGemini(prompt, { temperature: 0.5, maxTokens: 300 });
    try {
      return JSON.parse(result.replace(/```json\s*/g, '').replace(/```\s*/g, ''));
    } catch (e) {
      return { raw_analysis: result };
    }
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  HEALTH CHECK & HELPERS
// ═══════════════════════════════════════════════════════════════

function isGeminiAvailable() {
  return !!GEMINI_API_KEY;
}

async function testGeminiConnection() {
  try {
    const result = await callGemini('Say "ok" in one word.', { temperature: 0, maxTokens: 5 });
    return { ok: true, response: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Export
module.exports = {
  callGemini,
  getEmbedding,
  cosineSimilarity,
  findSimilarReviews,
  storeReviewMemory,
  getLearnedTags,
  getEmergingThemes,
  getUserStyle,
  learnFromCompletion,
  generateReviewWithGemini,
  generateTagsWithGemini,
  predictWithGemini,
  optimizeReviewWithGemini,
  analyzeReviewStyle,
  isGeminiAvailable,
  testGeminiConnection,
  suggestWithGemini,
  buildSuggestionPrompt,
  getSuggestedSuggestion,
  isEnhancing,
};
