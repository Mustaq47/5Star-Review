require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

require('./db/setup');

const adminRoutes = require('./routes/admin');
const reviewRoutes = require('./routes/review');

const { securityHeaders } = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

if (isProd) {
  app.set('trust proxy', 1);
}

app.use(securityHeaders);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'reviewpro-secret-change-in-production',
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

if (require.main === module || !process.env.VERCEL) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('\n✅ ReviewPro running on port ' + PORT);
    console.log('   Admin:  http://0.0.0.0:' + PORT + '/admin/login');
    console.log('   Login:  admin@reviewpro.in / admin123\n');
  });

  server.on('error', (err) => {
    console.error('Server listen error:', err);
  });
}

module.exports = app;
