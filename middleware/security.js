// Production Security Middleware: Headers, CSRF & Rate Limiting

const rateLimits = new Map();

// Adaptive in-memory rate limiter
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 60;
  const message = options.message || { ok: false, error: 'Too many requests, please try again later.' };

  return function rateLimiter(req, res, next) {
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const key = `${req.baseUrl || ''}:${req.path}:${rawIp}`;
    const now = Date.now();

    let record = rateLimits.get(key);
    if (!record || now - record.startTime > windowMs) {
      record = { count: 1, startTime: now };
      rateLimits.set(key, record);
    } else {
      record.count += 1;
    }

    // Periodic map sweep
    if (rateLimits.size > 5000) {
      for (const [k, v] of rateLimits.entries()) {
        if (now - v.startTime > windowMs) rateLimits.delete(k);
      }
    }

    if (record.count > max) {
      res.setHeader('Retry-After', Math.ceil((record.startTime + windowMs - now) / 1000));
      return res.status(429).json(typeof message === 'string' ? { ok: false, error: message } : message);
    }

    next();
  };
}

// CSRF Origin & Referer Verification for mutating admin POST requests
function verifyAdminCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const origin = req.headers['origin'];
  const referer = req.headers['referer'];
  const host = req.headers['host'];

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) return next();
    } catch (e) {}
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host === host) return next();
    } catch (e) {}
  }

  // If both origin and referer are absent on POST or mismatched:
  if (!origin && !referer) {
    return next(); // Permit direct client/curl or internal redirects
  }

  return res.status(403).json({ ok: false, error: 'Cross-site request blocked (CSRF validation failed)' });
}

// Security Headers Middleware
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  const isProd = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Permissive enough for external Google Fonts, CDN icon fonts, Chart.js, QRCode, but strictly protects self
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; " +
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; " +
    "img-src 'self' data: https: blob:; " +
    "connect-src 'self' https:; " +
    "frame-ancestors 'self';"
  );

  next();
}

module.exports = {
  securityHeaders,
  verifyAdminCsrf,
  createRateLimiter,
  loginLimiter: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 15, message: { ok: false, error: 'Too many login attempts. Please wait 15 minutes.' } }),
  aiLimiter: createRateLimiter({ windowMs: 60 * 1000, max: 60, message: { ok: false, error: 'AI limit reached for this minute. Please wait a moment.' } }),
  publicReviewLimiter: createRateLimiter({ windowMs: 60 * 1000, max: 120, message: { ok: false, error: 'Too many requests. Please slow down.' } })
};
