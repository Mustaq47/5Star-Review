const { z } = require('zod');

// ── SANITIZATION HELPERS ──
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  // Strip control characters while preserving valid newlines & tabs
  return str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

function sanitizeForPrompt(str, maxLength = 1000) {
  const clean = sanitizeString(str);
  // Truncate to maximum safe prompt length
  return clean.slice(0, maxLength);
}

// ── SCHEMAS ──
const adminLoginSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(100),
  password: z.string().min(1, 'Password required').max(128)
});

const clientInputSchema = z.object({
  business_name: z.string().trim().min(1, 'Business name required').max(100),
  category: z.string().trim().max(100).optional().default(''),
  description: z.string().trim().max(1000).optional().default(''),
  emoji: z.string().trim().max(255).optional().default('🏪'),
  place_id: z.string().trim().min(3, 'Google Place ID required').max(150),
  primary_color: z.string().trim().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color').optional().default('#7c4dff'),
  primary_theme: z.enum(['dark', 'light', 'system']).optional().default('dark'),
  allow_theme_toggle: z.union([z.string(), z.number()]).optional().transform(val => {
    return (val === 'off' || val === '0' || val === 0) ? 0 : 1;
  }),
  tags_input: z.string().max(10000).optional().default(''),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase alphanumeric and hyphens').optional(),
  active: z.union([z.string(), z.number()]).optional().transform(val => {
    return (val === 'on' || val === '1' || val === 1) ? 1 : 0;
  }),
  expiry_type: z.string().max(30).optional().default('unlimited'),
  custom_expires_at: z.string().max(40).optional().nullable()
});

const reviewGenerateSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).default(5),
  tags: z.array(z.string().max(200)).max(20).optional().default([]),
  previousText: z.string().max(2000).optional().default('')
});

const reviewSuggestSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).default(5),
  text: z.string().max(1000).optional().default('')
});

function validateBody(schema, isJson = true) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errorMsg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      if (isJson || req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(400).json({ ok: false, error: errorMsg });
      }
      // Form redirect with error query parameter
      const backUrl = req.header('Referer') || '/admin';
      const sep = backUrl.includes('?') ? '&' : '?';
      return res.redirect(`${backUrl}${sep}error=${encodeURIComponent(errorMsg)}`);
    }
    req.validData = result.data;
    next();
  };
}

module.exports = {
  sanitizeString,
  sanitizeForPrompt,
  adminLoginSchema,
  clientInputSchema,
  reviewGenerateSchema,
  reviewSuggestSchema,
  validateBody
};
