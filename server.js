require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const compression = require('compression');

const isProd = process.env.NODE_ENV === 'production';

// Production safety assertion: Fail-fast if session secret is default in production
if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'reviewpro-secret-change-in-production' || process.env.SESSION_SECRET.length < 16)) {
  console.error('FATAL [ReviewPro]: SESSION_SECRET must be set to a secure string (>= 16 chars) in production.');
  process.exit(1);
}

// Initialize Firestore
require('./db/firestore');

const adminRoutes = require('./routes/admin');
const reviewRoutes = require('./routes/review');

const { securityHeaders } = require('./middleware/security');
const { correlationMiddleware } = require('./middleware/correlation');

const app = express();
const PORT = process.env.PORT || 3000;

if (isProd || !!process.env.VERCEL) {
  app.set('trust proxy', 1);
}

// ── MIDDLEWARE PIPELINE ──
app.use(correlationMiddleware);
app.use(compression());
app.use(securityHeaders);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProd ? '1d' : 0,
  etag: true
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'reviewpro-secret-change-in-production-dev-only-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd
  }
}));

// Normalize potential Vercel internal rewrite prefix
app.use((req, res, next) => {
  if (req.url.startsWith('/api/index.js')) {
    req.url = req.url.replace('/api/index.js', '') || '/';
  }
  next();
});

// ── LIVENESS & READINESS HEALTH CHECK ──
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    provider: 'firestore',
    uptimeSec: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Route root path: if logged-in admin, open dashboard; otherwise stay on review page
app.get('/', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.redirect('/admin');
  }
  res.redirect('/r/cool-and-spicy');
});

app.use('/admin', adminRoutes);
app.use('/r', reviewRoutes);

// Fallback: any invalid path redirects back to review page
app.use((req, res) => {
  if (req.session && req.session.adminId) {
    return res.redirect('/admin');
  }
  res.redirect('/r/cool-and-spicy');
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(`[Unhandled Error] [${req.id || 'no-id'}]:`, err);
  if (res.headersSent) return next(err);
  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.status(500).json({ ok: false, error: 'Internal server error', reqId: req.id });
  }
  res.status(500).send('An unexpected error occurred. Please try again later.');
});

let server = null;
if (require.main === module) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log('\n✅ ReviewPro running on port ' + PORT);
    console.log('   Admin:  http://0.0.0.0:' + PORT + '/admin/login');
    console.log('   Login:  admin@reviewpro.in / admin123\n');
  });

  server.on('error', (err) => {
    console.error('Server listen error:', err);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`[ReviewPro] Received ${signal}. Shutting down gracefully...`);
    if (server) {
      server.close(() => {
        console.log('[ReviewPro] HTTP server closed.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
