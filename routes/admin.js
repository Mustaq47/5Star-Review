const express = require('express');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const db = require('../db/setup');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// ── AUTH ──────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.send(loginPage(req.query.error));
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.redirect('/admin/login?error=Invalid+email+or+password');
  }
  req.session.adminId = admin.id;
  res.redirect('/admin');
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ── DASHBOARD ─────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const clients = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
  const withStats = clients.map(c => {
    const views  = db.prepare('SELECT COUNT(*) as n FROM pageviews WHERE client_id=?').get(c.id).n;
    const clicks = db.prepare('SELECT COUNT(*) as n FROM review_clicks WHERE client_id=?').get(c.id).n;
    const today  = db.prepare("SELECT COUNT(*) as n FROM pageviews WHERE client_id=? AND date(viewed_at)=date('now')").get(c.id).n;
    return { ...c, views, clicks, today };
  });
  res.send(dashboardPage(withStats));
});

// ── CLIENT CRUD ───────────────────────────────────────────────────
router.get('/clients/new', requireAuth, (req, res) => {
  res.send(clientFormPage(null, req.query.error));
});

router.post('/clients/new', requireAuth, (req, res) => {
  const { business_name, category, description, emoji, place_id, primary_color, tags_input } = req.body;
  const slug = business_name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') + '-' + Date.now().toString(36);
  const tags = parseTags(tags_input);
  try {
    db.prepare('INSERT INTO clients (slug,business_name,category,description,emoji,place_id,primary_color,tags) VALUES (?,?,?,?,?,?,?,?)')
      .run(slug, business_name, category, description, emoji||'🏪', place_id, primary_color||'#7c4dff', JSON.stringify(tags));
    res.redirect('/admin');
  } catch(e) {
    res.redirect('/admin/clients/new?error=' + encodeURIComponent(e.message));
  }
});

router.get('/clients/:id/edit', requireAuth, (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!client) return res.redirect('/admin');
  res.send(clientFormPage(client, req.query.error));
});

router.post('/clients/:id/edit', requireAuth, (req, res) => {
  const { business_name, category, description, emoji, place_id, primary_color, tags_input, active } = req.body;
  const tags = parseTags(tags_input);
  db.prepare('UPDATE clients SET business_name=?,category=?,description=?,emoji=?,place_id=?,primary_color=?,tags=?,active=? WHERE id=?')
    .run(business_name, category, description, emoji||'🏪', place_id, primary_color||'#7c4dff', JSON.stringify(tags), active==='on'?1:0, req.params.id);
  res.redirect('/admin');
});

router.post('/clients/:id/delete', requireAuth, (req, res) => {
  db.prepare('DELETE FROM clients WHERE id=?').run(req.params.id);
  db.prepare('DELETE FROM pageviews WHERE client_id=?').run(req.params.id);
  db.prepare('DELETE FROM review_clicks WHERE client_id=?').run(req.params.id);
  res.redirect('/admin');
});

// ── QR CODE ───────────────────────────────────────────────────────
router.get('/clients/:id/qr', requireAuth, async (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!client) return res.status(404).send('Not found');
  const url = req.protocol + '://' + req.get('host') + '/r/' + client.slug;
  const qr = await QRCode.toDataURL(url, { width: 800, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#0a0a0f', light: '#ffffff' } });
  let qrSvg = '';
  try {
    qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'H' });
  } catch(e) {}
  res.send(qrPage(client, qr, url, qrSvg));
});

// ── ANALYTICS ─────────────────────────────────────────────────────
router.get('/clients/:id/analytics', requireAuth, (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!client) return res.redirect('/admin');
  const dailyViews  = db.prepare("SELECT date(viewed_at) as day, COUNT(*) as n FROM pageviews WHERE client_id=? GROUP BY day ORDER BY day DESC LIMIT 30").all(client.id);
  const dailyClicks = db.prepare("SELECT date(clicked_at) as day, COUNT(*) as n FROM review_clicks WHERE client_id=? GROUP BY day ORDER BY day DESC LIMIT 30").all(client.id);
  const totalViews  = db.prepare('SELECT COUNT(*) as n FROM pageviews WHERE client_id=?').get(client.id).n;
  const totalClicks = db.prepare('SELECT COUNT(*) as n FROM review_clicks WHERE client_id=?').get(client.id).n;
  const convRate = totalViews > 0 ? ((totalClicks/totalViews)*100).toFixed(1) : 0;
  res.send(analyticsPage(client, { dailyViews, dailyClicks, totalViews, totalClicks, convRate }));
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
// SHARED SHELL
// ══════════════════════════════════════════════════════════════════
function shell(title, body, extraHead='') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — ReviewPro</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">
${extraHead}
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0b0b14;--s1:#111119;--s2:#16161f;--s3:#1c1c28;
  --b1:#25253a;--b2:#32324a;--b3:#424260;
  --t1:#f0e8ff;--t2:#9090b8;--t3:#50507a;
  --accent:#a78bfa;--accent2:#7c4dff;
  --green:#34d399;--red:#f87171;--yellow:#fbbf24;
}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--t1);min-height:100vh}
a{color:inherit;text-decoration:none}
button{font-family:'DM Sans',sans-serif}

/* ── TOPBAR ── */
.topbar{
  height:56px;padding:0 24px;
  display:flex;align-items:center;justify-content:space-between;
  background:rgba(11,11,20,0.85);
  border-bottom:1px solid var(--b1);
  backdrop-filter:blur(12px);
  position:sticky;top:0;z-index:100;
}
.logo{font-size:17px;font-weight:600;color:var(--t1);letter-spacing:-0.3px;display:flex;align-items:center;gap:8px}
.logo-badge{background:rgba(124,77,255,0.25);border:1px solid rgba(124,77,255,0.35);color:var(--accent);font-size:10px;padding:2px 8px;border-radius:20px;font-weight:500;letter-spacing:0.04em}
.nav{display:flex;align-items:center;gap:4px}
.nav-a{display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:8px;font-size:13px;font-weight:500;color:var(--t3);transition:all .15s}
.nav-a:hover{background:var(--s2);color:var(--t1)}
.nav-a.danger:hover{background:rgba(248,113,113,0.1);color:var(--red)}
.nav-a i{font-size:15px}

/* ── PAGE LAYOUT ── */
.page{max-width:1080px;margin:0 auto;padding:28px 20px 48px}
.page-hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;gap:16px}
.page-title{font-size:20px;font-weight:600;letter-spacing:-0.3px;color:var(--t1)}
.page-sub{font-size:12.5px;color:var(--t3);margin-top:3px}

/* ── CARDS ── */
.card{background:var(--s1);border:1px solid var(--b1);border-radius:14px}
.card-p{padding:22px}

/* ── STAT GRID ── */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:22px}
.stat{background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:18px 20px}
.stat-lbl{font-size:10.5px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--t3);margin-bottom:10px}
.stat-val{font-size:30px;font-weight:600;color:var(--t1);letter-spacing:-0.5px;font-family:'DM Mono',monospace;line-height:1}
.stat-sub{font-size:11.5px;color:var(--t3);margin-top:6px}
.stat-accent{color:var(--accent)}

/* ── TABLE ── */
.tbl{width:100%;border-collapse:collapse}
.tbl th{font-size:10.5px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--t3);padding:11px 16px;text-align:left;border-bottom:1px solid var(--b1)}
.tbl td{padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.03);font-size:13.5px;color:var(--t2);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:rgba(255,255,255,0.015)}

/* ── BIZ CELL ── */
.biz-cell{display:flex;align-items:center;gap:12px}
.biz-icon{width:40px;height:40px;border-radius:11px;background:var(--s3);border:1px solid var(--b1);display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0}
.biz-name{font-weight:600;color:var(--t1);font-size:14px;margin-bottom:2px}
.biz-slug{font-size:11px;color:var(--t3);font-family:'DM Mono',monospace}

/* ── BADGES ── */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500}
.badge-green{background:rgba(52,211,153,0.1);color:var(--green);border:1px solid rgba(52,211,153,0.2)}
.badge-red{background:rgba(248,113,113,0.1);color:var(--red);border:1px solid rgba(248,113,113,0.2)}
.badge-purple{background:rgba(167,139,250,0.1);color:var(--accent);border:1px solid rgba(167,139,250,0.2)}
.badge-dot{width:5px;height:5px;border-radius:50%;background:currentColor}

/* ── BUTTONS ── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:8px 16px;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid;transition:all .15s;font-family:'DM Sans',sans-serif;white-space:nowrap}
.btn i{font-size:15px}
.btn-primary{background:var(--accent2);border-color:rgba(124,77,255,0.4);color:#fff;box-shadow:0 2px 12px rgba(124,77,255,0.25)}
.btn-primary:hover{background:#9158ff;transform:translateY(-1px)}
.btn-primary:active{transform:scale(0.98)}
.btn-ghost{background:var(--s2);border-color:var(--b1);color:var(--t2)}
.btn-ghost:hover{background:var(--s3);color:var(--t1);border-color:var(--b2)}
.btn-danger{background:rgba(248,113,113,0.08);border-color:rgba(248,113,113,0.2);color:var(--red)}
.btn-danger:hover{background:rgba(248,113,113,0.15)}
.btn-sm{padding:5px 11px;font-size:12px;border-radius:7px}
.btn-sm i{font-size:14px}
.btn-icon{width:33px;height:33px;padding:0}
.action-row{display:flex;gap:5px;align-items:center}

/* ── FORMS ── */
.form-grid{display:grid;gap:20px}
.form-2col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.form-group{display:flex;flex-direction:column;gap:7px}
.form-label{font-size:11.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--t3)}
.form-hint{font-size:11px;color:var(--t3);line-height:1.55}
.form-input,.form-textarea,.form-select{
  background:var(--s2);border:1px solid var(--b1);border-radius:10px;
  padding:11px 14px;font-family:'DM Sans',sans-serif;font-size:14px;
  color:var(--t1);outline:none;transition:border-color .2s;width:100%;
}
.form-input:focus,.form-textarea:focus,.form-select:focus{border-color:var(--b3);background:var(--s3)}
.form-input::placeholder,.form-textarea::placeholder{color:var(--t3)}
.form-textarea{resize:vertical;min-height:90px;line-height:1.6}
.form-select option{background:var(--s2)}
.color-row{display:flex;align-items:center;gap:10px}
.color-pick{width:42px;height:42px;border-radius:9px;border:1px solid var(--b1);background:transparent;cursor:pointer;padding:2px}

/* ── TOGGLE ── */
.toggle-wrap{display:flex;align-items:center;gap:10px}
.toggle{width:44px;height:25px;border-radius:13px;background:var(--s3);border:1px solid var(--b1);position:relative;cursor:pointer;transition:all .2s;flex-shrink:0}
.toggle.on{background:rgba(124,77,255,0.6);border-color:rgba(124,77,255,0.4)}
.toggle-k{position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,0.4)}
.toggle.on .toggle-k{left:22px}

/* ── MISC ── */
.alert-err{background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);border-radius:10px;padding:12px 16px;font-size:13px;color:var(--red);margin-bottom:18px;display:flex;align-items:center;gap:8px}
.divider{height:1px;background:var(--b1);margin:20px 0}
.empty{text-align:center;padding:56px 24px;color:var(--t3)}
.empty-ico{font-size:36px;margin-bottom:12px;opacity:0.4}
.empty-title{font-size:15px;font-weight:500;color:var(--t2);margin-bottom:5px}
.mono{font-family:'DM Mono',monospace}
.text-sm{font-size:12px}
.text-xs{font-size:11px}
.mt4{margin-top:4px}
code{background:var(--s3);padding:1px 7px;border-radius:5px;font-family:'DM Mono',monospace;font-size:12px;color:var(--accent)}
</style>
</head>
<body>
<nav class="topbar">
  <div class="logo">
    ReviewPro
    <span class="logo-badge">ADMIN</span>
  </div>
  <div class="nav">
    <a href="/admin" class="nav-a"><i class="ti ti-layout-dashboard"></i>Dashboard</a>
    <a href="/admin/clients/new" class="nav-a"><i class="ti ti-plus"></i>Add Client</a>
    <a href="/admin/logout" class="nav-a danger"><i class="ti ti-logout"></i>Logout</a>
  </div>
</nav>
<div class="page">${body}</div>
<script src="/agentation.js"></script>
</body></html>`;
}

// ── LOGIN PAGE ─────────────────────────────────────────────────────
function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login — ReviewPro</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:linear-gradient(135deg,#0a0a18 0%,#12071a 50%,#071218 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.orb{position:fixed;border-radius:50%;pointer-events:none}
.o1{width:500px;height:500px;top:-120px;right:-100px;background:radial-gradient(circle,rgba(103,58,183,0.3) 0%,transparent 70%)}
.o2{width:360px;height:360px;bottom:-80px;left:-80px;background:radial-gradient(circle,rgba(183,110,0,0.25) 0%,transparent 70%)}
.card{
  background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
  border-radius:22px;padding:36px 32px;width:100%;max-width:380px;
  backdrop-filter:blur(20px);position:relative;z-index:2;
  box-shadow:0 16px 64px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.07);
}
.brand{font-size:24px;font-weight:600;color:#f0e8ff;margin-bottom:4px;letter-spacing:-0.4px}
.brand-sub{font-size:13px;color:rgba(180,160,220,0.5);margin-bottom:30px}
label{display:block;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(180,160,220,0.55);margin-bottom:7px}
input{
  width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
  border-radius:11px;padding:12px 15px;color:#e8e0f8;font-family:'DM Sans',sans-serif;
  font-size:14px;outline:none;margin-bottom:16px;transition:border-color .2s;box-sizing:border-box;
}
input:focus{border-color:rgba(167,139,250,0.5);background:rgba(255,255,255,0.07)}
input::placeholder{color:rgba(180,160,220,0.3)}
.btn{width:100%;height:50px;background:rgba(124,77,255,0.9);border:1px solid rgba(150,100,255,0.35);border-radius:12px;color:#fff;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:600;cursor:pointer;margin-top:4px;transition:all .15s}
.btn:hover{background:#9158ff;transform:translateY(-1px)}
.err{background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.25);border-radius:10px;padding:11px 14px;color:#f87171;font-size:13px;margin-bottom:18px;display:flex;align-items:center;gap:7px}
</style>
</head>
<body>
<div class="orb o1"></div><div class="orb o2"></div>
<form class="card" method="POST" action="/admin/login">
  <div class="brand">ReviewPro</div>
  <div class="brand-sub">Admin dashboard — sign in to continue</div>
  ${error ? `<div class="err">⚠️ ${error}</div>` : ''}
  <label>Email address</label>
  <input type="email" name="email" placeholder="admin@reviewpro.in" required autocomplete="email">
  <label>Password</label>
  <input type="password" name="password" placeholder="••••••••" required autocomplete="current-password">
  <button class="btn" type="submit">Sign in →</button>
</form>
</body></html>`;
}

// ── DASHBOARD PAGE ─────────────────────────────────────────────────
function dashboardPage(clients) {
  const totalViews  = clients.reduce((s,c)=>s+c.views,0);
  const totalClicks = clients.reduce((s,c)=>s+c.clicks,0);
  const todayViews  = clients.reduce((s,c)=>s+c.today,0);
  const active      = clients.filter(c=>c.active).length;
  const conv = totalViews > 0 ? ((totalClicks/totalViews)*100).toFixed(1) : '0.0';

  const rows = clients.length === 0
    ? `<tr><td colspan="7"><div class="empty"><div class="empty-ico">🏪</div><div class="empty-title">No clients yet</div><div class="text-sm">Add your first client to get started</div></div></td></tr>`
    : clients.map(c => {
        const cr = c.views > 0 ? ((c.clicks/c.views)*100).toFixed(0) : 0;
        return `<tr>
          <td>
            <div class="biz-cell">
              <div class="biz-icon">${c.emoji}</div>
              <div>
                <div class="biz-name">${esc(c.business_name)}</div>
                <div class="biz-slug">/r/${c.slug}</div>
              </div>
            </div>
          </td>
          <td><span class="badge badge-purple">${esc(c.category)}</span></td>
          <td>
            <div class="mono" style="font-size:15px;color:#f0e8ff">${c.views}</div>
            <div class="text-xs mt4" style="color:var(--t3)">${c.today} today</div>
          </td>
          <td>
            <div class="mono" style="font-size:15px;color:#f0e8ff">${c.clicks}</div>
            <div class="text-xs mt4" style="color:var(--t3)">${cr}% conv.</div>
          </td>
          <td><span class="badge ${c.active ? 'badge-green':'badge-red'}"><span class="badge-dot"></span>${c.active?'Active':'Paused'}</span></td>
          <td style="white-space:nowrap"><span class="text-xs mono" style="color:var(--t3)">${c.created_at ? c.created_at.split(' ')[0] : '—'}</span></td>
          <td>
            <div class="action-row">
              <a href="/r/${c.slug}" target="_blank" class="btn btn-ghost btn-sm btn-icon" title="Preview"><i class="ti ti-external-link"></i></a>
              <a href="/admin/clients/${c.id}/qr" class="btn btn-ghost btn-sm btn-icon" title="QR Code"><i class="ti ti-qrcode"></i></a>
              <a href="/admin/clients/${c.id}/analytics" class="btn btn-ghost btn-sm btn-icon" title="Analytics"><i class="ti ti-chart-bar"></i></a>
              <a href="/admin/clients/${c.id}/edit" class="btn btn-ghost btn-sm btn-icon" title="Edit"><i class="ti ti-edit"></i></a>
              <form method="POST" action="/admin/clients/${c.id}/delete" style="display:inline" onsubmit="return confirm('Delete ${esc(c.business_name)}? This cannot be undone.')">
                <button class="btn btn-danger btn-sm btn-icon" title="Delete"><i class="ti ti-trash"></i></button>
              </form>
            </div>
          </td>
        </tr>`;
      }).join('');

  return shell('Dashboard', `
    <div class="page-hdr">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-sub">${clients.length} client${clients.length!==1?'s':''} · ${active} active</div>
      </div>
      <a href="/admin/clients/new" class="btn btn-primary"><i class="ti ti-plus"></i> Add client</a>
    </div>

    <div class="stat-grid">
      <div class="stat">
        <div class="stat-lbl">Active clients</div>
        <div class="stat-val stat-accent">${active}</div>
        <div class="stat-sub">of ${clients.length} total</div>
      </div>
      <div class="stat">
        <div class="stat-lbl">Total page views</div>
        <div class="stat-val">${totalViews}</div>
        <div class="stat-sub">${todayViews} today</div>
      </div>
      <div class="stat">
        <div class="stat-lbl">Maps clicks</div>
        <div class="stat-val">${totalClicks}</div>
        <div class="stat-sub">opened review page</div>
      </div>
      <div class="stat">
        <div class="stat-lbl">Avg conversion</div>
        <div class="stat-val">${conv}%</div>
        <div class="stat-sub">views → clicks</div>
      </div>
    </div>

    <div class="card" style="overflow:hidden">
      <table class="tbl">
        <thead><tr>
          <th>Business</th>
          <th>Category</th>
          <th>Views</th>
          <th>Clicks</th>
          <th>Status</th>
          <th>Added</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);
}

// ── CLIENT FORM ────────────────────────────────────────────────────
function clientFormPage(client, error) {
  const isEdit = !!client;
  const defaultTags = 'Great food|The food here is absolutely delicious — highly recommend!\nFriendly staff|Staff are warm, welcoming and very attentive.\nFast service|Service was quick and efficient without any wait.\nGreat value|Excellent value for money — generous portions at fair prices.\nClean space|The place is spotless and well maintained.\nWill visit again|Loved the overall experience — will definitely be back!';
  const tagsStr = client ? JSON.parse(client.tags||'[]').map(t=>`${t.l}|${t.t}`).join('\n') : defaultTags;

  return shell(isEdit ? 'Edit — '+client.business_name : 'New Client', `
    <div class="page-hdr">
      <div>
        <div class="page-title">${isEdit ? 'Edit client' : 'Add new client'}</div>
        <div class="page-sub">${isEdit ? 'Update details for '+esc(client.business_name) : 'Set up a branded review page for your client'}</div>
      </div>
      <a href="/admin" class="btn btn-ghost"><i class="ti ti-arrow-left"></i> Back</a>
    </div>

    ${error ? `<div class="alert-err"><i class="ti ti-alert-circle"></i>${esc(error)}</div>` : ''}

    <form method="POST" action="/admin/clients/${isEdit?client.id+'/edit':'new'}">
      <div class="card card-p">
        <div class="form-grid">

          <div class="form-2col">
            <div class="form-group">
              <label class="form-label">Business name *</label>
              <input class="form-input" type="text" name="business_name" value="${esc(client?.business_name||'')}" placeholder="e.g. Cool &amp; Spicy" required>
            </div>
            <div class="form-group">
              <label class="form-label">Category / Tagline</label>
              <input class="form-input" type="text" name="category" value="${esc(client?.category||'')}" placeholder="e.g. Ice Creams · Shakes · Pizza">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Short description (2–3 lines)</label>
            <textarea class="form-textarea" name="description" placeholder="Tell customers what makes this place special…" required>${esc(client?.description||'')}</textarea>
          </div>

          <div class="form-2col">
            <div class="form-group">
              <label class="form-label">Emoji icon</label>
              <input class="form-input" type="text" name="emoji" value="${esc(client?.emoji||'🏪')}" placeholder="🏪" maxlength="6">
              <span class="form-hint">Single emoji that represents the business</span>
            </div>
            <div class="form-group">
              <label class="form-label">Brand colour</label>
              <div class="color-row">
                <input class="color-pick" type="color" id="colorPick" value="${esc(client?.primary_color||'#7c4dff')}" oninput="document.getElementById('colorTxt').value=this.value">
                <input class="form-input" type="text" id="colorTxt" name="primary_color" value="${esc(client?.primary_color||'#7c4dff')}" placeholder="#7c4dff" oninput="document.getElementById('colorPick').value=this.value" style="flex:1">
              </div>
              <span class="form-hint">Used for buttons and accents on the review page</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Google Place ID *</label>
            <input class="form-input" type="text" name="place_id" value="${esc(client?.place_id||'')}" placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4" required>
            <span class="form-hint">Find at: <code>developers.google.com/maps/documentation/javascript/examples/places-placeid-finder</code></span>
          </div>

          <div class="form-group">
            <label class="form-label">Quick tags <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--t3)">(one per line — Label | Review text)</span></label>
            <textarea class="form-textarea" name="tags_input" style="min-height:160px;font-family:'DM Mono',monospace;font-size:12px;line-height:1.7" placeholder="Biryani must-try|The biryani here is exceptional — perfectly spiced.">${tagsStr}</textarea>
            <span class="form-hint">Format: <code>Button label | Full review text inserted when tapped</code></span>
          </div>

          ${isEdit ? `
          <div class="form-group">
            <label class="form-label">Page status</label>
            <div class="toggle-wrap">
              <div class="toggle ${client.active?'on':''}" id="tog" onclick="flipToggle()"><div class="toggle-k"></div></div>
              <input type="hidden" name="active" id="activeInp" value="${client.active?'on':'off'}">
              <span id="togLbl" style="font-size:13.5px;color:var(--t2)">${client.active ? 'Active — page is live and accessible' : 'Paused — page is hidden from visitors'}</span>
            </div>
          </div>` : ''}

          <div style="display:flex;gap:10px;padding-top:4px">
            <button class="btn btn-primary" type="submit" style="flex:1;height:48px;font-size:14px">
              <i class="ti ti-check"></i> ${isEdit ? 'Save changes' : 'Create review page'}
            </button>
            <a href="/admin" class="btn btn-ghost" style="height:48px;font-size:14px">Cancel</a>
          </div>

        </div>
      </div>
    </form>

    <script>
    function flipToggle() {
      const tog = document.getElementById('tog');
      const on = tog.classList.toggle('on');
      document.getElementById('activeInp').value = on ? 'on' : 'off';
      document.getElementById('togLbl').textContent = on ? 'Active — page is live and accessible' : 'Paused — page is hidden from visitors';
    }
    </script>
  `);
}

// ── QR STUDIO & STANDEE GENERATOR (7 THEMES + APPLE DESIGN) ─────────
function qrPage(client, qrDataUrl, url, qrSvg='') {
  const isImageLogo = client.emoji && (client.emoji.startsWith('/') || client.emoji.startsWith('http') || client.emoji.match(/\.(png|jpg|jpeg|svg|webp)$/i));
  const logoHeaderHtml = isImageLogo
    ? `<img src="${esc(client.emoji)}" alt="${esc(client.business_name)}" style="width:76px;height:76px;object-fit:contain;border-radius:18px;display:block">`
    : `<span style="font-size:44px;line-height:1;display:block">${esc(client.emoji || '🏪')}</span>`;

  const extraHead = `
    <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
    <style>
      /* ── THEME PALETTES & TOKENS ── */
      :root {
        --ease-spring: cubic-bezier(0.4, 0, 0.2, 1);
      }

      .btn:active, .theme-chip:active, .icon-opt:active {
        transform: scale(0.97) !important;
        transition: transform 0.1s var(--ease-spring);
      }

      .theme-chip {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 9px 14px; border-radius: 12px; font-size: 12.5px; font-weight: 500;
        background: var(--s2); border: 1px solid var(--b1); color: var(--t2);
        cursor: pointer; transition: all 0.2s var(--ease-spring); user-select: none;
      }
      .theme-chip:hover { background: var(--s3); color: var(--t1); border-color: var(--b2); }
      .theme-chip.active {
        background: rgba(124,77,255,0.18); border-color: var(--accent); color: #fff;
        box-shadow: 0 0 16px rgba(124,77,255,0.25);
      }
      .theme-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

      /* ── CONTROLS PANEL ── */
      .ctrl-card { background: var(--s1); border: 1px solid var(--b1); border-radius: 18px; padding: 22px; }
      .ctrl-sec-title {
        font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--t3); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;
      }

      /* ── STANDEE PREVIEW CONTAINER (NO BACKGROUND LIGHT) ── */
      .preview-stage {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: #090910;
        border: 1px solid var(--b1); border-radius: 28px; padding: 36px 16px;
        min-height: 560px; position: relative; overflow: hidden;
      }

      /* ── STANDEE CARD CORE ── */
      #standeeCard {
        width: 100%; max-width: 360px; border-radius: 28px; padding: 32px 22px 24px;
        text-align: center; position: relative; z-index: 2;
        box-shadow: 0 20px 48px rgba(0,0,0,0.4);
        transition: all 0.25s var(--ease-spring);
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      }

      /* LOGO EMBLEM DISK */
      .logo-disk {
        display: inline-flex; align-items: center; justify-content: center;
        width: 82px; height: 82px; border-radius: 22px; margin: 0 auto 14px;
        padding: 4px; position: relative;
        transition: all 0.2s var(--ease-spring);
      }

      /* THEME: Apple Minimalist Glass */
      #standeeCard.theme-apple {
        background: #ffffff;
        border: 1px solid rgba(228, 228, 231, 0.9);
        color: #09090b;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.08);
      }
      #standeeCard.theme-apple .logo-disk { background: #ffffff; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid rgba(0,0,0,0.06); }
      #standeeCard.theme-apple .card-title { color: #000; letter-spacing: -0.025em; }
      #standeeCard.theme-apple .card-sub { color: #52525b; }
      #standeeCard.theme-apple .qr-box { background: #ffffff; box-shadow: 0 6px 20px rgba(0,0,0,0.06); border: 1px solid rgba(0,0,0,0.06); }
      #standeeCard.theme-apple .scan-hint { background: #f4f4f5; color: #3f3f46; }
      #standeeCard.theme-apple .card-footer { color: #71717a; }

      /* THEME: M3 Dark */
      #standeeCard.theme-m3dark {
        background: #18181c; border: 1px solid #2d2d34; color: #f8fafc;
        box-shadow: 0 20px 48px rgba(0,0,0,0.6);
      }
      #standeeCard.theme-m3dark .logo-disk { background: #23232a; border: 1px solid #33333d; }
      #standeeCard.theme-m3dark .card-title { color: #f8fafc; letter-spacing: -0.02em; }
      #standeeCard.theme-m3dark .card-sub { color: #94a3b8; }
      #standeeCard.theme-m3dark .qr-box { background: #121215; border: 1px solid #2d2d34; }
      #standeeCard.theme-m3dark .scan-hint { background: #23232a; color: #94a3b8; }
      #standeeCard.theme-m3dark .card-footer { color: #64748b; }

      /* THEME: M3 Light */
      #standeeCard.theme-m3light {
        background: #ffffff; border: 1px solid #e2e8f0; color: #0f172a;
        box-shadow: 0 16px 40px rgba(0,0,0,0.08);
      }
      #standeeCard.theme-m3light .logo-disk { background: #f8fafc; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
      #standeeCard.theme-m3light .card-title { color: #0f172a; }
      #standeeCard.theme-m3light .card-sub { color: #64748b; }
      #standeeCard.theme-m3light .qr-box { background: #f8fafc; border: 1px solid #e2e8f0; }
      #standeeCard.theme-m3light .scan-hint { background: #f1f5f9; color: #475569; }
      #standeeCard.theme-m3light .card-footer { color: #94a3b8; }

      /* THEME: Glassmorphism Ocean */
      #standeeCard.theme-glass {
        background: linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%);
        border: 1px solid rgba(255, 255, 255, 0.35); color: #ffffff;
        box-shadow: 0 20px 48px rgba(2, 132, 199, 0.35);
      }
      #standeeCard.theme-glass .logo-disk { background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.35); }
      #standeeCard.theme-glass .card-title { color: #ffffff; }
      #standeeCard.theme-glass .card-sub { color: #e0f2fe; }
      #standeeCard.theme-glass .qr-box { background: #ffffff; box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
      #standeeCard.theme-glass .scan-hint { background: rgba(255,255,255,0.22); color: #ffffff; border: 1px solid rgba(255,255,255,0.3); }
      #standeeCard.theme-glass .card-footer { color: #e0f2fe; }

      /* THEME: Neumorphic Soft */
      #standeeCard.theme-neumorphic {
        background: #e0e5ec; border: none; color: #334155;
        box-shadow: 16px 16px 36px #b8b9be, -16px -16px 36px #ffffff;
      }
      #standeeCard.theme-neumorphic .logo-disk {
        background: #e0e5ec;
        box-shadow: 4px 4px 8px #b8b9be, -4px -4px 8px #ffffff;
      }
      #standeeCard.theme-neumorphic .card-title { color: #1e293b; }
      #standeeCard.theme-neumorphic .card-sub { color: #64748b; }
      #standeeCard.theme-neumorphic .qr-box {
        background: #e0e5ec;
        box-shadow: inset 4px 4px 8px #b8b9be, inset -4px -4px 8px #ffffff;
        padding: 12px; border-radius: 20px;
      }
      #standeeCard.theme-neumorphic .scan-hint {
        background: #e0e5ec; color: #475569;
        box-shadow: 3px 3px 6px #b8b9be, -3px -3px 6px #ffffff;
      }
      #standeeCard.theme-neumorphic .card-footer { color: #64748b; }

      /* THEME: Minimalist Pure */
      #standeeCard.theme-minimalist {
        background: #ffffff; border: 2px solid #000; color: #000;
        border-radius: 20px; box-shadow: 6px 6px 0px #000;
      }
      #standeeCard.theme-minimalist .logo-disk { background: #fff; border: 2px solid #000; }
      #standeeCard.theme-minimalist .card-title { color: #000; font-weight: 800; }
      #standeeCard.theme-minimalist .card-sub { color: #3f3f46; font-weight: 500; }
      #standeeCard.theme-minimalist .qr-box { background: #fff; border: 2px solid #000; border-radius: 14px; }
      #standeeCard.theme-minimalist .scan-hint { background: #f4f4f5; color: #000; border: 1px solid #000; }
      #standeeCard.theme-minimalist .card-footer { color: #000; font-weight: 700; }

      /* THEME: Gradient Sunset & Aurora */
      #standeeCard.theme-gradient {
        background: linear-gradient(145deg, #4338ca 0%, #7c3aed 50%, #db2777 100%);
        border: 1px solid rgba(255,255,255,0.3); color: #ffffff;
        box-shadow: 0 20px 48px rgba(124, 58, 237, 0.4);
      }
      #standeeCard.theme-gradient .logo-disk { background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.35); }
      #standeeCard.theme-gradient .card-title { color: #ffffff; }
      #standeeCard.theme-gradient .card-sub { color: #fdf2f8; opacity: 0.95; }
      #standeeCard.theme-gradient .qr-box { background: #ffffff; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
      #standeeCard.theme-gradient .scan-hint { background: rgba(255,255,255,0.2); color: #ffffff; border: 1px solid rgba(255,255,255,0.3); }
      #standeeCard.theme-gradient .card-footer { color: #fdf2f8; opacity: 0.9; }

      /* QR Canvas wrapper */
      .qr-box {
        display: inline-block; padding: 12px; border-radius: 20px;
        margin: 14px 0 12px; position: relative; transition: all 0.2s var(--ease-spring);
      }
      .qr-canvas-el { display: block; border-radius: 12px; max-width: 175px; height: auto; margin: 0 auto; }

      .card-title { font-size: 21px; font-weight: 700; line-height: 1.2; margin-bottom: 4px; }
      .card-sub {
        font-size: 13px; line-height: 1.4; font-weight: 500;
        white-space: nowrap; width: 100%; margin: 0 auto 8px;
      }
      .stars-row {
        color: #f59e0b; font-size: 17px; margin: 4px 0 6px; letter-spacing: 3px;
        filter: drop-shadow(0 2px 6px rgba(245,158,11,0.4));
      }
      .scan-hint {
        display: inline-flex; align-items: center; gap: 5px;
        font-size: 11.5px; font-weight: 600; padding: 5px 12px; border-radius: 14px;
        margin: 0 auto 12px;
      }
      .card-footer {
        margin-top: 4px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.02em;
        display: flex; align-items: center; justify-content: center; gap: 6px;
      }

      /* Icon Options */
      .icon-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
      .icon-opt {
        padding: 8px 4px; border-radius: 10px; background: var(--s2); border: 1px solid var(--b1);
        color: var(--t1); cursor: pointer; text-align: center; font-size: 16px; transition: all 0.15s;
        display: flex; align-items: center; justify-content: center; min-height: 38px;
      }
      .icon-opt.active { background: rgba(124,77,255,0.2); border-color: var(--accent); }

      /* Print guidelines */
      @media print {
        body { background: #fff !important; color: #000 !important; }
        .topbar, .page-hdr, .ctrl-col, .no-print { display: none !important; }
        .page { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
        .preview-stage {
          background: #fff !important; border: none !important; padding: 0 !important;
          min-height: auto !important; position: static !important;
        }
        #standeeCard {
          max-width: 380px !important; margin: 30px auto !important;
          box-shadow: none !important; border: 1px solid #ddd !important;
          page-break-inside: avoid;
        }
      }
    </style>
  `;

  return shell('QR Studio & Standees — ' + client.business_name, `
    <div class="page-hdr">
      <div>
        <div class="page-title">QR Studio &amp; Table Standee Generator</div>
        <div class="page-sub">${esc(client.business_name)} · 7 Design Themes with Live Apple-Grade Preview</div>
      </div>
      <div style="display:flex;gap:8px">
        <a href="/r/${client.slug}" target="_blank" class="btn btn-ghost"><i class="ti ti-external-link"></i> Live Review Page</a>
        <a href="/admin" class="btn btn-ghost"><i class="ti ti-arrow-left"></i> Dashboard</a>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1.05fr;gap:24px;align-items:start">

      <!-- ── LEFT: STUDIO CONTROLS ── -->
      <div class="ctrl-col" style="display:flex;flex-direction:column;gap:18px">

        <!-- 1. THEME SELECTOR (7 CORE THEMES) -->
        <div class="ctrl-card">
          <div class="ctrl-sec-title"><i class="ti ti-palette"></i> Design Theme (7 Paradigms)</div>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
            <div class="theme-chip active" onclick="setTheme('apple', this)">
              <span class="theme-dot" style="background:#000;border:1px solid #fff"></span>
              <span>🍏 Apple Clean</span>
            </div>
            <div class="theme-chip" onclick="setTheme('m3dark', this)">
              <span class="theme-dot" style="background:#4ade80"></span>
              <span>🌙 M3 Dark</span>
            </div>
            <div class="theme-chip" onclick="setTheme('m3light', this)">
              <span class="theme-dot" style="background:#16a34a"></span>
              <span>☀️ M3 Light</span>
            </div>
            <div class="theme-chip" onclick="setTheme('glass', this)">
              <span class="theme-dot" style="background:#0ea5e9"></span>
              <span>💎 Glass Ocean</span>
            </div>
            <div class="theme-chip" onclick="setTheme('neumorphic', this)">
              <span class="theme-dot" style="background:#94a3b8"></span>
              <span>🟢 Neumorphic</span>
            </div>
            <div class="theme-chip" onclick="setTheme('minimalist', this)">
              <span class="theme-dot" style="background:#111827"></span>
              <span>📱 Minimalist</span>
            </div>
            <div class="theme-chip" style="grid-column:span 2" onclick="setTheme('gradient', this)">
              <span class="theme-dot" style="background:linear-gradient(45deg,#4f46e5,#db2777)"></span>
              <span>🌈 Sunset &amp; Aurora Gradient</span>
            </div>
          </div>
        </div>

        <!-- 2. CARD CONTENT CUSTOMIZER -->
        <div class="ctrl-card">
          <div class="ctrl-sec-title"><i class="ti ti-typography"></i> Card Content &amp; Callout</div>
          <div class="form-grid" style="gap:12px">
            <div class="form-group">
              <label class="form-label">Headline CTA</label>
              <input type="text" id="inpTitle" class="form-input" value="Enjoyed your visit?" oninput="updateCardText()">
            </div>
            <div class="form-group">
              <label class="form-label">Subtitle Prompt</label>
              <input type="text" id="inpSub" class="form-input" value="Scan to leave a Google review · Takes 30s ⭐" oninput="updateCardText()">
            </div>
            <div class="form-group">
              <label class="form-label">Center QR Icon</label>
              <div class="icon-grid">
                <button type="button" class="icon-opt active" onclick="setCenterIcon('${isImageLogo ? 'logo' : esc(client.emoji)}', this)" title="Store Brand Logo">
                  ${isImageLogo ? `<img src="${esc(client.emoji)}" style="width:20px;height:20px;object-fit:contain;vertical-align:middle">` : (client.emoji||'🏪')}
                </button>
                <button type="button" class="icon-opt" onclick="setCenterIcon('⭐', this)" title="Gold Star">⭐</button>
                <button type="button" class="icon-opt" onclick="setCenterIcon('❤️', this)" title="Heart">❤️</button>
                <button type="button" class="icon-opt" onclick="setCenterIcon('G', this)" title="Google G"><b style="font-size:12px">G</b></button>
                <button type="button" class="icon-opt" onclick="setCenterIcon('', this)" title="Clean QR without icon"><i class="ti ti-ban" style="font-size:14px"></i></button>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. ACTIONS & EXPORTS -->
        <div class="ctrl-card">
          <div class="ctrl-sec-title"><i class="ti ti-printer"></i> Print &amp; HD Exports</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <button class="btn btn-primary" onclick="printStandee()" style="justify-content:center">
              <i class="ti ti-printer"></i> Print Standee
            </button>
            <button class="btn btn-ghost" onclick="downloadStandeePng()" style="justify-content:center">
              <i class="ti ti-photo"></i> Export HD PNG
            </button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <a href="${qrDataUrl}" download="qr-raw-${client.slug}.png" class="btn btn-ghost" style="justify-content:center">
              <i class="ti ti-qrcode"></i> Raw QR PNG
            </a>
            <button class="btn btn-ghost" onclick="copyLink()" id="copyBtn" style="justify-content:center">
              <i class="ti ti-copy"></i> Copy Link
            </button>
          </div>
          <div style="margin-top:14px;font-size:11px;font-family:'DM Mono',monospace;color:var(--t3);word-break:break-all;text-align:center;padding:8px 12px;background:var(--s2);border-radius:8px">
            ${url}
          </div>
        </div>

      </div>

      <!-- ── RIGHT: LIVE 1:1 PREVIEW STAGE ── -->
      <div style="position:sticky;top:76px">
        <div class="preview-stage">

          <!-- STANDEE CARD COMPONENT -->
          <div id="standeeCard" class="theme-apple">
            
            <!-- BRAND LOGO DISK -->
            <div class="logo-disk" id="cardEmoji">
              ${logoHeaderHtml}
            </div>

            <!-- TITLE & STARS -->
            <div class="card-title" id="cardTitle">Enjoyed your visit?</div>
            <div class="stars-row">★★★★★</div>
            <div class="card-sub" id="cardSub">Scan to leave a Google review · Takes 30s ⭐</div>

            <!-- QR CODE BOX -->
            <div class="qr-box">
              <img id="qrImg" src="${qrDataUrl}" class="qr-canvas-el" width="175" height="175" alt="QR Code" style="display:block">
              <canvas id="qrCanvas" class="qr-canvas-el" width="180" height="180" style="display:none"></canvas>
            </div>

            <div class="scan-hint">
              <i class="ti ti-camera"></i> Point camera to scan
            </div>

            <div class="card-footer">
              <span>${esc(client.business_name)}</span>
              <span>·</span>
              <span>${esc(client.category)}</span>
            </div>
          </div>

          <div class="no-print" style="margin-top:18px;font-size:11.5px;color:var(--t3);text-align:center;display:flex;align-items:center;gap:6px">
            <i class="ti ti-sparkles" style="color:var(--accent)"></i>
            <span>Interactive Live Preview · 100% Print-ready A6 acrylic stand</span>
          </div>
        </div>
      </div>

    </div>

    <script>
      const RAW_URL = "${url}";
      let currentTheme = 'apple';
      const isImgLogo = ${isImageLogo ? 'true' : 'false'};
      const logoUrl = '${isImageLogo ? esc(client.emoji) : ''}';
      let currentCenterIcon = isImgLogo ? 'logo' : '${esc(client.emoji)}';

      const logoImgObj = new Image();
      if (logoUrl) {
        logoImgObj.src = logoUrl;
        logoImgObj.onload = () => { if (currentCenterIcon === 'logo') renderQR(); };
      }

      // ── RENDER QR CODE WITH CENTER BADGE ON CANVAS ──
      function renderQR() {
        const img = document.getElementById('qrImg');
        const canvas = document.getElementById('qrCanvas');
        if (!canvas || !img) return;

        if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
          let darkColor = '#000000';
          let lightColor = '#ffffff';

          if (currentTheme === 'm3dark') {
            darkColor = '#f8fafc';
            lightColor = '#121215';
          } else if (currentTheme === 'glass') {
            darkColor = '#0369a1';
            lightColor = '#ffffff';
          } else if (currentTheme === 'neumorphic') {
            darkColor = '#1e293b';
            lightColor = '#e0e5ec';
          }

          QRCode.toCanvas(canvas, RAW_URL, {
            width: 360,
            margin: 1,
            errorCorrectionLevel: 'H',
            color: { dark: darkColor, light: lightColor }
          }, function(err) {
            if (!err) {
              canvas.style.display = 'block';
              img.style.display = 'none';

              if (currentCenterIcon) {
                const ctx = canvas.getContext('2d');
                const size = canvas.width;
                const center = size / 2;
                const iconBgRadius = size * 0.14;

                ctx.beginPath();
                ctx.arc(center, center, iconBgRadius, 0, Math.PI * 2);
                ctx.fillStyle = lightColor;
                ctx.fill();
                ctx.lineWidth = size * 0.015;
                ctx.strokeStyle = darkColor;
                ctx.stroke();

                if (currentCenterIcon === 'logo' && logoImgObj.complete && logoImgObj.naturalWidth) {
                  const logoSize = iconBgRadius * 1.4;
                  ctx.drawImage(logoImgObj, center - logoSize/2, center - logoSize/2, logoSize, logoSize);
                } else if (currentCenterIcon && currentCenterIcon !== 'logo') {
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.font = (size * 0.15) + 'px "DM Sans", -apple-system, sans-serif';
                  ctx.fillStyle = darkColor;
                  ctx.fillText(currentCenterIcon, center, center + (size * 0.01));
                }
              }
            } else {
              canvas.style.display = 'none';
              img.style.display = 'block';
            }
          });
        } else {
          canvas.style.display = 'none';
          img.style.display = 'block';
        }
      }

      // ── THEME SWITCHER ──
      function setTheme(themeName, el) {
        currentTheme = themeName;
        document.querySelectorAll('.theme-chip').forEach(c => c.classList.remove('active'));
        if (el) el.classList.add('active');

        const card = document.getElementById('standeeCard');
        card.className = 'theme-' + themeName;

        renderQR();
      }

      // ── CENTER ICON SWITCHER ──
      function setCenterIcon(icon, el) {
        currentCenterIcon = icon;
        document.querySelectorAll('.icon-opt').forEach(b => b.classList.remove('active'));
        if (el) el.classList.add('active');
        renderQR();
      }

      // ── TEXT UPDATES ──
      function updateCardText() {
        const title = document.getElementById('inpTitle').value || 'Enjoyed your visit?';
        const sub = document.getElementById('inpSub').value || 'Scan to leave a review';

        document.getElementById('cardTitle').textContent = title;
        document.getElementById('cardSub').textContent = sub;
      }

      // ── PRINT STANDEE ──
      function printStandee() {
        window.print();
      }

      // ── EXPORT HD PNG ──
      function downloadStandeePng() {
        const card = document.getElementById('standeeCard');
        const btn = event.currentTarget;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Rendering HD...';

        html2canvas(card, {
          scale: 3,
          useCORS: true,
          backgroundColor: null,
          logging: false
        }).then(canvas => {
          const a = document.createElement('a');
          a.download = 'standee-${client.slug}-' + currentTheme + '.png';
          a.href = canvas.toDataURL('image/png');
          a.click();
          btn.innerHTML = '<i class="ti ti-check"></i> Exported HD!';
          setTimeout(() => { btn.innerHTML = originalText; }, 2000);
        }).catch(() => {
          btn.innerHTML = originalText;
          alert('Could not render image');
        });
      }

      // ── COPY LINK ──
      function copyLink() {
        navigator.clipboard.writeText(RAW_URL).then(() => {
          const btn = document.getElementById('copyBtn');
          btn.innerHTML = '<i class="ti ti-check"></i> Copied URL!';
          setTimeout(() => { btn.innerHTML = '<i class="ti ti-copy"></i> Copy Link'; }, 2000);
        });
      }

      // Initial render on load
      window.addEventListener('DOMContentLoaded', () => {
        renderQR();
      });
      setTimeout(renderQR, 150);
    </script>
  `, extraHead);
}

// ── ANALYTICS PAGE ─────────────────────────────────────────────────
function analyticsPage(client, stats) {
  const vd = [...stats.dailyViews].reverse();
  const cd = [...stats.dailyClicks].reverse();
  const allDays = [...new Set([...vd.map(d=>d.day), ...cd.map(d=>d.day)])].sort();
  const vMap = Object.fromEntries(vd.map(d=>[d.day,d.n]));
  const cMap = Object.fromEntries(cd.map(d=>[d.day,d.n]));

  return shell('Analytics — '+client.business_name, `
    <div class="page-hdr">
      <div>
        <div class="page-title">Analytics — ${esc(client.business_name)}</div>
        <div class="page-sub">Last 30 days · ${client.emoji} /r/${client.slug}</div>
      </div>
      <a href="/admin" class="btn btn-ghost"><i class="ti ti-arrow-left"></i> Back</a>
    </div>

    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      <div class="stat">
        <div class="stat-lbl">Total views</div>
        <div class="stat-val">${stats.totalViews}</div>
        <div class="stat-sub">review page opens</div>
      </div>
      <div class="stat">
        <div class="stat-lbl">Maps clicks</div>
        <div class="stat-val stat-accent">${stats.totalClicks}</div>
        <div class="stat-sub">opened Google Maps</div>
      </div>
      <div class="stat">
        <div class="stat-lbl">Conversion rate</div>
        <div class="stat-val">${stats.convRate}%</div>
        <div class="stat-sub">views → Maps clicks</div>
      </div>
    </div>

    <div class="card card-p" style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--t3);margin-bottom:18px">Daily page views</div>
      <canvas id="viewChart" height="72"></canvas>
    </div>

    <div class="card card-p">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--t3);margin-bottom:18px">Daily Maps clicks</div>
      <canvas id="clickChart" height="72"></canvas>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script>
    const days = ${JSON.stringify(allDays)};
    const vMap = ${JSON.stringify(vMap)};
    const cMap = ${JSON.stringify(cMap)};
    const vVals = days.map(d=>vMap[d]||0);
    const cVals = days.map(d=>cMap[d]||0);

    const cfg = (labels, data, color, fill) => ({
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: color + '33',
          borderColor: color,
          borderWidth: 1.5,
          borderRadius: 5,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + ctx.raw } } },
        scales: {
          x: { ticks: { color: '#50507a', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
          y: { ticks: { color: '#50507a', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true, precision: 0 }
        }
      }
    });

    new Chart(document.getElementById('viewChart'), cfg(days, vVals, '#a78bfa'));
    new Chart(document.getElementById('clickChart'), cfg(days, cVals, '#fbbf24'));
    </script>
  `);
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = router;
