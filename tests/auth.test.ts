import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { apiAuth, checkDashboardPassword, requireApiKey, UnauthorizedError } from '../src/auth';
import type { Env } from '../src/env';
import {
  AddMemoryRequestSchema,
  MemoryResponseSchema,
  SearchMemoryRequestSchema,
  UpdateMemoryRequestSchema,
} from '../src/memory/types';

const env = {
  MEM0_API_KEY: 'test-api-key',
  DASHBOARD_PASSWORD: 'dashboard-secret',
} as Env;

describe('dashboard password', () => {
  it('accepts only a nonempty exact configured password', () => {
    expect(checkDashboardPassword('dashboard-secret', env)).toBe(true);
    expect(checkDashboardPassword('', env)).toBe(false);
    expect(checkDashboardPassword('wrong-password', env)).toBe(false);
    expect(checkDashboardPassword('dashboard-secret', { ...env, DASHBOARD_PASSWORD: '' })).toBe(false);
  });
});

describe('API authentication', () => {
  it('requireApiKey directly throws UnauthorizedError for missing or non-exact bearer credentials', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.get('/check', (context) => {
      for (const authorization of [undefined, 'Bearer wrong-key', 'bearer test-api-key']) {
        context.req.raw.headers.delete('Authorization');
        if (authorization !== undefined) {
          context.req.raw.headers.set('Authorization', authorization);
        }

        expect(() => requireApiKey(context)).toThrow(UnauthorizedError);
        expect(() => requireApiKey(context)).toThrow('Unauthorized');
      }

      return context.text('checked');
    });

    const response = await app.fetch(new Request('https://example.com/check'), env);

    expect(response.status).toBe(200);
  });

  it('requireApiKey rejects Authorization: Bearer when the configured API key is empty', () => {
    const context = {
      req: { header: () => 'Bearer ' },
      env: { ...env, MEM0_API_KEY: '' },
    } as unknown as Parameters<typeof requireApiKey>[0];

    expect(() => requireApiKey(context)).toThrow(UnauthorizedError);
  });

  it('allows the exact bearer API key', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use('*', apiAuth);
    app.get('/protected', (context) => context.json({ ok: true }));

    const response = await app.fetch(
      new Request('https://example.com/protected', {
        headers: { Authorization: 'Bearer test-api-key' },
      }),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('allows the exact X-API-Key used by Hermes self-hosted requests', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use('*', apiAuth);
    app.get('/protected', (context) => context.json({ ok: true }));

    const allowed = await app.fetch(
      new Request('https://example.com/protected', { headers: { 'X-API-Key': 'test-api-key' } }),
      env,
    );
    const rejected = await app.fetch(
      new Request('https://example.com/protected', { headers: { 'X-API-Key': 'wrong-key' } }),
      env,
    );

    expect(allowed.status).toBe(200);
    expect(rejected.status).toBe(401);
  });

  it('returns 401 only when the bearer credential is missing or invalid', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use('*', apiAuth);
    app.get('/protected', (context) => context.json({ ok: true }));

    for (const authorization of [undefined, 'Bearer wrong-key', 'bearer test-api-key', 'Bearer test-api-key extra']) {
      const headers = authorization === undefined ? undefined : { Authorization: authorization };
      const response = await app.fetch(new Request('https://example.com/protected', { headers }), env);

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    }
  });

  it('preserves non-authentication errors', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use('*', apiAuth);
    app.get('/broken', () => {
      throw new Error('unexpected');
    });

    const response = await app.fetch(
      new Request('https://example.com/broken', {
        headers: { Authorization: 'Bearer test-api-key' },
      }),
      env,
    );

    expect(response.status).toBe(500);
  });
});

describe('memory request schemas', () => {
  it('parses add requests including request_id and defaults', () => {
    const result = AddMemoryRequestSchema.parse({
      request_id: 'request-123',
      messages: [{ role: 'user', content: 'Remember this.' }],
      user_id: 'user-123',
    });

    expect(result).toMatchObject({
      request_id: 'request-123',
      user_id: 'user-123',
      metadata: {},
      infer: true,
      async: false,
    });
  });

  it('requires nonempty message content, user IDs, and request IDs', () => {
    expect(() =>
      AddMemoryRequestSchema.parse({
        request_id: '',
        messages: [{ role: 'user', content: '' }],
        user_id: '',
      }),
    ).toThrow();
  });

  it('applies search defaults and validates limits', () => {
    expect(SearchMemoryRequestSchema.parse({ query: 'notes', user_id: 'user-123' })).toMatchObject({
      limit: 10,
      filters: {},
    });
    expect(() => SearchMemoryRequestSchema.parse({ query: 'notes', user_id: 'user-123', limit: 0 })).toThrow();
    expect(() => SearchMemoryRequestSchema.parse({ query: 'notes', user_id: 'user-123', limit: 51 })).toThrow();
  });

  it('accepts partial memory updates', () => {
    expect(UpdateMemoryRequestSchema.parse({ metadata: { source: 'test' } })).toEqual({
      metadata: { source: 'test' },
    });
  });

  it('rejects updates with neither memory nor metadata', () => {
    expect(() => UpdateMemoryRequestSchema.parse({})).toThrow();
  });

  it('parses memory responses with optional isolation IDs and score', () => {
    expect(
      MemoryResponseSchema.parse({
        id: 'memory-123',
        memory: 'Remember this.',
        user_id: 'user-123',
        agent_id: 'agent-123',
        run_id: 'run-123',
        actor_id: 'actor-123',
        score: 0.95,
        metadata: { source: 'test' },
        created_at: '2026-07-14T12:00:00.000Z',
        updated_at: '2026-07-14T12:00:00.000Z',
      }),
    ).toMatchObject({
      id: 'memory-123',
      score: 0.95,
      agent_id: 'agent-123',
    });
  });

  it('rejects memory responses missing required fields', () => {
    expect(() =>
      MemoryResponseSchema.parse({
        memory: 'Remember this.',
        user_id: 'user-123',
        metadata: {},
        created_at: '2026-07-14T12:00:00.000Z',
        updated_at: '2026-07-14T12:00:00.000Z',
      }),
    ).toThrow();
  });
});
