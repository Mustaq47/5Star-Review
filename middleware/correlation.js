const crypto = require('crypto');

function correlationMiddleware(req, res, next) {
  const reqId = req.headers['x-request-id'] || `req_${crypto.randomUUID().slice(0, 12)}`;
  req.id = reqId;
  res.setHeader('X-Request-ID', reqId);
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'test') {
      const logObj = {
        time: new Date().toISOString(),
        reqId,
        method: req.method,
        url: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs: duration,
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
      };
      if (res.statusCode >= 500) {
        console.error(JSON.stringify({ ...logObj, level: 'ERROR' }));
      } else if (res.statusCode >= 400) {
        console.warn(JSON.stringify({ ...logObj, level: 'WARN' }));
      }
    }
  });

  next();
}

module.exports = { correlationMiddleware };
