const express = require('express');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const {
  getAdminByEmail,
  getAllClients,
  getClientMetricsSummary,
  getClientById,
  getClientBySlug,
  createClient,
  updateClient,
  deleteClient,
  getClientAnalytics,
  getGlobalTelemetry
} = require('../db/firestore');
const { requireAuth } = require('../middleware/auth');
const { generateReviewWithAgent } = require('../services/reviewWriterAgent');
const { loginLimiter, verifyAdminCsrf } = require('../middleware/security');
const { adminLoginSchema, clientInputSchema, validateBody } = require('../middleware/validator');
const router = express.Router();

// ── AUTH ──────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session && req.session.adminId) return res.redirect('/admin');
  res.send(loginPage(req.query.error));
});

router.post('/login', loginLimiter, validateBody(adminLoginSchema, false), async (req, res) => {
  const { email, password } = req.validData || req.body;
  const admin = await getAdminByEmail(email);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.redirect('/admin/login?error=Invalid+email+or+password');
  }

  req.session.regenerate((err) => {
    if (err) {
      console.error('[Session Error]', err);
      return res.redirect('/admin/login?error=Authentication+failed');
    }
    req.session.adminId = admin.id;
    res.redirect('/admin');
  });
});

router.get('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.redirect('/admin/login');
    });
  } else {
    res.redirect('/admin/login');
  }
});

// ── DASHBOARD ─────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const clients = await getAllClients();
  const withStats = await Promise.all(clients.map(async (c) => {
    const metrics = await getClientMetricsSummary(c.id);
    return { ...c, views: metrics.views, clicks: metrics.clicks, today: metrics.today };
  }));
  const telemetry = await getGlobalTelemetry(7);
  res.send(dashboardPage(withStats, telemetry));
});

// ── REAL-TIME TELEMETRY API ─────────────────────────────────────────
router.get('/api/telemetry/live', requireAuth, async (req, res) => {
  try {
    const telemetry = await getGlobalTelemetry(7);
    res.json({ ok: true, telemetry });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// ── CLIENT CRUD ───────────────────────────────────────────────────
router.get('/clients/new', requireAuth, (req, res) => {
  res.send(clientFormPage(null, req.query.error));
});

function calculateExpiry(expiryType, customDate) {
  if (!expiryType || expiryType === 'unlimited') return null;
  if (expiryType === 'custom') {
    if (!customDate) return null;
    const d = new Date(customDate);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const now = new Date();
  if (expiryType === '7d') now.setDate(now.getDate() + 7);
  else if (expiryType === '14d') now.setDate(now.getDate() + 14);
  else if (expiryType === '30d' || expiryType === '1m') now.setMonth(now.getMonth() + 1);
  else if (expiryType === '90d' || expiryType === '3m') now.setMonth(now.getMonth() + 3);
  else if (expiryType === '180d' || expiryType === '6m') now.setMonth(now.getMonth() + 6);
  else if (expiryType === '365d' || expiryType === '1y') now.setFullYear(now.getFullYear() + 1);
  else return null;
  return now.toISOString();
}

function getExpiryInfo(client) {
  if (!client.active) {
    return { status: 'paused', label: 'Paused', badgeClass: 'badge-amber', dot: true };
  }
  if (!client.expires_at) {
    return { status: 'unlimited', label: 'Perpetual', badgeClass: 'badge-indigo', dot: true };
  }
  const exp = new Date(client.expires_at);
  const now = new Date();
  const diffMs = exp.getTime() - now.getTime();
  if (diffMs <= 0) {
    return { status: 'expired', label: 'Expired', badgeClass: 'badge-rose', dot: false };
  }
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 3) {
    return { status: 'expiring', label: diffDays === 1 ? '1d left' : `${diffDays}d left`, badgeClass: 'badge-amber', dot: true };
  }
  if (diffDays <= 30) {
    return { status: 'active', label: `${diffDays}d left`, badgeClass: 'badge-emerald', dot: true };
  }
  const diffMonths = Math.round(diffDays / 30);
  return { status: 'active', label: `${diffMonths}mo left`, badgeClass: 'badge-emerald', dot: true };
}

router.post('/clients/new', requireAuth, verifyAdminCsrf, validateBody(clientInputSchema, false), async (req, res) => {
  const data = req.validData || req.body;
  const slug = data.business_name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') + '-' + Date.now().toString(36);
  const tags = parseTags(data.tags_input);
  const expires_at = calculateExpiry(data.expiry_type, data.custom_expires_at);
  const themeMode = ['dark', 'light', 'system'].includes(data.primary_theme) ? data.primary_theme : 'dark';
  try {
    await createClient({
      slug,
      business_name: data.business_name,
      category: data.category,
      description: data.description,
      emoji: data.emoji || '🏪',
      place_id: data.place_id,
      primary_color: data.primary_color || '#7c4dff',
      primary_theme: themeMode,
      allow_theme_toggle: data.allow_theme_toggle,
      tags: JSON.stringify(tags),
      expires_at
    });
    res.redirect('/admin');
  } catch(e) {
    res.redirect('/admin/clients/new?error=' + encodeURIComponent(e.message));
  }
});

router.get('/clients/:id/edit', requireAuth, async (req, res) => {
  const client = await getClientById(req.params.id);
  if (!client) return res.redirect('/admin');
  res.send(clientFormPage(client, req.query.error));
});

router.post('/clients/:id/edit', requireAuth, verifyAdminCsrf, validateBody(clientInputSchema, false), async (req, res) => {
  const data = req.validData || req.body;
  try {
    const cleanSlug = data.slug ? data.slug.toLowerCase().replace(/[^a-z0-9-]+/g,'').replace(/(^-|-$)/g,'') : null;
    const tags = parseTags(data.tags_input);
    const expires_at = calculateExpiry(data.expiry_type, data.custom_expires_at);
    const themeMode = ['dark', 'light', 'system'].includes(data.primary_theme) ? data.primary_theme : 'dark';

    if (cleanSlug) {
      const existing = await getClientBySlug(cleanSlug);
      if (existing && existing.id !== req.params.id) {
        return res.redirect('/admin/clients/' + req.params.id + '/edit?error=' + encodeURIComponent('URL slug "' + cleanSlug + '" is already used by another business'));
      }
    }

    const payload = {
      business_name: data.business_name,
      category: data.category,
      description: data.description,
      emoji: data.emoji || '🏪',
      place_id: data.place_id,
      primary_color: data.primary_color || '#7c4dff',
      primary_theme: themeMode,
      allow_theme_toggle: data.allow_theme_toggle,
      tags: JSON.stringify(tags),
      active: data.active,
      expires_at
    };
    if (cleanSlug) payload.slug = cleanSlug;

    await updateClient(req.params.id, payload);
    res.redirect('/admin');
  } catch(e) {
    console.error('Client edit error:', e);
    res.redirect('/admin/clients/' + req.params.id + '/edit?error=' + encodeURIComponent(e.message));
  }
});

router.post('/clients/:id/delete', requireAuth, verifyAdminCsrf, async (req, res) => {
  await deleteClient(req.params.id);
  res.redirect('/admin');
});

router.post('/clients/:id/quick-theme', requireAuth, verifyAdminCsrf, async (req, res) => {
  const { primary_theme } = req.body;
  const themeMode = ['dark', 'light', 'system'].includes(primary_theme) ? primary_theme : 'dark';
  try {
    await updateClient(req.params.id, { primary_theme: themeMode });
    res.json({ ok: true, theme: themeMode });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── QR CODE ───────────────────────────────────────────────────────
router.get('/clients/:id/qr', requireAuth, async (req, res) => {
  const client = await getClientById(req.params.id);
  if (!client) return res.status(404).send('Not found');
  const url = req.protocol + '://' + req.get('host') + '/r/' + client.slug;
  const qr = await QRCode.toDataURL(url, { width: 800, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#0d0e14', light: '#ffffff' } });
  let qrSvg = '';
  try {
    qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'H' });
  } catch(e) {}
  res.send(qrPage(client, qr, url, qrSvg));
});

// ── ANALYTICS ─────────────────────────────────────────────────────
router.get('/clients/:id/analytics', requireAuth, async (req, res) => {
  const client = await getClientById(req.params.id);
  if (!client) return res.redirect('/admin');
  const analytics = await getClientAnalytics(client.id);
  const totalViews = analytics.totalViews;
  const totalClicks = analytics.totalClicks;
  const convRate = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : 0;
  res.send(analyticsPage(client, {
    dailyViews: analytics.dailyViews,
    dailyClicks: analytics.dailyClicks,
    totalViews,
    totalClicks,
    convRate
  }));
});

// ── AGENT TESTER ─────────────────────────────────────────────────
router.get('/agent-test', requireAuth, (req, res) => {
  res.send(agentTestPage());
});

router.post('/agent-test/generate', requireAuth, async (req, res) => {
  try {
    const { rating, businessName, businessType, userText } = req.body;
    const result = await generateReviewWithAgent({
      rating: String(rating || ''),
      businessName: String(businessName || ''),
      businessType: String(businessType || ''),
      userText: String(userText || '')
    });
    res.json({ ok: true, source: result.source, review: result.review });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── HELPERS ───────────────────────────────────────────────────────
function parseTags(input) {
  if (!input) return [];
  return input.split('\n').filter(l=>l.trim()).map(line => {
    const [label,...rest] = line.split('|');
    return { l: label.trim(), t: rest.join('|').trim() };
  });
}

// ══════════════════════════════════════════════════════════════════
// LUXURY WARM EDITORIAL DESIGN SYSTEM (STRIPE / ARC / LUXURY SAAS)
// ══════════════════════════════════════════════════════════════════
function shell(title, body, extraHead='', activeNav='dashboard', showSidebar=true) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — ReviewPro Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
${extraHead}
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg-app: #f9f6f0;
  --bg-card: #ffffff;
  --bg-card-subtle: #fbf9f4;
  --border-light: #ece5d8;
  --border-medium: #ded4c3;
  --t-heading: #1e1b18;
  --t-body: #49453f;
  --t-muted: #8c8273;
  --t-faint: #b5ac9d;
  
  --sidebar-bg: #0e1017;
  --sidebar-card: #151822;
  --sidebar-border: #1e2230;
  --sidebar-t1: #f8fafc;
  --sidebar-t2: #94a3b8;
  --sidebar-t3: #525c76;
  
  --amber-gold: #f59e0b;
  --amber-dark: #d97706;
  --amber-deep: #b45309;
  --amber-soft: #fef3c7;
  --amber-glow: rgba(245, 158, 11, 0.16);
  
  --emerald: #10b981;
  --emerald-soft: #d1fae5;
  --rose: #ef4444;
  --rose-soft: #fee2e2;
  --sky: #0284c7;
  --sky-soft: #e0f2fe;
  
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  
  --shadow-card: 0 2px 10px rgba(40, 25, 10, 0.03), 0 1px 3px rgba(40, 25, 10, 0.02);
  --shadow-hover: 0 12px 28px -6px rgba(40, 25, 10, 0.08), 0 4px 12px -2px rgba(40, 25, 10, 0.04);
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
}

body.dark-theme {
  --bg-app: #0a0b10;
  --bg-card: #12141d;
  --bg-card-subtle: #161924;
  --border-light: #202434;
  --border-medium: #2e344a;
  --t-heading: #f8fafc;
  --t-body: #cbd5e1;
  --t-muted: #828ca5;
  --t-faint: #4e576f;
  --shadow-card: 0 4px 16px rgba(0, 0, 0, 0.4);
  --shadow-hover: 0 12px 32px rgba(0, 0, 0, 0.6);
}

body {
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg-app);
  color: var(--t-body);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
}

a { color: inherit; text-decoration: none; }
button, input, select, textarea { font-family: inherit; }

/* ── APP LAYOUT ── */
.app-main {
  flex: 1;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.sidebar-logo-box {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0c0d12;
  font-weight: 800;
  font-size: 19px;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);
  flex-shrink: 0;
}

/* ── TOPBAR NAVIGATION HEADER ── */
.main-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 36px;
  gap: 20px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-light);
  position: sticky;
  top: 0;
  z-index: 1000;
  box-shadow: 0 1px 4px rgba(0,0,0,0.03);
}

.topbar-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}
.topbar-nav-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  color: var(--t-body);
  transition: all 0.2s var(--ease);
}
.topbar-nav-link:hover {
  background: var(--bg-card-subtle);
  color: var(--t-heading);
}
.topbar-nav-link.active {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0c0d12;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25);
}
.topbar-nav-badge {
  background: var(--amber-gold);
  color: #0c0d12;
  font-size: 9px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 6px;
  text-transform: uppercase;
  margin-left: 2px;
}

.topbar-search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-card-subtle);
  border: 1px solid var(--border-light);
  border-radius: 30px;
  padding: 0 16px;
  height: 40px;
  width: 100%;
  max-width: 380px;
  transition: all 0.2s var(--ease);
}
.topbar-search-box:focus-within {
  border-color: var(--amber-gold);
  background: var(--bg-card);
  box-shadow: 0 0 0 3px var(--amber-glow);
}
.topbar-search-input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--t-heading);
  width: 100%;
}
.topbar-search-input::placeholder { color: var(--t-muted); }
.kbd-shortcut {
  font-size: 10.5px;
  font-family: 'JetBrains Mono', monospace;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  color: var(--t-muted);
  padding: 2px 6px;
  border-radius: 5px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.action-round-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-card-subtle);
  border: 1px solid var(--border-light);
  color: var(--t-body);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}
.action-round-btn:hover {
  background: var(--bg-card);
  border-color: var(--border-medium);
  transform: translateY(-1px);
}
.badge-dot-alert {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 6px;
  height: 6px;
  background: var(--rose);
  border-radius: 50%;
  box-shadow: 0 0 6px var(--rose);
}
.btn-new-biz {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0c0d12;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 18px;
  border-radius: 20px;
  border: 1px solid rgba(245, 158, 11, 0.4);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  box-shadow: 0 3px 12px rgba(245, 158, 11, 0.3);
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-new-biz:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

/* ── MAIN CONTENT CONTAINER ── */
.content-stage {
  padding: 32px 36px 60px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* ── WELCOME HERO ── */
.welcome-hero-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 26px;
  gap: 20px;
  flex-wrap: wrap;
}
.welcome-greeting {
  font-size: 13px;
  font-weight: 600;
  color: var(--t-muted);
  margin-bottom: 4px;
}
.welcome-headline {
  font-size: 28px;
  font-weight: 800;
  color: var(--t-heading);
  letter-spacing: -0.03em;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.welcome-sub {
  font-size: 14px;
  color: var(--t-muted);
}
.welcome-right-cluster {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.cursive-banner-quote {
  font-family: 'Caveat', cursive;
  font-size: 24px;
  color: var(--amber-dark);
  font-weight: 700;
  letter-spacing: 0.01em;
}
.date-filter-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 20px;
  padding: 7px 14px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--t-heading);
  box-shadow: var(--shadow-card);
}

/* ── 4 BENTO METRIC STATS ── */
.metrics-quad-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
  margin-bottom: 28px;
}
@media (max-width: 1100px) {
  .metrics-quad-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .metrics-quad-grid { grid-template-columns: 1fr; }
}

.metric-card-luxe {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  box-shadow: var(--shadow-card);
  transition: all 0.25s var(--ease);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.metric-card-luxe:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-hover);
  border-color: var(--border-medium);
}
.metric-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.metric-icon-box {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.metric-icon-peach { background: #ffedd5; color: #ea580c; }
.metric-icon-sand { background: #fef3c7; color: #d97706; }
.metric-icon-amber { background: #fffbeb; color: #b45309; }
.metric-icon-sage { background: #f0fdf4; color: #16a34a; }

.metric-trend-pill {
  font-size: 11px;
  font-weight: 700;
  color: #16a34a;
  background: #dcfce7;
  padding: 3px 8px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.metric-label-txt {
  font-size: 12px;
  font-weight: 700;
  color: var(--t-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.metric-huge-val {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--t-heading);
  font-family: 'Plus Jakarta Sans', sans-serif;
  line-height: 1.1;
  margin-bottom: 6px;
}
.metric-sub-note {
  font-size: 12px;
  color: var(--t-muted);
}
.metric-sub-note strong {
  color: var(--emerald);
  font-weight: 700;
}

/* ── MIDDLE ROW: CHARTS & MAP ── */
.middle-tri-grid {
  display: grid;
  grid-template-columns: 1.8fr 1.1fr 1.1fr;
  gap: 20px;
  margin-bottom: 28px;
}
@media (max-width: 1200px) {
  .middle-tri-grid { grid-template-columns: 1fr; }
}

.chart-card-luxe {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.card-head-between {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}
.card-head-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--t-heading);
  letter-spacing: -0.02em;
  margin-bottom: 2px;
}
.card-head-sub {
  font-size: 12px;
  color: var(--t-muted);
}
.card-pill-select {
  background: var(--bg-card-subtle);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  padding: 4px 10px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--t-body);
  outline: none;
  cursor: pointer;
}

/* ── FUNNEL STAGES ── */
.funnel-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.funnel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.funnel-meta-left {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 130px;
  flex-shrink: 0;
}
.funnel-icon {
  font-size: 15px;
  color: var(--amber-gold);
}
.funnel-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--t-body);
}
.funnel-count {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--t-heading);
  margin-left: auto;
}
.funnel-bar-outer {
  flex: 1;
  height: 9px;
  background: #f1ebd8;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}
body.dark-theme .funnel-bar-outer {
  background: #1f2334;
}
.funnel-bar-fill {
  height: 100%;
  border-radius: 6px;
  background: linear-gradient(90deg, #f59e0b 0%, #d97706 100%);
}
.funnel-pct {
  font-size: 11.5px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  color: var(--t-muted);
  width: 44px;
  text-align: right;
  flex-shrink: 0;
}

/* ── MAP CANVAS ── */
.map-visual-container {
  height: 180px;
  background: #eef2f6;
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-light);
}
body.dark-theme .map-visual-container {
  background: #151824;
}
.map-bg-svg {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0.35;
  object-fit: cover;
}
.map-pin {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  background: #ffffff;
  border: 1px solid var(--border-light);
  padding: 4px 8px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  font-size: 11px;
  font-weight: 700;
  color: var(--t-heading);
  z-index: 2;
}
body.dark-theme .map-pin {
  background: #1a1d2c;
}
.map-pin-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 6px #f59e0b;
}

/* ── BOTTOM ROW: BUSINESSES & ACTIVITY ── */
.bottom-duo-grid {
  display: grid;
  grid-template-columns: 2.2fr 1fr;
  gap: 20px;
  margin-bottom: 28px;
}
@media (max-width: 1100px) {
  .bottom-duo-grid { grid-template-columns: 1fr; }
}

.biz-trio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.biz-luxury-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-card);
  position: relative;
  overflow: hidden;
  transition: all 0.25s var(--ease);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.biz-luxury-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-hover);
  border-color: var(--border-medium);
}
.biz-luxury-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--card-brand, #f59e0b);
}

.biz-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.biz-avatar-box {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--bg-card-subtle);
  border: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  overflow: hidden;
  flex-shrink: 0;
}
.biz-avatar-box img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.biz-meta-info { flex: 1; min-width: 0; }
.biz-meta-name {
  font-size: 15px;
  font-weight: 800;
  color: var(--t-heading);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}
.biz-meta-cat {
  font-size: 11.5px;
  color: var(--t-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.biz-status-pill {
  font-size: 11px;
  font-weight: 700;
  color: #16a34a;
  background: #dcfce7;
  padding: 3px 8px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.biz-telemetry-4row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: var(--bg-card-subtle);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 10px 8px;
  margin-bottom: 16px;
  text-align: center;
}
.biz-tel-item {
  display: flex;
  flex-direction: column;
}
.biz-tel-num {
  font-size: 14px;
  font-weight: 800;
  color: var(--t-heading);
  font-family: 'JetBrains Mono', monospace;
}
.biz-tel-lbl {
  font-size: 10px;
  color: var(--t-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 2px;
}

.biz-actions-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.slug-copy-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-card-subtle);
  border: 1px solid var(--border-light);
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--t-body);
  cursor: pointer;
  transition: all 0.2s;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slug-copy-pill:hover {
  background: #ffffff;
  border-color: var(--amber-gold);
}
.biz-icon-btns {
  display: flex;
  align-items: center;
  gap: 4px;
}
.biz-mini-btn {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--bg-card-subtle);
  border: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--t-body);
  transition: all 0.15s;
}
.biz-mini-btn:hover {
  background: #ffffff;
  border-color: var(--border-medium);
  color: var(--amber-dark);
}

/* ── RECENT ACTIVITY FEED ── */
.activity-feed-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.activity-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-light);
}
.activity-row:last-child { border-bottom: none; }
.activity-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}
.activity-blue { background: #e0f2fe; color: #0284c7; }
.activity-green { background: #dcfce7; color: #16a34a; }
.activity-gold { background: #fef3c7; color: #d97706; }

.activity-detail { flex: 1; min-width: 0; }
.activity-event {
  font-size: 13px;
  font-weight: 700;
  color: var(--t-heading);
}
.activity-biz {
  font-size: 11.5px;
  color: var(--t-muted);
}
.activity-time {
  font-size: 11px;
  color: var(--t-muted);
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
}

/* ── BOTTOM PROMO BANNER ── */
.promo-growth-banner {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: var(--radius-xl);
  padding: 24px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  box-shadow: 0 8px 24px -4px rgba(245, 158, 11, 0.12);
  position: relative;
  overflow: hidden;
}
body.dark-theme .promo-growth-banner {
  background: linear-gradient(135deg, #1c1917 0%, #292524 100%);
  border-color: rgba(245, 158, 11, 0.4);
}
.promo-left-cluster {
  display: flex;
  align-items: center;
  gap: 18px;
  z-index: 2;
}
.promo-rocket-box {
  width: 50px;
  height: 50px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  flex-shrink: 0;
}
body.dark-theme .promo-rocket-box {
  background: #18181b;
}
.promo-title {
  font-size: 18px;
  font-weight: 800;
  color: #1e1b18;
  letter-spacing: -0.02em;
  margin-bottom: 2px;
}
body.dark-theme .promo-title { color: #ffffff; }
.promo-subtitle {
  font-size: 13.5px;
  color: #78716c;
}
body.dark-theme .promo-subtitle { color: #a1a1aa; }
.promo-cta-btn {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0c0d12;
  font-weight: 800;
  font-size: 13.5px;
  padding: 12px 24px;
  border-radius: 30px;
  border: 1px solid rgba(245, 158, 11, 0.4);
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(217, 119, 6, 0.35);
  transition: all 0.2s;
  white-space: nowrap;
  z-index: 2;
}
.promo-cta-btn:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}
.promo-bottom-cursive {
  font-family: 'Caveat', cursive;
  font-size: 20px;
  color: #b45309;
  position: absolute;
  right: 28px;
  bottom: 8px;
  opacity: 0.85;
}

/* ── FORM & MODAL CONTROLS ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 18px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s var(--ease);
}
.btn-primary {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0c0d12;
  font-weight: 700;
  border-color: rgba(245, 158, 11, 0.4);
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.25);
}
.btn-secondary {
  background: var(--bg-card);
  border-color: var(--border-light);
  color: var(--t-heading);
}
.btn-danger-ghost {
  background: transparent;
  color: var(--rose);
  border: none;
}
.btn-sm { padding: 5px 10px; font-size: 12px; }
.btn-icon { width: 32px; height: 32px; padding: 0; }

.form-grid { display: grid; gap: 20px; }
.form-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
@media (max-width: 640px) { .form-2col { grid-template-columns: 1fr; } }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-label { font-size: 11.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--t-muted); }
.form-hint { font-size: 11.5px; color: var(--t-muted); }
.form-input, .form-textarea, .form-select {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  font-size: 14px;
  color: var(--t-heading);
  outline: none;
  transition: all 0.2s var(--ease);
  width: 100%;
}
.form-input:focus, .form-textarea:focus, .form-select:focus {
  border-color: var(--amber-gold);
  box-shadow: 0 0 0 3px var(--amber-glow);
}
.form-textarea { resize: vertical; min-height: 100px; }
.color-row { display: flex; align-items: center; gap: 10px; }
.color-pick { width: 44px; height: 44px; border-radius: 10px; border: 1px solid var(--border-light); background: transparent; cursor: pointer; padding: 2px; }

.toggle-wrap { display: flex; align-items: center; gap: 12px; }
.toggle { width: 46px; height: 26px; border-radius: 14px; background: #e2e8f0; border: 1px solid var(--border-light); position: relative; cursor: pointer; transition: all 0.2s; flex-shrink: 0; }
body.dark-theme .toggle { background: #222738; }
.toggle.on { background: var(--emerald); border-color: rgba(16, 185, 129, 0.4); }
.toggle-k { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: left 0.2s var(--ease); box-shadow: 0 1px 4px rgba(0,0,0,0.25); }
.toggle.on .toggle-k { left: 23px; }

.alert-err {
  background: var(--rose-soft);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  font-size: 13.5px;
  color: var(--rose);
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}
#toastBox {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.toast-msg {
  background: var(--bg-card);
  border: 1px solid var(--border-medium);
  color: var(--t-heading);
  padding: 12px 18px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  box-shadow: var(--shadow-hover);
  display: flex;
  align-items: center;
  gap: 10px;
  animation: toastSlideIn 0.2s var(--ease);
  pointer-events: auto;
}
/* ── LIVE MAP & MARKERS ── */
#liveActivityMap {
  width: 100%;
  height: 180px;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
  z-index: 1;
}
.leaflet-container {
  font-family: 'Plus Jakarta Sans', sans-serif !important;
  background: #f1ebd8 !important;
}
body.dark-theme .leaflet-container {
  background: #11131c !important;
}
.leaflet-tile-pane {
  filter: saturate(0.85) contrast(1.05);
}
body.dark-theme .leaflet-tile-pane {
  filter: invert(100%) hue-rotate(180deg) brightness(90%) contrast(90%);
}
.live-map-marker {
  position: relative;
  width: 16px;
  height: 16px;
}
.live-map-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f59e0b;
  border: 2px solid #ffffff;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.9);
  position: relative;
  z-index: 2;
}
.live-map-pulse {
  position: absolute;
  top: -7px;
  left: -7px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(245, 158, 11, 0.45);
  animation: mapPulse 1.8s infinite ease-out;
  z-index: 1;
}
@keyframes mapPulse {
  0% { transform: scale(0.4); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; }
}

/* ── LIVE STATUS BADGE ── */
.live-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #10b981;
  font-size: 10.5px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 12px;
  letter-spacing: 0.04em;
}
.live-ping-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
  animation: pingDot 1.4s infinite;
}
@keyframes pingDot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(0.75); }
}

/* ── CATEGORY PILL SELECTORS ── */
.biz-cat-pills {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.cat-pill-btn {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 20px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--t-body);
  cursor: pointer;
  transition: all 0.2s var(--ease);
  box-shadow: var(--shadow-card);
}
.cat-pill-btn:hover {
  border-color: var(--amber-gold);
  color: var(--amber-dark);
}
.cat-pill-btn.active {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0c0d12;
  border-color: rgba(245, 158, 11, 0.4);
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25);
}

/* ── INTERACTIVE MODAL DIALOGS ── */
.luxe-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 11, 16, 0.7);
  backdrop-filter: blur(6px);
  z-index: 10000;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.luxe-modal-card {
  background: var(--bg-card);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-hover);
  max-width: 820px;
  width: 100%;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modalScaleIn 0.2s var(--ease);
}
@keyframes modalScaleIn {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
.luxe-modal-head {
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.luxe-modal-title {
  font-size: 17px;
  font-weight: 800;
  color: var(--t-heading);
}
.luxe-modal-close {
  background: transparent;
  border: none;
  font-size: 20px;
  color: var(--t-muted);
  cursor: pointer;
  padding: 4px;
}
.luxe-modal-close:hover { color: var(--rose); }
.luxe-modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}
</style>
</head>
<body>

<!-- MAIN APP VIEWPORT -->
<div class="app-main">
  <!-- TOPBAR HEADER -->
  <header class="main-topbar">
    <div style="display:flex;align-items:center;gap:28px">
      <!-- BRAND LOGO -->
      <a href="/admin" style="display:flex;align-items:center;gap:10px">
        <div class="sidebar-logo-box">R</div>
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--t-heading);line-height:1.1;letter-spacing:-0.02em">ReviewPro</div>
          <div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--t-muted);font-weight:600">STUDIO v2.4</div>
        </div>
      </a>

      <!-- TOP NAVIGATION LINKS -->
      <nav class="topbar-nav">
        <a href="/admin" class="topbar-nav-link ${activeNav==='dashboard'?'active':''}">
          <i class="ti ti-smart-home"></i> <span>Dashboard</span>
        </a>
        <a href="/admin#businesses" class="topbar-nav-link">
          <i class="ti ti-building-store"></i> <span>Businesses</span>
        </a>
        <a href="/admin#analytics" class="topbar-nav-link">
          <i class="ti ti-chart-dots"></i> <span>Analytics</span>
        </a>
        <a href="/admin/clients/new" class="topbar-nav-link">
          <i class="ti ti-qrcode"></i> <span>QR Studio</span>
        </a>
        <a href="/admin/agent-test" class="topbar-nav-link ${activeNav==='agent'?'active':''}">
          <i class="ti ti-sparkles" style="color:var(--amber-gold)"></i> <span>Agent Lab</span>
          <span class="topbar-nav-badge">New</span>
        </a>
      </nav>
    </div>

    <div style="display:flex;align-items:center;gap:16px;flex:1;max-width:440px;margin:0 20px">
      <div class="topbar-search-box" style="max-width:100%">
        <i class="ti ti-search" style="color:var(--t-muted);font-size:15px"></i>
        <input class="topbar-search-input" id="globalSearchInput" placeholder="Search businesses by name, category, or slug..." oninput="filterBusinesses(this.value)">
        <span class="kbd-shortcut">Ctrl K</span>
      </div>
    </div>

    <div class="topbar-actions">
      <button class="action-round-btn" onclick="toggleAppTheme()" title="Toggle Light / Dark Mode">
        <i class="ti ti-sun-moon"></i>
      </button>
      <button class="action-round-btn" onclick="alert('No new system alerts')" title="Notifications">
        <i class="ti ti-bell"></i>
        <span class="badge-dot-alert"></span>
      </button>
      <a href="/admin/clients/new" class="btn-new-biz">
        <i class="ti ti-plus"></i> New Business
      </a>
      <div style="display:flex;align-items:center;gap:10px;padding-left:10px;border-left:1px solid var(--border-light)">
        <div style="width:34px;height:34px;border-radius:50%;background:#292524;color:#f8fafc;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px" title="Mustaq (Admin)">M</div>
        <a href="/admin/logout" title="Sign out" style="color:var(--t-muted);font-size:16px;padding:4px"><i class="ti ti-logout"></i></a>
      </div>
    </div>
  </header>

  <!-- CONTENT STAGE -->
  <main class="content-stage">
    ${body}
  </main>
</div>

<div id="toastBox"></div>

<script>
function toggleAppTheme() {
  document.body.classList.toggle('dark-theme');
  const isDark = document.body.classList.contains('dark-theme');
  localStorage.setItem('reviewpro_admin_theme', isDark ? 'dark' : 'light');
}
if (localStorage.getItem('reviewpro_admin_theme') === 'dark') {
  document.body.classList.add('dark-theme');
}

function showToast(msg, isErr = false) {
  const box = document.getElementById('toastBox');
  if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast-msg ' + (isErr ? 'error' : 'success');
  t.innerHTML = (isErr ? '<i class="ti ti-alert-circle"></i> ' : '<i class="ti ti-check"></i> ') + msg;
  box.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px)';
    t.style.transition = 'all 0.2s';
    setTimeout(() => t.remove(), 200);
  }, 2500);
}

function copyClientUrl(slug) {
  const url = window.location.origin + '/r/' + slug;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => showToast('Copied: ' + url));
  } else {
    showToast('Copied: ' + url);
  }
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    const inp = document.getElementById('globalSearchInput');
    if (inp) inp.focus();
  }
});
</script>
${process.env.NODE_ENV !== 'production' ? '<script src="/agentation.js"></script>' : ''}
</body></html>`;
}

// ── LOGIN PAGE ─────────────────────────────────────────────────────
function loginPage(error, csrfToken = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign In — ReviewPro Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Plus Jakarta Sans', sans-serif;
  background: #0a0b10;
  color: #f8fafc;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.login-card {
  width: 100%;
  max-width: 410px;
  background: #12141d;
  border: 1px solid #202434;
  border-radius: 24px;
  padding: 40px 34px;
  box-shadow: 0 16px 48px -8px rgba(0, 0, 0, 0.6);
  position: relative;
}
.login-logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0c0d12;
  font-weight: 800;
  font-size: 20px;
  margin-bottom: 20px;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
}
.brand-title { font-size: 24px; font-weight: 800; letter-spacing: -0.03em; color: #f8fafc; margin-bottom: 6px; }
.brand-desc { font-size: 13.5px; color: #828ca5; margin-bottom: 28px; }
.field-label { display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #525c76; margin-bottom: 8px; }
.text-input {
  width: 100%;
  background: #161924;
  border: 1px solid #202434;
  border-radius: 12px;
  padding: 13px 16px;
  color: #f8fafc;
  font-size: 14px;
  outline: none;
  margin-bottom: 18px;
  transition: all 0.2s;
}
.text-input:focus { border-color: #f59e0b; box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15); background: #1c202e; }
.submit-btn {
  width: 100%;
  height: 48px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: 12px;
  color: #0c0d12;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;
  box-shadow: 0 2px 12px rgba(245, 158, 11, 0.25);
  transition: all 0.2s;
}
.submit-btn:hover { filter: brightness(1.08); transform: translateY(-1px); }
.error-banner {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 10px;
  padding: 12px 14px;
  color: #ef4444;
  font-size: 13px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
</head>
<body>
<div class="login-card">
  <div class="login-logo">R</div>
  <h1 class="brand-title">ReviewPro Studio</h1>
  <p class="brand-desc">Sign in to manage multi-tenant Google review portals.</p>
  ${error ? `<div class="error-banner"><i class="ti ti-alert-circle"></i> ${esc(error)}</div>` : ''}
  <form method="POST" action="/admin/login">
    ${csrfToken ? `<input type="hidden" name="_csrf" value="${esc(csrfToken)}">` : ''}
    <label class="field-label">Admin Email</label>
    <input class="text-input" type="email" name="email" required autocomplete="email" placeholder="admin@reviewpro.in">
    <label class="field-label">Password</label>
    <input class="text-input" type="password" name="password" required autocomplete="current-password" placeholder="••••••••">
    <button class="submit-btn" type="submit">Sign in to Console <i class="ti ti-arrow-right"></i></button>
  </form>
</div>
</body></html>`;
}

// ── DASHBOARD PAGE ─────────────────────────────────────────────────
function dashboardPage(clients, telemetry = {}) {
  const totalViews = clients.reduce((s, c) => s + c.views, 0);
  const totalClicks = clients.reduce((s, c) => s + c.clicks, 0);
  const todayViews = clients.reduce((s, c) => s + c.today, 0);
  const activeCount = clients.filter(c => c.active).length;
  const overallConv = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : '0.0';

  // Funnel calculations from real-time database telemetry
  const fViews = telemetry.funnel?.views ?? totalViews;
  const fStarted = telemetry.funnel?.started ?? Math.round(totalViews * 0.78);
  const fCompleted = telemetry.funnel?.completed ?? Math.round(totalViews * 0.56);
  const fClicks = telemetry.funnel?.clicks ?? totalClicks;
  const fStartedPct = telemetry.funnel?.startedPct ?? (totalViews > 0 ? ((fStarted / totalViews) * 100).toFixed(1) : '0.0');
  const fCompletedPct = telemetry.funnel?.completedPct ?? (totalViews > 0 ? ((fCompleted / totalViews) * 100).toFixed(1) : '0.0');
  const fClicksPct = telemetry.funnel?.clicksPct ?? overallConv;

  const chartLabels = telemetry.chartLabels || ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Today'];
  const viewSeries = telemetry.viewSeries || [0, 0, 0, 0, 0, 0, todayViews];
  const clickSeries = telemetry.clickSeries || [0, 0, 0, 0, 0, 0, totalClicks];
  const dateRangeStr = telemetry.dateRangeLabel || 'Last 7 Days';
  const locationStats = telemetry.locationStats || { 'Hyderabad': 0, 'Vijayawada': 0, 'Nellore': 0 };
  const activities = telemetry.recentActivities && telemetry.recentActivities.length > 0
    ? telemetry.recentActivities
    : [
        { type: 'view', biz: clients[0]?.business_name || 'Portal', timeStr: 'Just now' }
      ];

  const recentActivityHtml = activities.map(act => {
    const isClick = act.type === 'click';
    return `
    <div class="activity-row">
      <div class="activity-icon-wrap ${isClick ? 'activity-green' : 'activity-blue'}">
        <i class="${isClick ? 'ti ti-external-link' : 'ti ti-eye'}"></i>
      </div>
      <div class="activity-detail">
        <div class="activity-event">${isClick ? 'Google click' : 'Page view'}</div>
        <div class="activity-biz">${esc(act.biz)}</div>
      </div>
      <span class="activity-time">${esc(act.timeStr)}</span>
    </div>`;
  }).join('');

  // Business Cards Grid HTML
  const bizCardsHtml = clients.map(c => {
    const cr = c.views > 0 ? ((c.clicks / c.views) * 100).toFixed(0) : 0;
    const expInfo = getExpiryInfo(c);
    const isImg = c.emoji && (c.emoji.startsWith('/') || c.emoji.startsWith('http') || c.emoji.match(/\.(png|jpg|jpeg|svg|webp)$/i));
    const accent = c.primary_color || '#f59e0b';

    return `
    <div class="biz-luxury-card" style="--card-brand: ${esc(accent)}" data-slug="${esc(c.slug)}" data-name="${esc(c.business_name.toLowerCase())}" data-category="${esc(c.category.toLowerCase())}">
      <div>
        <div class="biz-card-head">
          <div class="biz-avatar-box">
            ${isImg ? `<img src="${esc(c.emoji)}" alt="${esc(c.business_name)}">` : esc(c.emoji || '🏪')}
          </div>
          <div class="biz-meta-info">
            <div class="biz-meta-name" title="${esc(c.business_name)}">${esc(c.business_name)}</div>
            <div class="biz-meta-cat">${esc(c.category || 'Local Business')}</div>
          </div>
          <span class="biz-status-pill">
            <span style="width:6px;height:6px;border-radius:50%;background:#16a34a"></span> Active
          </span>
        </div>

        <div class="biz-telemetry-4row">
          <div class="biz-tel-item">
            <span class="biz-tel-num">${c.views}</span>
            <span class="biz-tel-lbl">Impressions</span>
          </div>
          <div class="biz-tel-item">
            <span class="biz-tel-num" style="color:var(--amber-dark)">${c.today}</span>
            <span class="biz-tel-lbl">Today</span>
          </div>
          <div class="biz-tel-item">
            <span class="biz-tel-num">${c.clicks}</span>
            <span class="biz-tel-lbl">Clicks</span>
          </div>
          <div class="biz-tel-item">
            <span class="biz-tel-num" style="color:#16a34a">${cr}%</span>
            <span class="biz-tel-lbl">Conversion</span>
          </div>
        </div>
      </div>

      <div class="biz-actions-bottom">
        <div class="slug-copy-pill" onclick="copyClientUrl('${esc(c.slug)}')" title="Click to copy link">
          <i class="ti ti-link" style="color:var(--amber-dark)"></i>
          <span>/r/${esc(c.slug)}</span>
        </div>

        <div class="biz-icon-btns">
          <a href="/admin/clients/${c.id}/qr" class="biz-mini-btn" title="QR Studio"><i class="ti ti-qrcode"></i></a>
          <a href="/admin/clients/${c.id}/analytics" class="biz-mini-btn" title="Analytics"><i class="ti ti-chart-bar"></i></a>
          <a href="/admin/clients/${c.id}/edit" class="biz-mini-btn" title="Edit"><i class="ti ti-edit"></i></a>
        </div>
      </div>
    </div>`;
  }).join('');

  return shell('Dashboard', `
    <!-- WELCOME ROW -->
    <div class="welcome-hero-row">
      <div>
        <div class="welcome-greeting">Good afternoon,</div>
        <h1 class="welcome-headline">Welcome back, Mustaq 👋</h1>
        <div class="welcome-sub">Track. Understand. Grow. Turn every customer experience into real impact.</div>
      </div>

      <div class="welcome-right-cluster">
        <div class="cursive-banner-quote">"Better Reviews, Happier Businesses!"</div>
        <div class="date-filter-pill">
          <i class="ti ti-calendar" style="color:var(--amber-dark)"></i>
          <span>${esc(dateRangeStr)}</span>
          <i class="ti ti-chevron-down" style="font-size:12px;color:var(--t-muted)"></i>
        </div>
      </div>
    </div>

    <!-- 4 BENTO METRIC STATS -->
    <div class="metrics-quad-grid">
      <!-- 1. Active Portals -->
      <div class="metric-card-luxe">
        <div class="metric-card-top">
          <div class="metric-icon-box metric-icon-peach"><i class="ti ti-eye"></i></div>
          <span class="metric-trend-pill">↑ ${activeCount > 0 ? '100%' : '0%'}</span>
        </div>
        <div>
          <div class="metric-label-txt">Active Portals</div>
          <div class="metric-huge-val">${activeCount}</div>
          <div class="metric-sub-note">out of ${clients.length} total businesses</div>
        </div>
      </div>

      <!-- 2. Total Impressions -->
      <div class="metric-card-luxe">
        <div class="metric-card-top">
          <div class="metric-icon-box metric-icon-sand"><i class="ti ti-chart-bar"></i></div>
          <span class="metric-trend-pill">↑ ${totalViews > 0 ? '100%' : '0%'}</span>
        </div>
        <div>
          <div class="metric-label-txt">Total Impressions</div>
          <div class="metric-huge-val">${totalViews}</div>
          <div class="metric-sub-note"><strong>+${todayViews} today</strong> across all portals</div>
        </div>
      </div>

      <!-- 3. Maps Review Clicks -->
      <div class="metric-card-luxe">
        <div class="metric-card-top">
          <div class="metric-icon-box metric-icon-amber"><i class="ti ti-pointer"></i></div>
          <span class="metric-trend-pill">↑ ${totalClicks > 0 ? '100%' : '0%'}</span>
        </div>
        <div>
          <div class="metric-label-txt">Maps Review Clicks</div>
          <div class="metric-huge-val">${totalClicks}</div>
          <div class="metric-sub-note">opened native Google Review flow</div>
        </div>
      </div>

      <!-- 4. Avg. Conversion -->
      <div class="metric-card-luxe">
        <div class="metric-card-top">
          <div class="metric-icon-box metric-icon-sage"><i class="ti ti-users"></i></div>
          <span class="metric-trend-pill">↑ ${overallConv > 0 ? overallConv + '%' : '0%'}</span>
        </div>
        <div>
          <div class="metric-label-txt">Avg. Conversion</div>
          <div class="metric-huge-val">${overallConv}%</div>
          <div class="metric-sub-note">impressions converted to 5★ ratings</div>
        </div>
      </div>
    </div>

    <!-- MIDDLE TRI-GRID: CHART + FUNNEL + MAP -->
    <div class="middle-tri-grid">
      <!-- 1. Impressions vs Review Clicks Curve -->
      <div class="chart-card-luxe">
        <div class="card-head-between">
          <div>
            <div class="card-head-title">Impressions vs Review Clicks</div>
            <div class="card-head-sub">Track your growth over time</div>
          </div>
          <select class="card-pill-select">
            <option>Last 7 Days</option>
            <option>Last 30 Days</option>
            <option>All Time</option>
          </select>
        </div>

        <div style="position:relative;height:180px;width:100%">
          <canvas id="growthLineChart"></canvas>
        </div>
      </div>

      <!-- 2. Conversion Funnel -->
      <div class="chart-card-luxe">
        <div class="card-head-between">
          <div>
            <div class="card-head-title">Conversion Funnel</div>
            <div class="card-head-sub">From scan to Google review</div>
          </div>
          <select class="card-pill-select">
            <option>All Portals</option>
          </select>
        </div>

        <div class="funnel-list">
          <div class="funnel-item">
            <div class="funnel-meta-left">
              <i class="ti ti-eye funnel-icon"></i>
              <span class="funnel-name">Page Views</span>
              <span class="funnel-count">${fViews}</span>
            </div>
            <div class="funnel-bar-outer"><div class="funnel-bar-fill" style="width:100%"></div></div>
            <span class="funnel-pct">100%</span>
          </div>

          <div class="funnel-item">
            <div class="funnel-meta-left">
              <i class="ti ti-sparkles funnel-icon"></i>
              <span class="funnel-name">Review Started</span>
              <span class="funnel-count">${fStarted}</span>
            </div>
            <div class="funnel-bar-outer"><div class="funnel-bar-fill" style="width:${fStartedPct}%"></div></div>
            <span class="funnel-pct">${fStartedPct}%</span>
          </div>

          <div class="funnel-item">
            <div class="funnel-meta-left">
              <i class="ti ti-message-dots funnel-icon"></i>
              <span class="funnel-name">Review Done</span>
              <span class="funnel-count">${fCompleted}</span>
            </div>
            <div class="funnel-bar-outer"><div class="funnel-bar-fill" style="width:${fCompletedPct}%"></div></div>
            <span class="funnel-pct">${fCompletedPct}%</span>
          </div>

          <div class="funnel-item">
            <div class="funnel-meta-left">
              <i class="ti ti-external-link funnel-icon"></i>
              <span class="funnel-name">Google Clicked</span>
              <span class="funnel-count">${fClicks}</span>
            </div>
            <div class="funnel-bar-outer"><div class="funnel-bar-fill" style="width:${fClicksPct}%"></div></div>
            <span class="funnel-pct">${fClicksPct}%</span>
          </div>
        </div>
      </div>

      <!-- 3. Review Activity Map -->
      <div class="chart-card-luxe">
        <div class="card-head-between">
          <div>
            <div class="card-head-title">Review Activity Map</div>
            <div class="card-head-sub">Live visitor telemetry across regions</div>
          </div>
          <a href="javascript:void(0)" onclick="openMapModal()" class="card-head-sub" style="color:var(--amber-dark);font-weight:700;cursor:pointer">View Map ↗</a>
        </div>

        <div id="liveActivityMap"></div>
      </div>
    </div>

    <!-- BOTTOM SECTION: YOUR BUSINESSES + RECENT ACTIVITY -->
    <div class="bottom-duo-grid" id="businesses">
      <!-- BUSINESSES COLUMN -->
      <div>
        <div class="card-head-between" style="margin-bottom:12px">
          <div>
            <div class="card-head-title">Your Businesses</div>
            <div class="card-head-sub">Showing all <span id="bizCountBadge">${clients.length}</span> active review portals</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <a href="javascript:void(0)" onclick="viewAllBusinesses()" class="card-head-sub" style="color:var(--amber-dark);font-weight:700;cursor:pointer">View All &rarr;</a>
          </div>
        </div>

        <!-- CATEGORY & STATUS FILTER PILLS -->
        <div class="biz-cat-pills">
          <button class="cat-pill-btn active" data-filter="all" onclick="filterByCat('all', this)">All (${clients.length})</button>
          <button class="cat-pill-btn" data-filter="restaurant" onclick="filterByCat('restaurant', this)">Restaurants</button>
          <button class="cat-pill-btn" data-filter="cafe" onclick="filterByCat('cafe', this)">Café & Dining</button>
          <button class="cat-pill-btn" data-filter="retail" onclick="filterByCat('retail', this)">Retail</button>
          <button class="cat-pill-btn" data-filter="service" onclick="filterByCat('service', this)">Services</button>
        </div>

        <div class="biz-trio-grid" id="bizGridContainer">
          ${bizCardsHtml}
        </div>
      </div>

      <!-- RECENT ACTIVITY FEED COLUMN -->
      <div class="chart-card-luxe" id="analytics">
        <div class="card-head-between" style="margin-bottom:12px">
          <div>
            <div class="card-head-title" style="display:flex;align-items:center;gap:8px">
              Recent Activity
              <span class="live-status-badge"><span class="live-ping-dot"></span> LIVE</span>
            </div>
            <div class="card-head-sub">Live customer interactions</div>
          </div>
          <a href="javascript:void(0)" onclick="openActivityModal()" class="card-head-sub" style="color:var(--amber-dark);font-weight:700;cursor:pointer">View All</a>
        </div>

        <div class="activity-feed-list" id="recentActivityList">
          ${recentActivityHtml}
        </div>
      </div>
    </div>

    <!-- PROMOTIONAL GROWTH BANNER -->
    <div class="promo-growth-banner">
      <div class="promo-left-cluster">
        <div class="promo-rocket-box">🚀</div>
        <div>
          <div class="promo-title">Turn Feedback into Growth</div>
          <div class="promo-subtitle">More reviews. More visibility. More customers.</div>
        </div>
      </div>

      <a href="/admin/clients/new" class="promo-cta-btn">+ Add Your Next Business</a>

      <div class="promo-bottom-cursive">"Happy customers build brighter tomorrows."</div>
    </div>

    <!-- ── MODAL 1: FULL INTERACTIVE MAP MODAL ── -->
    <div class="luxe-modal-backdrop" id="mapModalBackdrop" onclick="if(event.target===this)closeMapModal()">
      <div class="luxe-modal-card">
        <div class="luxe-modal-head">
          <div>
            <div class="luxe-modal-title">Live Review Telemetry Map</div>
            <div style="font-size:12px;color:var(--t-muted)">Global & Regional real-time review portal engagement</div>
          </div>
          <button class="luxe-modal-close" onclick="closeMapModal()"><i class="ti ti-x"></i></button>
        </div>
        <div class="luxe-modal-body" style="padding:0">
          <div id="modalBigMapCanvas" style="height:460px;width:100%"></div>
        </div>
      </div>
    </div>

    <!-- ── MODAL 2: FULL RECENT ACTIVITY AUDIT STREAM ── -->
    <div class="luxe-modal-backdrop" id="activityModalBackdrop" onclick="if(event.target===this)closeActivityModal()">
      <div class="luxe-modal-card">
        <div class="luxe-modal-head">
          <div>
            <div class="luxe-modal-title" style="display:flex;align-items:center;gap:8px">
              Live Interaction Stream
              <span class="live-status-badge"><span class="live-ping-dot"></span> REALTIME</span>
            </div>
            <div style="font-size:12px;color:var(--t-muted)">Complete chronological audit trail of scans, impressions and review clicks</div>
          </div>
          <button class="luxe-modal-close" onclick="closeActivityModal()"><i class="ti ti-x"></i></button>
        </div>
        <div class="luxe-modal-body">
          <div id="modalActivityList" class="activity-feed-list">
            ${(telemetry.allActivities || activities).map(act => {
              const isClick = act.type === 'click';
              return `
              <div class="activity-row" style="padding:10px 0">
                <div class="activity-icon-wrap ${isClick ? 'activity-green' : 'activity-blue'}">
                  <i class="${isClick ? 'ti ti-external-link' : 'ti ti-eye'}"></i>
                </div>
                <div class="activity-detail">
                  <div class="activity-event">${isClick ? 'Google Maps Review Click' : 'Portal Landing Impression'}</div>
                  <div class="activity-biz">${esc(act.biz)} &bull; <span style="color:var(--t-muted)">${esc(act.details || '')}</span></div>
                </div>
                <span class="activity-time">${esc(act.timeStr || act.formattedTime || 'Recent')}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>

    <script>
      // 1. Initialize Spline Curve Chart with REAL-TIME Firestore Telemetry
      const ctx = document.getElementById('growthLineChart');
      let growthChartInstance = null;
      if (ctx) {
        growthChartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels: ${JSON.stringify(chartLabels)},
            datasets: [
              {
                label: 'Impressions',
                data: ${JSON.stringify(viewSeries)},
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                borderWidth: 2.5,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#f59e0b',
                pointRadius: 4
              },
              {
                label: 'Review Clicks',
                data: ${JSON.stringify(clickSeries)},
                borderColor: '#292524',
                backgroundColor: 'transparent',
                borderWidth: 2,
                tension: 0.4,
                borderDash: [4, 4],
                pointBackgroundColor: '#292524',
                pointRadius: 3
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'top',
                align: 'end',
                labels: { boxWidth: 10, font: { size: 11, family: 'Plus Jakarta Sans' }, color: '#78716c' }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { font: { size: 10, family: 'Plus Jakarta Sans' }, color: '#a8a29e' }
              },
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(0,0,0,0.04)' },
                ticks: { font: { size: 10, family: 'Plus Jakarta Sans' }, color: '#a8a29e', precision: 0 }
              }
            }
          }
        });
      }

      // 2. Initialize Interactive Live Leaflet Map
      const geoPoints = ${JSON.stringify(telemetry.geoPoints || [
        { city: 'Hyderabad', lat: 17.3850, lng: 78.4867, views: 1 },
        { city: 'Vijayawada', lat: 16.5062, lng: 80.6480, views: 1 },
        { city: 'Nellore', lat: 14.4426, lng: 79.9865, views: 1 }
      ])};

      let liveMap = null;
      function initLiveMap() {
        const mapEl = document.getElementById('liveActivityMap');
        if (!mapEl || typeof L === 'undefined') return;

        liveMap = L.map('liveActivityMap', {
          center: [16.0, 79.5],
          zoom: 6,
          zoomControl: false,
          attributionControl: false
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 18
        }).addTo(liveMap);

        const customMarkerIcon = L.divIcon({
          className: 'custom-map-icon-wrap',
          html: '<div class="live-map-marker"><div class="live-map-pulse"></div><div class="live-map-dot"></div></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        geoPoints.forEach(pt => {
          const m = L.marker([pt.lat, pt.lng], { icon: customMarkerIcon }).addTo(liveMap);
          m.bindPopup('<div style="font-family:Plus Jakarta Sans;padding:4px"><strong>' + pt.city + '</strong><br><span style="color:#d97706;font-weight:700">' + (pt.views || 1) + ' views</span></div>');
        });
      }

      // Modal Map Instance
      let modalMap = null;
      function openMapModal() {
        const modal = document.getElementById('mapModalBackdrop');
        if (!modal) return;
        modal.style.display = 'flex';
        setTimeout(() => {
          if (!modalMap && typeof L !== 'undefined') {
            modalMap = L.map('modalBigMapCanvas', {
              center: [16.0, 79.5],
              zoom: 6
            });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
              maxZoom: 18
            }).addTo(modalMap);

            const customMarkerIcon = L.divIcon({
              className: 'custom-map-icon-wrap',
              html: '<div class="live-map-marker"><div class="live-map-pulse"></div><div class="live-map-dot"></div></div>',
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            });

            geoPoints.forEach(pt => {
              const m = L.marker([pt.lat, pt.lng], { icon: customMarkerIcon }).addTo(modalMap);
              m.bindPopup('<div style="font-family:Plus Jakarta Sans;padding:6px"><strong>' + pt.city + ' Region</strong><br><span style="color:#d97706;font-weight:700">' + (pt.views || 1) + ' total customer interactions</span></div>');
            });
          } else if (modalMap) {
            modalMap.invalidateSize();
          }
        }, 150);
      }

      function closeMapModal() {
        const modal = document.getElementById('mapModalBackdrop');
        if (modal) modal.style.display = 'none';
      }

      function openActivityModal() {
        const modal = document.getElementById('activityModalBackdrop');
        if (modal) modal.style.display = 'flex';
      }

      function closeActivityModal() {
        const modal = document.getElementById('activityModalBackdrop');
        if (modal) modal.style.display = 'none';
      }

      // 3. Business Filtering and "View All"
      let currentCategory = 'all';

      function viewAllBusinesses() {
        const searchInput = document.querySelector('.topbar-search-input');
        if (searchInput) searchInput.value = '';
        filterByCat('all');
        const bizSection = document.getElementById('businesses');
        if (bizSection) {
          bizSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      function filterByCat(cat, btnEl) {
        currentCategory = (cat || 'all').toLowerCase();
        if (btnEl) {
          document.querySelectorAll('.cat-pill-btn').forEach(b => b.classList.remove('active'));
          btnEl.classList.add('active');
        } else {
          document.querySelectorAll('.cat-pill-btn').forEach(b => {
            if (b.getAttribute('data-filter') === currentCategory) b.classList.add('active');
            else b.classList.remove('active');
          });
        }
        applyBusinessFilters();
      }

      function filterBusinesses(query) {
        applyBusinessFilters(query);
      }

      function applyBusinessFilters(overrideQuery) {
        const searchInput = document.querySelector('.topbar-search-input');
        const q = (overrideQuery !== undefined ? overrideQuery : (searchInput ? searchInput.value : '')).toLowerCase().trim();
        let visibleCount = 0;

        document.querySelectorAll('.biz-luxury-card').forEach(card => {
          const name = (card.getAttribute('data-name') || '').toLowerCase();
          const slug = (card.getAttribute('data-slug') || '').toLowerCase();
          const cat = (card.getAttribute('data-category') || '').toLowerCase();

          const matchesQuery = !q || name.includes(q) || slug.includes(q) || cat.includes(q);
          const matchesCat = currentCategory === 'all' || cat.includes(currentCategory);

          if (matchesQuery && matchesCat) {
            card.style.display = 'flex';
            visibleCount++;
          } else {
            card.style.display = 'none';
          }
        });

        const badge = document.getElementById('bizCountBadge');
        if (badge) badge.innerText = visibleCount;
      }

      // 4. Live Polling for Recent Activity & Telemetry
      async function pollLiveTelemetry() {
        try {
          const res = await fetch('/admin/api/telemetry/live');
          if (!res.ok) return;
          const data = await res.json();
          if (data && data.ok && data.telemetry) {
            const t = data.telemetry;
            if (t.recentActivities && t.recentActivities.length > 0) {
              const html = t.recentActivities.slice(0, 5).map(act => {
                const isClick = act.type === 'click';
                return '<div class="activity-row">' +
                  '<div class="activity-icon-wrap ' + (isClick ? 'activity-green' : 'activity-blue') + '">' +
                  '<i class="' + (isClick ? 'ti ti-external-link' : 'ti ti-eye') + '"></i>' +
                  '</div>' +
                  '<div class="activity-detail">' +
                  '<div class="activity-event">' + (isClick ? 'Google click' : 'Page view') + '</div>' +
                  '<div class="activity-biz">' + (act.biz || 'Portal') + '</div>' +
                  '</div>' +
                  '<span class="activity-time">' + (act.timeStr || 'Just now') + '</span>' +
                  '</div>';
              }).join('');
              const el = document.getElementById('recentActivityList');
              if (el) el.innerHTML = html;
            }
          }
        } catch (e) {
          // background poll ignore
        }
      }

      window.addEventListener('DOMContentLoaded', () => {
        initLiveMap();
        setInterval(pollLiveTelemetry, 6000);
      });
    </script>
  `, '', 'dashboard');
}

// ── CLIENT FORM ────────────────────────────────────────────────────
function clientFormPage(client, error) {
  const isEdit = !!client;
  const defaultTags = 'Great food|The food here is absolutely delicious — highly recommend!\nFriendly staff|Staff are warm, welcoming and very attentive.\nFast service|Service was quick and efficient without any wait.\nGreat value|Excellent value for money — generous portions at fair prices.\nClean space|The place is spotless and well maintained.\nWill visit again|Loved the overall experience — will definitely be back!';
  const tagsStr = client ? JSON.parse(client.tags||'[]').map(t=>`${t.l}|${t.t}`).join('\n') : defaultTags;
  const expInfo = client ? getExpiryInfo(client) : null;
  const currentTheme = client?.primary_theme || 'dark';
  const allowToggle = client ? (client.allow_theme_toggle !== 0 && client.allow_theme_toggle !== false) : true;

  return shell(isEdit ? 'Edit — '+client.business_name : 'New Business', `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div>
        <h1 class="welcome-headline">${isEdit ? 'Edit Business Portal' : 'New Business Portal'}</h1>
        <div class="welcome-sub">${isEdit ? 'Configuring portal for ' + esc(client.business_name) : 'Deploy a branded 5-star Google review collection page.'}</div>
      </div>
      <a href="/admin" class="btn btn-secondary"><i class="ti ti-arrow-left"></i> Back to Dashboard</a>
    </div>

    ${error ? `<div class="alert-err"><i class="ti ti-alert-circle"></i>${esc(error)}</div>` : ''}

    <form method="POST" action="/admin/clients/${isEdit?client.id+'/edit':'new'}">
      <div style="background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-card)">
        <div class="form-grid">

          <div class="form-2col">
            <div class="form-group">
              <label class="form-label">Business name *</label>
              <input class="form-input" type="text" name="business_name" value="${esc(client?.business_name||'')}" placeholder="e.g. Cool &amp; Spicy" required>
            </div>
            <div class="form-group">
              <label class="form-label">Category / Type</label>
              <input class="form-input" type="text" name="category" value="${esc(client?.category||'')}" placeholder="e.g. Cafe, Restaurant, Ice Cream">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Description / Specialty Dishes</label>
            <input class="form-input" type="text" name="description" value="${esc(client?.description||'')}" placeholder="e.g. Ice creams, Thick shakes, Pizzas, Crispy chicken">
          </div>

          <div class="form-group">
            <label class="form-label">Avatar Emoji or Logo Image URL</label>
            <input class="form-input" type="text" name="emoji" value="${esc(client?.emoji||'🏪')}" placeholder="🏪 or https://example.com/logo.png">
          </div>

          ${isEdit ? `
          <div class="form-group">
            <label class="form-label">Review URL Slug *</label>
            <div style="display:flex;align-items:center;background:var(--bg-card-subtle);border:1px solid var(--border-light);border-radius:var(--radius-md);overflow:hidden">
              <span style="padding:12px 16px;color:var(--t-muted);font-size:13px;font-family:'JetBrains Mono',monospace;border-right:1px solid var(--border-light)">/r/</span>
              <input class="form-input" style="border:none;background:transparent;margin:0" type="text" name="slug" value="${esc(client.slug)}" placeholder="slug" required>
            </div>
            <span class="form-hint">Unique URL slug used for standalone web links and QR table standees.</span>
          </div>` : ''}

          <!-- BRAND THEME & COLOR -->
          <div class="form-group" style="background:var(--bg-card-subtle);border:1px solid var(--border-light);border-radius:var(--radius-lg);padding:22px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
              <label class="form-label" style="margin:0;display:flex;align-items:center;gap:8px;color:var(--t-heading)">
                <i class="ti ti-palette" style="color:var(--amber-gold);font-size:18px"></i> Portal Visual Styling &amp; Colors
              </label>
              <span class="nav-badge-new" style="background:var(--sky);color:#fff">Admin Managed</span>
            </div>

            <div class="form-2col" style="margin-bottom:16px">
              <div class="form-group" style="margin-bottom:0">
                <label class="form-label" style="font-size:11px">Default Theme Mode</label>
                <select class="form-select" name="primary_theme" id="primaryThemeSelect">
                  <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>🌙 Dark Mode (Midnight Charcoal)</option>
                  <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>☀️ Light Mode (Daylight Minimal)</option>
                  <option value="system" ${currentTheme === 'system' ? 'selected' : ''}>📱 Auto / System (Matches Visitor Device)</option>
                </select>
              </div>

              <div class="form-group" style="margin-bottom:0">
                <label class="form-label" style="font-size:11px">Brand Accent Color</label>
                <div class="color-row">
                  <input class="color-pick" type="color" id="colorPick" value="${esc(client?.primary_color||'#f59e0b')}" oninput="document.getElementById('colorTxt').value=this.value">
                  <input class="form-input" type="text" id="colorTxt" name="primary_color" value="${esc(client?.primary_color||'#f59e0b')}" placeholder="#f59e0b" oninput="document.getElementById('colorPick').value=this.value" style="flex:1">
                </div>
              </div>
            </div>

            <!-- THEME PERMISSION TOGGLE -->
            <div style="border-top:1px solid var(--border-light);padding-top:16px;display:flex;align-items:center;justify-content:space-between">
              <div>
                <div style="font-size:13.5px;font-weight:700;color:var(--t-heading);margin-bottom:2px">Allow Customer Theme Switching</div>
                <div style="font-size:12px;color:var(--t-muted)">Allow visitors to manually toggle light/dark on their phone.</div>
              </div>
              <div class="toggle-wrap" style="flex-shrink:0">
                <div class="toggle ${allowToggle ? 'on' : ''}" id="togTheme" onclick="flipThemeToggle()"><div class="toggle-k"></div></div>
                <input type="hidden" name="allow_theme_toggle" id="themeToggleInp" value="${allowToggle ? 'on' : 'off'}">
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Google Place ID *</label>
            <input class="form-input" type="text" name="place_id" value="${esc(client?.place_id||'')}" placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4" required>
            <span class="form-hint">Find your Place ID from Google Maps Place ID Finder.</span>
          </div>

          <!-- QR TIMER / EXPIRY -->
          <div class="form-group" style="background:var(--bg-card-subtle);border:1px solid var(--border-light);border-radius:var(--radius-lg);padding:22px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <label class="form-label" style="margin:0;display:flex;align-items:center;gap:8px;color:var(--t-heading)">
                <i class="ti ti-hourglass-empty" style="color:var(--amber-gold);font-size:18px"></i> Subscription &amp; Validity Timer
              </label>
              ${expInfo ? `<span class="biz-status-pill">${expInfo.label}</span>` : '<span class="biz-status-pill">Unlimited</span>'}
            </div>

            <div class="form-2col">
              <div class="form-group">
                <label class="form-label" style="font-size:11px">Validity Duration</label>
                <select class="form-select" name="expiry_type" id="expiryType" onchange="onExpiryChange()">
                  <option value="unlimited" ${!client?.expires_at ? 'selected' : ''}>♾️ Unlimited (Continuous SaaS Access)</option>
                  <option value="7d">⏱️ 7 Days</option>
                  <option value="14d">⏱️ 14 Days</option>
                  <option value="30d">⏱️ 30 Days (1 Month)</option>
                  <option value="90d">⏱️ 90 Days (3 Months)</option>
                  <option value="180d">⏱️ 180 Days (6 Months)</option>
                  <option value="365d">⏱️ 1 Year</option>
                  <option value="custom" ${client?.expires_at ? 'selected' : ''}>📅 Specific Date...</option>
                </select>
              </div>
              <div class="form-group" id="customDateWrap" style="${client?.expires_at ? '' : 'display:none'}">
                <label class="form-label" style="font-size:11px">Exact Expiry Date</label>
                <input class="form-input" type="datetime-local" name="custom_expires_at" id="customExpiresAt" value="${client?.expires_at ? new Date(client.expires_at).toISOString().slice(0,16) : ''}">
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Review Prompts &amp; Tags <span style="font-weight:400;text-transform:none;color:var(--t-muted)">(One per line — Label | Review text)</span></label>
            <textarea class="form-textarea" name="tags_input" style="min-height:140px;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.7">${tagsStr}</textarea>
          </div>

          ${isEdit ? `
          <div class="form-group">
            <label class="form-label">Publishing Status</label>
            <div class="toggle-wrap">
              <div class="toggle ${client.active?'on':''}" id="tog" onclick="flipToggle()"><div class="toggle-k"></div></div>
              <input type="hidden" name="active" id="activeInp" value="${client.active?'on':'off'}">
              <span id="togLbl" style="font-size:13.5px;color:var(--t-body);font-weight:600">${client.active ? 'Active — portal is live online' : 'Paused — portal is temporarily hidden'}</span>
            </div>
          </div>` : ''}

          <div style="display:flex;gap:12px;padding-top:8px">
            <button class="btn btn-primary" type="submit" style="flex:1;height:48px;font-size:14px">
              ${isEdit ? 'Save Changes' : 'Create Business Portal'}
            </button>
            <a href="/admin" class="btn btn-secondary" style="height:48px;padding:0 24px">Cancel</a>
          </div>

        </div>
      </div>
    </form>

    <script>
      function flipToggle() {
        const t = document.getElementById('tog');
        const inp = document.getElementById('activeInp');
        const lbl = document.getElementById('togLbl');
        const isOn = t.classList.toggle('on');
        inp.value = isOn ? 'on' : 'off';
        lbl.textContent = isOn ? 'Active — portal is live online' : 'Paused — portal is temporarily hidden';
      }

      function flipThemeToggle() {
        const t = document.getElementById('togTheme');
        const inp = document.getElementById('themeToggleInp');
        const isOn = t.classList.toggle('on');
        inp.value = isOn ? 'on' : 'off';
      }

      function onExpiryChange() {
        const val = document.getElementById('expiryType').value;
        const wrap = document.getElementById('customDateWrap');
        wrap.style.display = (val === 'custom') ? 'block' : 'none';
      }
    </script>
  `, '', 'dashboard');
}

// ── QR CODE STUDIO ─────────────────────────────────────────────────
function qrPage(client, qrDataUrl, url, qrSvg) {
  const extraHead = `
    <style>
      .preview-stage {
        display: flex; align-items: center; justify-content: center;
        background: radial-gradient(circle at center, #fbf9f4 0%, #ede6d6 100%);
        border: 1px solid var(--border-light); border-radius: var(--radius-xl);
        padding: 40px 20px; min-height: 420px; position: relative;
      }
      body.dark-theme .preview-stage {
        background: radial-gradient(circle at center, #191c2b 0%, #0c0d12 100%);
      }
      .theme-chip {
        padding: 8px 14px; border-radius: 20px; border: 1px solid var(--border-light);
        background: var(--bg-card); color: var(--t-heading); font-size: 12px; font-weight: 600;
        cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px;
      }
      .theme-chip.active { border-color: var(--amber-gold); background: var(--amber-soft); color: var(--amber-dark); }
      .theme-dot { width: 10px; height: 10px; border-radius: 50%; }

      #standeeCard {
        width: 100%; max-width: 360px; border-radius: 28px; padding: 32px 24px;
        text-align: center; position: relative; z-index: 2;
        box-shadow: 0 20px 48px rgba(0,0,0,0.12);
        background: #ffffff; color: #111111;
        transition: all 0.25s var(--ease);
      }
      #standeeCard.theme-dark { background: #13151f; color: #fbfaf8; border: 1px solid #24293c; box-shadow: 0 20px 48px rgba(0,0,0,0.5); }
      #standeeCard.theme-amber { background: linear-gradient(135deg, #1c1917 0%, #0c0a09 100%); color: #fef3c7; border: 1px solid rgba(245, 158, 11, 0.4); }

      .qr-box-inner {
        background: #ffffff; padding: 16px; border-radius: 20px; margin: 20px auto;
        display: inline-block; position: relative; box-shadow: 0 4px 16px rgba(0,0,0,0.06);
      }
      .qr-img { width: 200px; height: 200px; display: block; }
    </style>
  `;

  return shell('QR Studio — ' + client.business_name, `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div>
        <h1 class="welcome-headline">QR Code &amp; Standee Studio</h1>
        <div class="welcome-sub">Generate printable QR standees and promotional materials for ${esc(client.business_name)}.</div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-secondary" onclick="downloadStandeePng()"><i class="ti ti-download"></i> Export HD PNG</button>
        <button class="btn btn-primary" onclick="window.print()"><i class="ti ti-printer"></i> Print Standee</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <!-- CONTROLS -->
      <div style="background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-card)">
        <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--t-muted);margin-bottom:14px">Standee Themes</h3>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px">
          <div class="theme-chip active" onclick="setTheme('light', this)"><span class="theme-dot" style="background:#ffffff;border:1px solid #ccc"></span> Pure Minimal Light</div>
          <div class="theme-chip" onclick="setTheme('dark', this)"><span class="theme-dot" style="background:#13151f"></span> Midnight Obsidian</div>
          <div class="theme-chip" onclick="setTheme('amber', this)"><span class="theme-dot" style="background:#f59e0b"></span> Warm Amber Luxe</div>
        </div>

        <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--t-muted);margin-bottom:14px">Display Text</h3>
        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Headline</label>
          <input class="form-input" id="inpTitle" value="Enjoyed your visit?" oninput="updateCardText()">
        </div>
        <div class="form-group" style="margin-bottom:20px">
          <label class="form-label">Sub-headline</label>
          <input class="form-input" id="inpSub" value="Scan to leave a 5-star Google review" oninput="updateCardText()">
        </div>

        <div class="form-group">
          <label class="form-label">Direct Portal Link</label>
          <div style="display:flex;gap:8px">
            <input class="form-input" value="${url}" readonly style="font-family:'JetBrains Mono',monospace;font-size:12px">
            <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${url}');showToast('Copied review link!')"><i class="ti ti-copy"></i></button>
          </div>
        </div>
      </div>

      <!-- PREVIEW STAGE -->
      <div class="preview-stage">
        <div id="standeeCard" class="theme-light">
          <div style="font-size:36px;margin-bottom:8px">${esc(client.emoji||'🏪')}</div>
          <h2 id="cardTitle" style="font-size:22px;font-weight:800;letter-spacing:-0.03em;margin-bottom:4px">${esc(client.business_name)}</h2>
          <p id="cardSub" style="font-size:13px;opacity:0.75;margin-bottom:14px">Scan to leave a 5-star review</p>

          <div class="qr-box-inner">
            <img src="${qrDataUrl}" alt="QR" class="qr-img">
          </div>

          <div style="font-size:11.5px;font-weight:600;opacity:0.6;font-family:'JetBrains Mono',monospace">reviewpro.in/r/${esc(client.slug)}</div>
        </div>
      </div>
    </div>

    <script>
      function setTheme(name, el) {
        document.querySelectorAll('.theme-chip').forEach(c=>c.classList.remove('active'));
        if(el) el.classList.add('active');
        document.getElementById('standeeCard').className = 'theme-' + name;
      }
      function updateCardText() {
        document.getElementById('cardTitle').textContent = document.getElementById('inpTitle').value || '${esc(client.business_name)}';
        document.getElementById('cardSub').textContent = document.getElementById('inpSub').value || '';
      }
      function downloadStandeePng() {
        const link = document.createElement('a');
        link.download = '${esc(client.slug)}-standee-qr.png';
        link.href = '${qrDataUrl}';
        link.click();
      }
    </script>
  `, extraHead, 'dashboard');
}

// ── ANALYTICS PAGE ─────────────────────────────────────────────────
function analyticsPage(client, stats) {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const vMap = Object.fromEntries(stats.dailyViews.map(r => [r.date, r.count]));
  const cMap = Object.fromEntries(stats.dailyClicks.map(r => [r.date, r.count]));
  const vVals = days.map(d => vMap[d] || 0);
  const cVals = days.map(d => cMap[d] || 0);

  return shell('Analytics — ' + client.business_name, `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div>
        <h1 class="welcome-headline">Analytics — ${esc(client.business_name)}</h1>
        <div class="welcome-sub">Real-time performance metrics recorded from Firestore.</div>
      </div>
      <a href="/admin" class="btn btn-secondary"><i class="ti ti-arrow-left"></i> Back to Dashboard</a>
    </div>

    <div class="metrics-quad-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:28px">
      <div class="metric-card-luxe">
        <div class="metric-label-txt">Total Impressions</div>
        <div class="metric-huge-val">${stats.totalViews}</div>
        <div class="metric-sub-note">review portal visits</div>
      </div>
      <div class="metric-card-luxe">
        <div class="metric-label-txt">Maps Review Clicks</div>
        <div class="metric-huge-val" style="color:var(--amber-dark)">${stats.totalClicks}</div>
        <div class="metric-sub-note">direct Google Maps actions</div>
      </div>
      <div class="metric-card-luxe">
        <div class="metric-label-txt">Conversion Rate</div>
        <div class="metric-huge-val" style="color:#16a34a">${stats.convRate}%</div>
        <div class="metric-sub-note">visitor to review ratio</div>
      </div>
    </div>

    <div style="background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius-xl);padding:28px;margin-bottom:20px;box-shadow:var(--shadow-card)">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--t-muted);margin-bottom:18px">Daily Impressions</div>
      <canvas id="viewChart" height="72"></canvas>
    </div>

    <div style="background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-card)">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--t-muted);margin-bottom:18px">Daily Google Review Clicks</div>
      <canvas id="clickChart" height="72"></canvas>
    </div>

    <script>
    const days = ${JSON.stringify(days)};
    const vVals = ${JSON.stringify(vVals)};
    const cVals = ${JSON.stringify(cVals)};

    const cfg = (labels, data, color) => ({
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: color + '33',
          borderColor: color,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#8c8273', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#8c8273', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' }, beginAtZero: true, precision: 0 }
        }
      }
    });

    new Chart(document.getElementById('viewChart'), cfg(days, vVals, '#f59e0b'));
    new Chart(document.getElementById('clickChart'), cfg(days, cVals, '#10b981'));
    </script>
  `, '', 'dashboard');
}

// ── AGENT TESTER PAGE ──────────────────────────────────────────────
function agentTestPage() {
  return shell('Agent Lab — Review Generator', `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div>
        <h1 class="welcome-headline">AI Review Generation Lab</h1>
        <div class="welcome-sub">Test the LLM multi-tier hierarchy (Gemini 3.5 Flash &rarr; Deterministic Local Synthesis).</div>
      </div>
      <a href="/admin" class="btn btn-secondary"><i class="ti ti-arrow-left"></i> Back to Dashboard</a>
    </div>

    <div style="background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius-xl);padding:32px;max-width:860px;margin:0 auto;box-shadow:var(--shadow-card)">
      <div class="form-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">
        <div class="form-group">
          <label class="form-label">Rating</label>
          <select id="at-rating" class="form-select">
            <option value="5" selected>5 ★ — Loved it</option>
            <option value="4">4 ★ — Great</option>
            <option value="3">3 ★ — Okay</option>
            <option value="2">2 ★ — Meh</option>
            <option value="1">1 ★ — Poor</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Business Name</label>
          <input id="at-name" class="form-input" placeholder="e.g. KFC or Cool &amp; Spicy" value="KFC">
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <input id="at-type" class="form-input" placeholder="e.g. Fried Chicken" value="Fried Chicken">
        </div>
      </div>

      <div class="form-group" style="margin-bottom:18px">
        <label class="form-label">Customer Experience / Keywords</label>
        <textarea id="at-text" class="form-textarea" placeholder="Describe customer order or experience (e.g. Super crispy hot chicken, peri peri fries were amazing)">Super crispy fried chicken, loved the peri peri fries</textarea>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <button id="at-go" class="btn btn-primary" onclick="atGenerate()"><i class="ti ti-sparkles"></i> Synthesize Review</button>
        <span id="at-status" style="font-size:13px;font-weight:600"></span>
      </div>

      <div class="form-group">
        <label class="form-label">Generated Review Output</label>
        <textarea id="at-out" class="form-textarea" style="min-height:110px;font-family:'JetBrains Mono',monospace;font-size:13px" readonly placeholder="Synthesized genuine review will appear here..."></textarea>
        <div id="at-meta" style="font-size:12px;color:var(--t-muted);margin-top:6px"></div>
      </div>
    </div>

    <script>
      async function atGenerate() {
        const st = document.getElementById('at-status');
        const out = document.getElementById('at-out');
        st.textContent = 'Generating via AI...';
        st.style.color = 'var(--amber)';
        out.value = '';
        try {
          const r = await fetch('/admin/agent-test/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rating: document.getElementById('at-rating').value,
              businessName: document.getElementById('at-name').value,
              businessType: document.getElementById('at-type').value,
              userText: document.getElementById('at-text').value
            })
          });
          const data = await r.json();
          if (data.ok) {
            out.value = data.review;
            st.textContent = 'Done (' + data.source + ')';
            st.style.color = 'var(--emerald)';
            document.getElementById('at-meta').textContent = 'Provider: ' + data.source;
          } else {
            st.textContent = 'Error: ' + (data.error || 'unknown');
            st.style.color = 'var(--rose)';
          }
        } catch (e) {
          st.textContent = 'Error: ' + e.message;
          st.style.color = 'var(--rose)';
        }
      }
    </script>
  `, '', 'agent', false);
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = router;
