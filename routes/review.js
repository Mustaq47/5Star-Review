const express = require('express');
const db = require('../db/setup');
const router = express.Router();

router.get('/:slug', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE slug=? AND active=1').get(req.params.slug);
  if (!client) return res.status(404).send(notFound());
  db.prepare('INSERT INTO pageviews (client_id) VALUES (?)').run(client.id);
  const tags = JSON.parse(client.tags || '[]');
  res.send(reviewPage(client, tags));
});

router.post('/:slug/click', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE slug=?').get(req.params.slug);
  if (client) db.prepare('INSERT INTO review_clicks (client_id) VALUES (?)').run(client.id);
  res.json({ ok: true });
});

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function notFound() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not Found</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#0b0b14;color:#e8e0f8;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}</style>
  </head><body><div><div style="font-size:44px;margin-bottom:14px">🔍</div><h2 style="font-size:18px;margin-bottom:8px">Page not found</h2><p style="color:#50507a;font-size:14px">This review link is inactive or doesn't exist.</p></div></body></html>`;
}

function reviewPage(client, tags) {
  const color = client.primary_color || '#7c4dff';
  const tagsJson = JSON.stringify(tags).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');
  const isCoolSpicy = client.slug === 'cool-and-spicy';
  const bizNameHtml = isCoolSpicy
    ? '<span class="c-cool">COOL</span> <span class="c-and">&amp;</span> <span class="c-spicy">SPICY</span>'
    : esc(client.business_name);

  const isImageLogo = client.emoji && (client.emoji.startsWith('/') || client.emoji.startsWith('http') || client.emoji.match(/\.(png|jpg|jpeg|svg|webp)$/i));
  const logoHtml = isImageLogo
    ? `<img src="${esc(client.emoji)}" alt="${esc(client.business_name)} Logo">`
    : esc(client.emoji || '🏪');

  const SUGG = {
    'food is':' absolutely delicious',
    'service was':' quick and warm',
    'the staff':' are friendly and attentive',
    'highly':' recommend this place',
    'would':' definitely come back',
    'great':' value for the money',
    'clean and':' well-maintained throughout',
    'love the':' ambience here',
    'the chicken':' is perfectly crispy',
    'milkshake':' was thick and creamy',
    'pizza was':' fresh and delicious',
    'ice cream':' flavours are amazing',
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Review — ${esc(client.business_name)}</title>
<meta name="description" content="Share your experience at ${esc(client.business_name)}">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900;1,9..40,400&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">
<style>
:root{ --brand:${color}; }
*{box-sizing:border-box;margin:0;padding:0}

/* ── BRAND CUSTOM COLORS ── */
.c-cool{color:#1d4ed8;font-weight:900;letter-spacing:0.8px}
.c-and{color:#0ea5e9;font-weight:900}
.c-spicy{color:#ff1e27;font-weight:900;letter-spacing:0.8px}
.root.dark .c-cool{color:#3b82f6;text-shadow:0 0 14px rgba(59,130,246,0.45)}
.root.dark .c-and{color:#38bdf8;text-shadow:0 0 10px rgba(56,189,248,0.45)}
.root.dark .c-spicy{color:#ff2a34;text-shadow:0 0 14px rgba(255,42,52,0.45)}

${isCoolSpicy ? `
.bp {
  background: linear-gradient(135deg, #0284c7 0%, #38bdf8 28%, #fb7185 72%, #f43f5e 100%) !important;
  border-color: rgba(255,255,255,0.28) !important;
  box-shadow: 0 6px 24px rgba(2,132,199,0.28), 0 3px 12px rgba(244,63,94,0.25) !important;
  color: #ffffff !important;
  text-shadow: 0 1px 2px rgba(0,0,0,0.18);
}
.root.light .o1{background:radial-gradient(circle,rgba(29,78,216,0.26) 0%,transparent 70%) !important}
.root.dark  .o1{background:radial-gradient(circle,rgba(29,78,216,0.36) 0%,transparent 70%) !important}
.root.light .o2{background:radial-gradient(circle,rgba(239,68,68,0.22) 0%,transparent 70%) !important}
.root.dark  .o2{background:radial-gradient(circle,rgba(220,38,38,0.32) 0%,transparent 70%) !important}
.root.light .o3{background:radial-gradient(circle,rgba(14,165,233,0.2) 0%,transparent 70%) !important}
.root.dark  .o3{background:radial-gradient(circle,rgba(14,165,233,0.24) 0%,transparent 70%) !important}
.biz-cat { color: #0284c7 !important; }
.root.dark .biz-cat { color: #38bdf8 !important; }
` : ''}

/* ── ROOT & THEME ── */
.root{font-family:'DM Sans',sans-serif;min-height:100vh;position:relative;overflow-x:hidden;transition:background .4s}
.root.light{background:linear-gradient(145deg,#e0f2fe 0%,#f0f9ff 35%,#dbeafe 65%,#eff6ff 100%)}
.root.dark {background:linear-gradient(145deg,#050d1a 0%,#0a182d 35%,#071426 65%,#0d1e38 100%)}

/* ── AMBIENT ORBS ── */
.orb{position:fixed;border-radius:50%;pointer-events:none;transition:all .5s}
.o1{width:440px;height:440px;top:-100px;right:-80px}
.o2{width:320px;height:320px;bottom:-60px;left:-70px}
.o3{width:200px;height:200px;bottom:140px;right:0}
.root.light .o1{background:radial-gradient(circle,rgba(56,189,248,0.3) 0%,transparent 70%)}
.root.dark  .o1{background:radial-gradient(circle,rgba(14,165,233,0.35) 0%,transparent 70%)}
.root.light .o2{background:radial-gradient(circle,rgba(96,165,250,0.25) 0%,transparent 70%)}
.root.dark  .o2{background:radial-gradient(circle,rgba(37,99,235,0.3) 0%,transparent 70%)}
.root.light .o3{background:radial-gradient(circle,rgba(14,165,233,0.22) 0%,transparent 70%)}
.root.dark  .o3{background:radial-gradient(circle,rgba(2,132,199,0.28) 0%,transparent 70%)}

/* ── SHELL ── */
.shell{position:relative;z-index:2;min-height:100vh;padding:20px 16px 52px;display:flex;flex-direction:column;align-items:center}

/* ── MODE TOGGLE ── */
.mode-btn{
  align-self:flex-end;margin-bottom:16px;
  width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;
  display:flex;align-items:center;justify-content:center;font-size:16px;
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  transition:all .3s;flex-shrink:0;
}
.root.light .mode-btn{background:rgba(255,255,255,0.65);border:1px solid rgba(186,230,253,0.85);box-shadow:0 2px 10px rgba(14,116,144,0.12)}
.root.dark  .mode-btn{background:rgba(14,165,233,0.08);border:1px solid rgba(56,189,248,0.2)}

/* ── GLASS CARD ── */
.glass{
  width:100%;max-width:400px;border-radius:28px;padding:26px 22px;
  backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);
  transition:all .4s;
}
.root.light .glass{background:rgba(255,255,255,0.62);border:1px solid rgba(255,255,255,0.92);box-shadow:0 12px 48px rgba(14,116,144,0.13),inset 0 1px 0 rgba(255,255,255,0.95)}
.root.dark  .glass{background:rgba(10,24,46,0.58);border:1px solid rgba(56,189,248,0.18);box-shadow:0 12px 52px rgba(0,0,0,0.65),inset 0 1px 0 rgba(255,255,255,0.08)}

/* ── HEADER ── */
.hdr{display:flex;align-items:center;gap:14px;margin-bottom:22px;padding-bottom:20px;border-bottom:1px solid;transition:border-color .4s}
.root.light .hdr{border-color:rgba(186,230,253,0.7)}
.root.dark  .hdr{border-color:rgba(56,189,248,0.14)}

.biz-logo{
  width:62px;height:62px;border-radius:20px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;font-size:26px;
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:all .4s;
  overflow:hidden;padding:2px;
}
.biz-logo img{width:100%;height:100%;object-fit:contain;display:block}
.root.light .biz-logo{background:rgba(255,255,255,0.8);border:1px solid rgba(186,230,253,0.9);box-shadow:0 3px 14px rgba(14,116,144,0.14)}
.root.dark  .biz-logo{background:rgba(14,165,233,0.08);border:1px solid rgba(56,189,248,0.2)}

.biz-name{font-size:19px;font-weight:700;letter-spacing:-0.3px;line-height:1.2;margin-bottom:3px;transition:color .4s}
.root.light .biz-name{color:#0c2340}
.root.dark  .biz-name{color:#f0f9ff}

.biz-cat{font-family:'DM Mono',monospace;font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;transition:color .4s}
.root.light .biz-cat{color:#0284c7}
.root.dark  .biz-cat{color:#38bdf8}

.biz-desc{font-size:12.5px;line-height:1.58;margin-top:7px;transition:color .4s}
.root.light .biz-desc{color:rgba(20,55,95,0.72)}
.root.dark  .biz-desc{color:rgba(186,230,253,0.62)}

/* ── STEP DOTS ── */
.dots{display:flex;gap:7px;margin-bottom:24px}
.dot{height:3px;flex:1;border-radius:3px;cursor:pointer;transition:all .3s}
.root.light .dot{background:rgba(186,230,253,0.8)}
.root.dark  .dot{background:rgba(56,189,248,0.18)}
.dot.on{background:#0284c7 !important;opacity:0.95}
.root.dark .dot.on{background:#38bdf8 !important}

/* ── PANELS ── */
.panel{display:none}.panel.active{display:block}

/* ── TYPOGRAPHY ── */
.ph{font-size:22px;font-weight:700;letter-spacing:-0.4px;line-height:1.2;margin-bottom:5px;transition:color .4s}
.root.light .ph{color:#091e36}
.root.dark  .ph{color:#f0f9ff}
.ps{font-size:13px;margin-bottom:26px;transition:color .4s}
.root.light .ps{color:rgba(24,60,100,0.68)}
.root.dark  .ps{color:rgba(186,230,253,0.58)}

/* ── STARS ── */
.star-row{display:flex;gap:7px;margin-bottom:10px}
.sb{
  flex:1;height:62px;border-radius:15px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  cursor:pointer;border:1px solid;overflow:hidden;position:relative;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  transition:all .2s cubic-bezier(.34,1.4,.64,1);user-select:none;
}
.root.light .sb{background:rgba(255,255,255,0.55);border-color:rgba(186,230,253,0.85)}
.root.dark  .sb{background:rgba(14,165,233,0.06);border-color:rgba(56,189,248,0.16)}
.root.light .sb.lit{background:rgba(254,215,40,0.22);border-color:rgba(251,191,36,0.6);transform:scale(1.07) translateY(-2px);box-shadow:0 7px 22px rgba(200,155,0,0.22),inset 0 1px 0 rgba(255,255,255,0.6)}
.root.dark  .sb.lit{background:rgba(251,191,36,0.14);border-color:rgba(251,191,36,0.36);transform:scale(1.07) translateY(-2px);box-shadow:0 7px 26px rgba(180,140,0,0.35),inset 0 1px 0 rgba(255,255,255,0.08)}
.sb.lit{animation:sPop .26s cubic-bezier(.34,1.5,.64,1) both}
@keyframes sPop{0%{transform:scale(.65)}60%{transform:scale(1.13) translateY(-3px)}100%{transform:scale(1.07) translateY(-2px)}}
.sb::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.18) 50%,transparent 100%);transform:translateX(-100%);pointer-events:none}
.sb.lit::after{animation:sweep .5s ease-out forwards}
@keyframes sweep{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.sg{font-size:24px;line-height:1;filter:saturate(0) brightness(0.45);transition:filter .2s;position:relative;z-index:1}
.sb.lit .sg{filter:saturate(1) drop-shadow(0 0 6px rgba(251,191,36,0.55))}
.sn{font-size:9.5px;font-weight:600;font-family:'DM Mono',monospace;transition:color .3s;position:relative;z-index:1}
.root.light .sn{color:rgba(14,116,144,0.6)}
.root.dark  .sn{color:rgba(186,230,253,0.5)}
.sb.lit .sn{color:rgba(140,100,0,0.9) !important}

.sx{display:flex;justify-content:space-between;margin-bottom:22px;padding:0 2px}
.sx span{font-size:10px;transition:color .4s}
.root.light .sx span{color:rgba(14,116,144,0.6)}
.root.dark  .sx span{color:rgba(186,230,253,0.48)}

/* ── RATING CHIP ── */
.rchip{
  border-radius:14px;padding:13px 18px;
  display:flex;align-items:center;justify-content:space-between;
  margin-bottom:22px;min-height:54px;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  transition:all .4s;border:1px solid;
}
.root.light .rchip{background:rgba(255,255,255,0.55);border-color:rgba(186,230,253,0.85)}
.root.dark  .rchip{background:rgba(14,165,233,0.06);border-color:rgba(56,189,248,0.16)}
.rv{font-family:'DM Mono',monospace;font-size:28px;font-weight:500;color:rgba(202,158,0,0.9);line-height:1}
.rw{font-size:15px;font-weight:600;transition:color .4s}
.root.light .rw{color:#091e36}
.root.dark  .rw{color:#f0f9ff}
.re{font-size:13px;width:100%;text-align:center;transition:color .4s}
.root.light .re{color:rgba(14,116,144,0.6)}
.root.dark  .re{color:rgba(186,230,253,0.45)}

/* ── TEXTAREA ── */
.tw{position:relative;margin-bottom:12px}
.ta{
  width:100%;border-radius:15px;font-family:'DM Sans',sans-serif;
  font-size:14px;line-height:1.68;padding:14px 14px 50px;
  resize:none;min-height:124px;outline:none;
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  transition:all .4s;border:1px solid;
}
.root.light .ta{background:rgba(255,255,255,0.52);border-color:rgba(186,230,253,0.9);color:#0c2340;caret-color:#0284c7}
.root.dark  .ta{background:rgba(7,18,36,0.55);border-color:rgba(56,189,248,0.18);color:#f0f9ff;caret-color:#38bdf8}
.root.light .ta::placeholder{color:rgba(14,116,144,0.45)}
.root.dark  .ta::placeholder{color:rgba(186,230,253,0.38)}
.root.light .ta:focus{border-color:rgba(14,165,233,0.6);background:rgba(255,255,255,0.75)}
.root.dark  .ta:focus{border-color:rgba(56,189,248,0.35);background:rgba(10,24,46,0.7)}

.ghost{
  position:absolute;top:0;left:0;right:0;
  padding:14px 14px 50px;font-family:'DM Sans',sans-serif;
  font-size:14px;line-height:1.68;color:transparent;
  pointer-events:none;white-space:pre-wrap;word-break:break-word;
}
.root.light .gs{color:rgba(2,132,199,0.38)}
.root.dark  .gs{color:rgba(56,189,248,0.28)}

/* ── AI PILL ── */
.aip{
  position:absolute;bottom:11px;left:13px;
  display:flex;align-items:center;gap:5px;
  border-radius:20px;padding:4px 11px;font-size:10.5px;font-weight:500;letter-spacing:0.04em;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:all .4s;border:1px solid;
}
.root.light .aip{background:rgba(255,255,255,0.8);border-color:rgba(186,230,253,0.9);color:#0369a1}
.root.dark  .aip{background:rgba(14,165,233,0.08);border-color:rgba(56,189,248,0.2);color:#7dd3fc}
.orbl{width:6px;height:6px;border-radius:50%;animation:ao 1.6s ease-in-out infinite;transition:background .4s}
.root.light .orbl{background:#0284c7}
.root.dark  .orbl{background:#38bdf8}
@keyframes ao{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.18;transform:scale(.55)}}

.th{font-size:11px;font-family:'DM Mono',monospace;min-height:16px;margin-bottom:12px;transition:color .4s}
.root.light .th{color:rgba(14,116,144,0.55)}
.root.dark  .th{color:rgba(125,211,252,0.48)}

/* ── SECTION LABEL ── */
.sl{font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;transition:color .4s}
.root.light .sl{color:rgba(2,132,199,0.7)}
.root.dark  .sl{color:rgba(56,189,248,0.6)}

/* ── TAGS ── */
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:22px}
.tag{
  border-radius:20px;padding:5px 13px;font-size:12px;font-weight:500;cursor:pointer;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:all .2s;border:1px solid;
}
.root.light .tag{background:rgba(224,242,254,0.6);border-color:rgba(186,230,253,0.85);color:#0369a1}
.root.dark  .tag{background:rgba(14,165,233,0.08);border-color:rgba(56,189,248,0.18);color:#bae6fd}
.root.light .tag:hover{background:rgba(255,255,255,0.9);color:#0284c7;transform:translateY(-1px)}
.root.dark  .tag:hover{background:rgba(14,165,233,0.18);color:#f0f9ff;transform:translateY(-1px)}
.root.light .tag.on{background:rgba(254,215,40,0.22);border-color:rgba(202,158,0,0.45);color:rgba(108,72,0,0.95)}
.root.dark  .tag.on{background:rgba(251,191,36,0.12);border-color:rgba(202,158,0,0.35);color:rgba(222,188,78,0.95)}

/* ── DIVIDER ── */
.div{height:1px;margin:18px 0;transition:background .4s}
.root.light .div{background:rgba(186,230,253,0.6)}
.root.dark  .div{background:rgba(56,189,248,0.12)}

/* ── ACTIONS ── */
.acts{display:flex;flex-direction:column;gap:9px}
.btn{
  height:50px;border-radius:14px;font-family:'DM Sans',sans-serif;
  font-size:14px;font-weight:600;cursor:pointer;border:1px solid;
  display:flex;align-items:center;justify-content:center;gap:8px;
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  transition:all .2s;letter-spacing:0.01em;
}
.btn i{font-size:17px}

.bp{background:linear-gradient(135deg,#0284c7 0%,#0369a1 100%);border-color:rgba(255,255,255,0.2);color:#fff;box-shadow:0 4px 22px rgba(2,132,199,0.3),inset 0 1px 0 rgba(255,255,255,0.2)}
.root.dark .bp{opacity:0.95}
.bp:hover{filter:brightness(1.1);transform:translateY(-1px)}
.bp:active{transform:scale(0.98)}

.root.light .bs{background:rgba(255,255,255,0.65);border-color:rgba(186,230,253,0.9);color:#0369a1}
.root.dark  .bs{background:rgba(14,165,233,0.08);border-color:rgba(56,189,248,0.2);color:#bae6fd}
.bs:hover{transform:translateY(-1px)}
.bs:active{transform:scale(0.98)}

.bg{background:transparent !important;border-color:transparent !important;height:42px;font-size:13px}
.root.light .bg{color:rgba(14,116,144,0.7)}
.root.dark  .bg{color:rgba(125,211,252,0.65)}
.bg:hover{opacity:0.8}

/* ── PREVIEW PANEL ── */
.phero{text-align:center;padding:10px 0 22px}
.phstars{font-size:30px;letter-spacing:4px;margin-bottom:12px;min-height:38px}
.phword{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:22px;transition:color .4s}
.root.light .phword{color:rgba(140,100,0,0.85)}
.root.dark  .phword{color:rgba(210,168,58,0.85)}

.rbox{
  border-radius:14px;padding:15px;margin-bottom:18px;font-size:13.5px;line-height:1.65;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:all .4s;border:1px solid;
}
.root.light .rbox{background:rgba(255,255,255,0.55);border-color:rgba(186,230,253,0.85);color:rgba(20,55,95,0.65);font-style:italic}
.root.dark  .rbox{background:rgba(14,165,233,0.06);border-color:rgba(56,189,248,0.16);color:rgba(186,230,253,0.65);font-style:italic}
.rbox.has{font-style:normal}
.root.light .rbox.has{color:#091e36}
.root.dark  .rbox.has{color:#f0f9ff}

.snote{font-size:12px;line-height:1.62;text-align:center;padding:0 8px;margin-bottom:20px;transition:color .4s}
.root.light .snote{color:rgba(20,55,95,0.65)}
.root.dark  .snote{color:rgba(186,230,253,0.6)}
.root.light .snote strong{color:#0c2340;font-weight:600}
.root.dark  .snote strong{color:#bae6fd;font-weight:600}

/* ── TOAST ── */
.tw-wrap{
  position:fixed;bottom:24px;left:50%;
  transform:translateX(-50%) translateY(16px);
  opacity:0;pointer-events:none;
  transition:opacity .2s,transform .28s cubic-bezier(.34,1.3,.64,1);
  white-space:nowrap;z-index:200;
}
.tw-wrap.show{opacity:1;transform:translateX(-50%) translateY(0)}
.tw-inn{
  border-radius:14px;padding:11px 20px;font-size:13.5px;font-weight:500;
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid;
}
.root.light .tw-inn{background:rgba(255,255,255,0.92);border-color:rgba(186,230,253,0.95);color:#0c2340;box-shadow:0 4px 28px rgba(14,116,144,0.16)}
.root.dark  .tw-inn{background:rgba(8,22,42,0.95);border-color:rgba(56,189,248,0.25);color:#f0f9ff}
</style>
</head>
<body>
<div class="root light" id="root">
  <div class="orb o1"></div>
  <div class="orb o2"></div>
  <div class="orb o3"></div>

  <div class="shell">
    <button class="mode-btn" id="modeBtn" onclick="toggleMode()" aria-label="Toggle dark mode">☀️</button>

    <div class="glass">

      <!-- HEADER -->
      <div class="hdr">
        <div class="biz-logo">${logoHtml}</div>
        <div>
          <div class="biz-name">${bizNameHtml}</div>
          <div class="biz-cat">${esc(client.category)}</div>
          <div class="biz-desc">${esc(client.description)}</div>
        </div>
      </div>

      <!-- STEP DOTS -->
      <div class="dots">
        <div class="dot on" onclick="go(0)"></div>
        <div class="dot" onclick="go(1)"></div>
        <div class="dot" onclick="go(2)"></div>
      </div>

      <!-- ── STEP 1: RATE ── -->
      <div class="panel active" id="p0">
        <div class="ph">How was your visit?</div>
        <div class="ps">Tap a star to rate your experience.</div>

        <div class="star-row" id="starRow">
          <div class="sb" onclick="rate(1)"><span class="sg">⭐</span><span class="sn">1</span></div>
          <div class="sb" onclick="rate(2)"><span class="sg">⭐</span><span class="sn">2</span></div>
          <div class="sb" onclick="rate(3)"><span class="sg">⭐</span><span class="sn">3</span></div>
          <div class="sb" onclick="rate(4)"><span class="sg">⭐</span><span class="sn">4</span></div>
          <div class="sb" onclick="rate(5)"><span class="sg">⭐</span><span class="sn">5</span></div>
        </div>
        <div class="sx"><span>Terrible</span><span>Neutral</span><span>Excellent</span></div>

        <div class="rchip" id="rchip"><span class="re">No rating selected yet</span></div>

        <div class="acts">
          <button class="btn bp" id="btn0" onclick="go(1)" style="opacity:.28;pointer-events:none">
            Write your review <i class="ti ti-arrow-right"></i>
          </button>
        </div>
      </div>

      <!-- ── STEP 2: WRITE ── -->
      <div class="panel" id="p1">
        <div class="ph">Share your thoughts</div>
        <div class="ps">Your review helps others decide.</div>

        <div class="tw">
          <div class="ghost" id="ghost"></div>
          <textarea class="ta" id="ta" rows="5"
            placeholder="What stood out about your visit?"
            oninput="onTA()" onkeydown="onKey(event)"></textarea>
          <div class="aip"><div class="orbl"></div><span>AI assist · Tab to accept</span></div>
        </div>

        <div class="th" id="th"></div>

        <div class="sl">Quick tags</div>
        <div class="tags" id="tags"></div>

        <div class="acts">
          <button class="btn bp" onclick="go(2)">
            Preview review <i class="ti ti-arrow-right"></i>
          </button>
          <button class="btn bg" onclick="go(0)">
            <i class="ti ti-arrow-left"></i> Back
          </button>
        </div>
      </div>

      <!-- ── STEP 3: SUBMIT ── -->
      <div class="panel" id="p2">
        <div class="phero">
          <div class="phstars" id="pst"></div>
          <div class="phword" id="pwd"></div>
        </div>

        <div class="rbox" id="ptx"></div>

        <div class="snote">
          <strong>Ready to post?</strong> Tap below to copy your review, then paste it directly into Google Maps.
        </div>

        <div class="acts">
          <button class="btn bp" onclick="copyOpen()">
            <i class="ti ti-copy"></i> Copy &amp; open Google Maps
          </button>
          <button class="btn bs" onclick="copyOnly()">
            <i class="ti ti-clipboard"></i> Copy review only
          </button>
          <button class="btn bg" onclick="go(1)">
            <i class="ti ti-arrow-left"></i> Edit review
          </button>
        </div>
      </div>

    </div>
  </div>

  <div class="tw-wrap" id="twrap"><div class="tw-inn" id="tinn"></div></div>
</div>

<script>
const WORDS = ['Terrible','Poor','Okay','Good','Excellent'];
const TAGS  = ${tagsJson};
const PLACE_ID = '${esc(client.place_id)}';
const SLUG     = '${esc(client.slug)}';
const SUGG = ${JSON.stringify(SUGG)};

let dark=false, rating=0, sugg='', sgT=null, active=new Set();

function toggleMode() {
  dark = !dark;
  document.getElementById('root').className = 'root ' + (dark?'dark':'light');
  document.getElementById('modeBtn').textContent = dark ? '🌙' : '☀️';
}

function go(n) {
  if (n > 0 && !rating) { toast('Please select a star rating first'); return; }
  for (let i=0; i<3; i++) {
    document.getElementById('p'+i).className = 'panel' + (i===n?' active':'');
    document.querySelectorAll('.dot')[i].className = 'dot' + (i===n?' on':'');
  }
  if (n===2) buildPreview();
}

function rate(v) {
  rating = v;
  document.querySelectorAll('.sb').forEach((b,i) => b.classList.toggle('lit', i<v));
  document.getElementById('rchip').innerHTML =
    '<span class="rv">'+v+'.0</span><span class="rw">'+WORDS[v-1]+'</span>';
  const b = document.getElementById('btn0');
  b.style.opacity='1'; b.style.pointerEvents='auto';
}

function initTags() {
  const el = document.getElementById('tags'); el.innerHTML='';
  TAGS.forEach((t,i) => {
    const b = document.createElement('button');
    b.className = 'tag' + (active.has(i)?' on':'');
    b.textContent = t.l;
    b.onclick = () => tapTag(i, t.t);
    el.appendChild(b);
  });
}

function tapTag(i, text) {
  const ta = document.getElementById('ta');
  if (active.has(i)) {
    active.delete(i);
    ta.value = ta.value.replace(' '+text,'').replace(text,'').trim();
  } else {
    active.add(i);
    const v = ta.value.trim();
    ta.value = v ? v+' '+text : text;
  }
  clrS(); initTags();
}

function onTA() {
  clrS();
  const v = document.getElementById('ta').value.toLowerCase();
  const chunk = v.slice(-32);
  for (const [k,s] of Object.entries(SUGG)) {
    if (chunk.endsWith(k)) {
      sugg = s;
      document.getElementById('th').textContent = 'Suggestion ready — press Tab to accept';
      sgT = setTimeout(() => {
        const ta = document.getElementById('ta');
        document.getElementById('ghost').innerHTML =
          esc(ta.value) + '<span class="gs">' + esc(sugg) + '</span>';
      }, 360);
      return;
    }
  }
  clrG();
}

function onKey(e) {
  if ((e.key==='Tab'||e.key==='ArrowRight') && sugg) {
    e.preventDefault();
    document.getElementById('ta').value += sugg;
    clrS();
  }
}

function clrS() { clearTimeout(sgT); clrG(); document.getElementById('th').textContent=''; }
function clrG() { sugg=''; document.getElementById('ghost').innerHTML=''; }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function buildPreview() {
  const txt = document.getElementById('ta').value.trim();
  document.getElementById('pst').textContent = '⭐'.repeat(rating);
  document.getElementById('pwd').textContent = WORDS[rating-1];
  const box = document.getElementById('ptx');
  if (txt) { box.textContent=txt; box.classList.add('has'); }
  else { box.textContent='No written review — your star rating will still be posted.'; box.classList.remove('has'); }
}

function getText() {
  const t = document.getElementById('ta').value.trim();
  return t || (WORDS[rating-1]+' experience — '+rating+' out of 5 stars.');
}

function trackClick() {
  fetch('/r/'+SLUG+'/click', { method:'POST' }).catch(()=>{});
}

function copyOnly() {
  const text = getText();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => toast('Review copied ✓ — now paste it in Maps'))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('Review copied ✓ — now paste it in Maps');
  } catch(e) {
    toast('Long-press the review text to copy');
  }
}

function copyOpen() {
  const url = 'https://search.google.com/local/writereview?placeid=' + encodeURIComponent(PLACE_ID);
  trackClick();
  const text = getText();
  
  // Copy to clipboard
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
  
  toast('Copied! Opening Maps review page…');
  
  // Open window immediately to prevent browser popup blocker
  const win = window.open(url, '_blank');
  if (!win || win.closed || typeof win.closed === 'undefined') {
    // If popup was blocked or mobile browser, redirect directly
    window.location.href = url;
  }
}

function toast(msg) {
  const w = document.getElementById('twrap');
  document.getElementById('tinn').textContent = msg;
  w.classList.add('show');
  setTimeout(() => w.classList.remove('show'), 3000);
}

initTags();
</script>
<script src="/agentation.js"></script>
</body></html>`;
}

// Shared SUGG object accessible in template
const SUGG = {
  'food is':' absolutely delicious',
  'service was':' quick and warm',
  'the staff':' are friendly and attentive',
  'highly':' recommend this place',
  'would':' definitely come back',
  'great':' value for the money',
  'clean and':' well-maintained throughout',
  'love the':' ambience here',
  'the chicken':' is perfectly crispy',
  'milkshake':' was thick and creamy',
  'pizza was':' fresh and delicious',
  'ice cream':' flavours are amazing',
};

module.exports = router;
