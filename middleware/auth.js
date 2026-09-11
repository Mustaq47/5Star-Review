function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  // If request is API / JSON, return 404
  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.status(404).json({ error: 'Not found' });
  }
  // Redirect unauthenticated visitors away to the review page so admin panel stays hidden
  res.redirect('/admin/login');
}

module.exports = { requireAuth };
