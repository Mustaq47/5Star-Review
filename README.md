# ReviewPro

Multi-tenant Google Maps review collection SaaS for local businesses.

## Quick Start

```bash
npm install
npm run dev       # seeds DB + starts server
```

Open **http://localhost:3000/admin**

**Default login:**
- Email: `admin@reviewpro.in`
- Password: `admin123`

> ⚠️ Change the password after first login in production.

---

## Pre-loaded clients

| Client | URL | Status |
|--------|-----|--------|
| Cool & Spicy | `/r/cool-and-spicy` | Real client — update Place ID |
| Spice Garden | `/r/spice-garden-nellore` | Demo only |

---

## Project Structure

```
reviewpro/
├── server.js            # Express entry point
├── seed.js              # Creates admin + sample clients
├── db/setup.js          # SQLite schema
├── middleware/auth.js   # Session guard
├── routes/
│   ├── admin.js         # Dashboard, CRUD, QR, analytics
│   └── review.js        # Public review pages + tracking
├── public/              # Static assets
├── .env.example         # Environment variables template
└── README.md
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```
PORT=3000
SESSION_SECRET=your-long-random-string-here
```

---

## Deployment (Render / Railway)

1. Push to GitHub
2. Connect repo to Render/Railway
3. Set `SESSION_SECRET` environment variable
4. Start command: `npm run dev` (first time) → `npm start` after

---

## Finding a Google Place ID

1. Go to: https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder
2. Search the business name
3. Copy the Place ID (starts with `ChIJ...`)
4. Paste it in the admin panel when adding/editing a client

---

## Pricing Suggestion

| Tier | INR/month | Features |
|------|-----------|----------|
| Starter | ₹999 | 1 location, branded page, tags |
| Growth | ₹1,999 | Up to 3 locations + analytics |
| Pro | ₹3,999 | Unlimited + monthly reports |

One-time setup fee: ₹500–₹1,000
