import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';

describe('System Health & Security Middleware', () => {
  it('GET /healthz returns 200 OK with uptime, memory, and timestamp', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.provider).toBe('firestore');
    expect(res.body.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(res.body.timestamp).toBeDefined();
  });

  it('Injects security headers on all responses', async () => {
    const res = await request(app).get('/healthz');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-xss-protection']).toBe('1; mode=block');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('Redirects unknown routes to default review experience', async () => {
    const res = await request(app).get('/non-existent-endpoint-12345');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/r/cool-and-spicy');
  });
});
