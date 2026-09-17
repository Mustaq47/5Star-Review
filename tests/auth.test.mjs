import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';

describe('Admin Authentication & Security', () => {
  it('GET /admin/login serves login page', async () => {
    const res = await request(app).get('/admin/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('ReviewPro Studio');
    expect(res.text).toContain('Admin Email');
  });

  it('POST /admin/login redirects with error on bad credentials', async () => {
    const res = await request(app)
      .post('/admin/login')
      .send({
        email: 'invalid@example.com',
        password: 'wrongpassword'
      });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/admin/login?error=');
  });

  it('GET /admin redirects unauthenticated users to /admin/login', async () => {
    const res = await request(app).get('/admin');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/login');
  });
});
