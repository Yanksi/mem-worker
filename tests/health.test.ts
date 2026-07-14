import { describe, expect, it } from 'vitest';
import worker from '../src/index';

describe('GET /health', () => {
  it('returns the mem0-edge service health response', async () => {
    const response = await worker.fetch(new Request('https://example.com/health'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: 'mem0-edge' });
  });
});
