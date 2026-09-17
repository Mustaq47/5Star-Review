import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';

describe('Public Review Flow & Review Engine APIs', () => {
  it('GET /r/:slug returns 404 for non-existent client slug', async () => {
    const res = await request(app).get('/r/non-existent-slug-xyz');
    expect(res.status).toBe(404);
    expect(res.text).toContain('Page not found');
  });

  it('GET /r/cool-and-spicy loads the review experience page', async () => {
    const res = await request(app).get('/r/cool-and-spicy');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Cool &amp; Spicy');
  }, 15000);

  it('GET /r/cool-and-spicy/tags returns tags for rating', async () => {
    const res = await request(app).get('/r/cool-and-spicy/tags?rating=5');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.tags)).toBe(true);
    expect(res.body.tags.length).toBeGreaterThan(0);
  }, 15000);

  it('POST /r/cool-and-spicy/generate generates a synthesized review', async () => {
    const res = await request(app)
      .post('/r/cool-and-spicy/generate')
      .send({
        rating: 5,
        tags: ['Ice Cream', 'Crispy Chicken'],
        previousText: ''
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.review).toBe('string');
    expect(res.body.review.length).toBeGreaterThan(10);
  }, 15000);

  it('POST /r/cool-and-spicy/suggest returns autocomplete predictions', async () => {
    const res = await request(app)
      .post('/r/cool-and-spicy/suggest')
      .send({
        rating: 5,
        text: 'The food was'
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.suggestion).toBeDefined();
  }, 15000);

  it('POST /r/cool-and-spicy/click records click metric without errors', async () => {
    const res = await request(app).post('/r/cool-and-spicy/click');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  }, 15000);
});
