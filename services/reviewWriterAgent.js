// services/reviewWriterAgent.js
// Integrated review-writer agent service.
// Loads agent prompt from .agents/agents/review-writer.md and calls an
// OpenAI-compatible LLM (RAGFlow or OpenAI)with local positive-only fallback.

const fs = require('fs');
const path = require('path');

const AGENT_FILE = path.join(__dirname, '..', '.agents', 'agents', 'review-writer.md');
const RAGFLOW_API_URL = process.env.RAGFLOW_API_URL || 'http://localhost:9380/api/v1';
const RAGFLOW_API_KEY = process.env.RAGFLOW_API_KEY || '';
const RAGFLOW_AGENT_ID = process.env.RAGFLOW_AGENT_ID || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function loadAgentPrompt() {
  try {
    const raw = fs.readFileSync(AGENT_FILE, 'utf8');
    const body = raw.split('---').slice(2).join('---').trim();
    return body || defaultPrompt();
  } catch (e) {
    return defaultPrompt();
  }
}

function defaultPrompt() {
  return 'You are an expert Google review writer. Write short natural positive'
    + ' human-sounding 2-4 sentence reviews in English. Use only details'
    + ' from the user text. Never invent specifics. Never write negative reviews;'
    + ' low ratings are reframed as constructive feedback. Tone matches the rating,'
    + ' from enthusiastic (5) to constructive (1-2).';
}

const SYSTEM_PROMPT = loadAgentPrompt();


// Local positive-only fallback generator.
const HIGH5 = ['Absolutely loved my visit here!','What a fantastic spot!','One of the better experiences I have had in a while.']
const GOOD4 = ['Really glad Icame here.','Nice place worth stopping by.','Solid experience from start to finish.']
const OK3   = ['Had a decent experience at this place.','A pretty okay place overall.','It was fine for what it is.']
const LOW12 = ['Had a mixed experience, but there were some good moments.','Not my best visit, though a couple of things were nice.','Mixed feelings, but I would not write it off completely.']
const CLOSE5 = ['Will definitely be back!','Highly recommended to others.','A great addition to the area.']
const CLOSE4 = ['Will likely visit again.','Worth a visit.','Happy I gave it a try.']
const CLOSE3 = ['Would come back again if I am in the area.','Would consider returning.','Showing a lot of potential.']

function ratingOf(v) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return 4;
  return Math.max(1, Math.min(5,n));
}

function pick(arr, i) {
  return arr[i % arr.length];
}

// Gently reframe user-supplied text sothat low ratings never read as
// a negative review: acknowledge briefly, then pivot to something positive.
function reframe(text, r) {
  if (r >= 3) return text;
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  if (sentences.length === 0) return text;
  const first = sentences[0] || '';
  return first + ' - the experience still had some positives worth mentioning.';
}

function localGenerate(opts) {
  const r = ratingOf(opts.rating);
  const name = String(opts.businessName || '' ).trim() || 'this place';
  const type = String(opts.businessType || '' ).trim().toLowerCase();
  const text = String(opts.userText || '' ).trim().replace(/\s+/g,' ');
  const seed = (name + type + text).length;
  let opening = 'Had a pleasant experience.';
  if (r === 5) opening = pick(HIGH5, seed);
  if (r === 4) opening = pick(GOOD4, seed);
  if (r === 3) opening = pick(OK3, seed);
  if (r < 3) opening = pick(LOW12, seed);
  let closing = pick(CLOSE3, seed);
  if (r === 5) closing = pick(CLOSE5, seed);
  if (r === 4) closing = pick(CLOSE4, seed);
  const safeText = reframe(text, r);
  let body = safeText ? ' ' + safeText : '';
  if (!body) { body = type ? ' The ' + type + ' had a pleasant vibe.' : ' The overall experience was pleasant.'; }
  return opening + body + ' ' + closing;
}


// OpenAI-compatible chat completions caller.
async function callChat(apiBase, apiKey, model, messages) {
  const url = apiBase.replace(/\/$/, '') + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({ model, messages, temperature: 0.9, max_tokens: 180 })
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error('LLM API ' + resp.status + ': ' + errText.slice(0, 200));
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || '';
  return String(content).trim();
}

function buildMessages(inputs) {
  const r = ratingOf(inputs.rating);
  const labels = ['1 stars','2 stars','3 stars','4 stars','5 stars'];
  const label = labels[r - 1] || '4 stars';
  const prompt = 'Rating: ' + label
    + '\nBusiness name: ' + (inputs.businessName || '(not provided)')
    + '\nBusiness type: ' + (inputs.businessType || '(not provided)')
    + '\nUser experience notes: ' + (inputs.userText || '(no notes provided)')
    + '\n\nWrite the review now (2-4 sentences, positive, no emojis, no hashtags).';
  return [ { role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt } ];
}


// Public API.
async function generateReviewWithAgent(inputs) {
  inputs = inputs || {};
  const rating = ratingOf(inputs.rating);

  // 1. Prefer RAGFlow agent endpoint (same env vars as ragflowAgent.js).
  if (RAGFLOW_API_KEY && RAGFLOW_AGENT_ID) {
    try {
      const msgs = buildMessages(inputs);
      const question = msgs.map(m => m.role + ': ' + m.content).join('\n\n');
      const resp = await fetch(RAGFLOW_API_URL.replace(/\/$/, '') + '/agents/' + RAGFLOW_AGENT_ID + '/sessions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + RAGFLOW_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ question })
      });
      const data = await resp.json();
      if (data && data.data && data.data.answer) {
        return { ok: true, source: 'ragflow', review: String(data.data.answer).trim() };
      }
    } catch (e) {
      console.warn('[review-writer] RAGFlow unavailable:', e.message);
    }
  }

  // 2. OpenAI-compatible chat completions.
  if (OPENAI_API_KEY) {
    try {
      const review = await callChat(OPENAI_BASE, OPENAI_API_KEY, OPENAI_MODEL, buildMessages(inputs));
      if (review) return { ok: true, source: 'openai', review };
    } catch (e) {
      console.warn('[review-writer] OpenAI unavailable:', e.message);
    }
  }

  // 3. Local positive-only fallback generator.
  return { ok: true, source: 'local', review: localGenerate(inputs) };
}

module.exports = { loadAgentPrompt, generateReviewWithAgent, localGenerate, ratingOf };

