const express = require('express');
const session = require('express-session');
const path = require('path');

require('./db/setup');

const adminRoutes = require('./routes/admin');
const reviewRoutes = require('./routes/review');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'reviewpro-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.get('/', (req, res) => res.redirect('/admin'));

app.use('/admin', adminRoutes);
app.use('/r', reviewRoutes);

if (require.main === module || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('\n✅ ReviewPro running at http://localhost:' + PORT);
    console.log('   Admin:  http://localhost:' + PORT + '/admin');
    console.log('   Login:  admin@reviewpro.in / admin123\n');
  });
}

module.exports = app;
