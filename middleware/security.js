// Production Security Middleware: Headers & Rate Limiting

const rateLimits = new Map();

// Lightweight in-memory rate limiter (compatible with serverless / local / multi-tenant)
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60 * 1000; // 1 minute
  const max = options.max || 60; // 60 requests per window
  const message = options.message || { error: 'Too many requests, please try again later.' };

  return function rateLimiter(req, res, next) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const key = `${req.baseUrl || req.path}:${ip}`;
    const now = Date.now();

    let record = rateLimits.get(key);
    if (!record || now - record.startTime > windowMs) {
      record = { count: 1, startTime: now };
      rateLimits.set(key, record);
    } else {
      record.count += 1;
    }

    // Clean up old entries periodically
    if (rateLimits.size > 5000) {
      for (const [k, v] of rateLimits.entries()) {
        if (now - v.startTime > windowMs) rateLimits.delete(k);
      }
    }

    if (record.count > max) {
      res.setHeader('Retry-After', Math.ceil((record.startTime + windowMs - now) / 1000));
      return res.status(429).json(typeof message === 'string' ? { error: message } : message);
    }

    next();
  };
}

// Security Headers Middleware
function securityHeaders(req, res, next) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Clickjacking protection
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Referrer policy for privacy & security
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Disable dangerous browser permissions
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // XSS protection legacy header
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // HSTS in production
  if (process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
    "img-src 'self' data: https: blob:; " +
    "connect-src 'self' https:; " +
    "frame-ancestors 'self';"
  );

  next();
}

module.exports = {
  securityHeaders,
  createRateLimiter,
  loginLimiter: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 15, message: { error: 'Too many login attempts. Please try again in 15 minutes.' } }),
  aiLimiter: createRateLimiter({ windowMs: 60 * 1000, max: 60, message: { error: 'AI generation limit reached for this minute. Please wait a moment.' } })
};
