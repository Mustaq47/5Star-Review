# ReviewPro — Production Operations & Reliability Runbook

## 1. System Architecture Overview
- **Runtime:** Node.js 18+ (Express.js)
- **Database:** Google Cloud Firestore (Primary Project: `star-review-de5f4`)
- **Dual Auth Database Strategy:**
  - Production / Server environments: Authenticated via Google Cloud ADC or `FIREBASE_SERVICE_ACCOUNT` / `FIREBASE_SERVICE_ACCOUNT_KEY` environment variables (`firebase-admin`).
  - Local dev / sandbox environments: Seamless fallback to Firestore Web Client SDK.
- **AI Synthesis Gateway:**
  - Multi-tiered AI fallback: Google Gemini LLM API -> Local Domain Lexicons & Markov transitions.
  - Zero-downtime resilience: Automatic circuit breakers, 20s timeouts, in-memory deduplication cache.
- **Security & Headers:**
  - Cryptographic CSRF tokens on all state-altering endpoints.
  - Session fixation defense (`session.regenerate()`).
  - IP-based rate limiting (`loginLimiter`, `aiLimiter`, `publicReviewLimiter`).
  - Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`, `Referrer-Policy`.
  - Correlated request tracing via `X-Request-ID`.

---

## 2. Environment Variables Checklist

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes (in Prod) | `development` | Setting to `production` enforces HTTPS cookies & secret checks. |
| `PORT` | Optional | `3000` | Port for the HTTP server. |
| `SESSION_SECRET` | **Mandatory** in Prod | - | 32+ character random secret for signing session cookies. |
| `FIREBASE_PROJECT_ID` | Optional | `star-review-de5f4` | GCP Firestore project ID. |
| `FIREBASE_SERVICE_ACCOUNT` | Recommended | - | JSON string of Google Cloud Service Account credentials. |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Optional | - | Absolute path to `serviceAccountKey.json`. |
| `GEMINI_API_KEY` | Optional | - | Google Gemini AI API key for dynamic generation. |

---

## 3. Deployment Instructions

### Option A: Docker Deployment (Recommended)
```bash
# 1. Build image
docker build -t reviewpro:latest .

# 2. Run container
docker run -d \
  --name reviewpro-prod \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e SESSION_SECRET="your-secure-random-32-char-secret-here" \
  -e FIREBASE_PROJECT_ID="star-review-de5f4" \
  -e GEMINI_API_KEY="your-gemini-key" \
  --restart unless-stopped \
  reviewpro:latest
```

### Option B: Bare Metal / Linux VM (systemd / PM2)
```bash
# Install dependencies
npm ci --only=production

# Seed database with initial admin & default clients
npm run setup

# Run with PM2 in cluster mode
pm2 start server.js -i max --name reviewpro
```

---

## 4. Health Checks & Monitoring

- **Liveness & Readiness Probe:** `GET /healthz`
  - Returns `200 OK` with JSON:
    ```json
    {
      "status": "ok",
      "provider": "firestore",
      "uptimeSec": 12450,
      "timestamp": "2026-09-17T08:15:00.000Z"
    }
    ```
- **Log Correlation:** Every incoming request receives a UUID in `req.id` and response header `X-Request-ID`. Search application logs with `reqId` to trace the entire lifecycle of a transaction.

---

## 5. Backup & Disaster Recovery

- **Firestore Backups:** Configure Google Cloud Managed Exports via Cloud Scheduler:
  ```bash
  gcloud firestore export gs://[PROJECT_ID]-firestore-backups
  ```
- **Fallback Verification:** If Gemini API experiences outages or rate limits, the system automatically falls back to deterministic local synthesis without user-facing disruption.

---

## 6. Incident Response & Troubleshooting

1. **High Login Failures (Brute Force):**
   - The system automatically engages `loginLimiter` (10 requests / 15 mins per IP).
   - Check logs for IP-specific correlation IDs.
2. **AI Generation Timeouts:**
   - Review agent aborts stalled API calls after 20s.
   - Deterministic domain lexicons serve user immediately.
3. **Database Connectivity Degradation:**
   - `/healthz` will reflect status and errors.
   - Verify GCP IAM permissions and service account token expiry.
