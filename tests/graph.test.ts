import { beforeEach, describe, expect, it, vi } from 'vitest';
import { entities, relationships } from '../src/db/schema';
import type { Env } from '../src/env';

const graphDependencies = vi.hoisted(() => ({
  createDb: vi.fn(),
}));

const service = vi.hoisted(() => ({
  listEntities: vi.fn(),
  getEntity: vi.fn(),
  listRelationships: vi.fn(),
}));

vi.mock('../src/db/client', () => ({ createDb: graphDependencies.createDb }));
vi.mock('../src/graph/service', () => service);

import worker from '../src/index';

const env = { MEM0_API_KEY: 'test-api-key' } as Env;
const authorization = { Authorization: 'Bearer test-api-key' };
const entity = {
  id: 'entity-123',
  user_id: 'user-123',
  name: 'Zurich',
  type: 'city',
  metadata: {},
  created_at: '2026-07-14T12:00:00.000Z',
  updated_at: '2026-07-14T12:00:00.000Z',
};
const relationship = {
  id: 'relationship-123',
  user_id: 'user-123',
  source_entity_id: 'entity-123',
  target_entity_id: 'entity-456',
  relation_type: 'located_in',
  confidence: 0.9,
  metadata: {},
  created_at: '2026-07-14T12:00:00.000Z',
  updated_at: '2026-07-14T12:00:00.000Z',
};

function request(path: string, init?: RequestInit): Request {
  return new Request(`https://example.com${path}`, init);
}

function createSelectDb() {
  const all = vi.fn().mockResolvedValue([]);
  const get = vi.fn().mockResolvedValue(undefined);
  const limit = vi.fn().mockReturnValue({ all });
  const orderBy = vi.fn().mockReturnValue({ all, limit });
  const where = vi.fn().mockReturnValue({ get, orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return {
    db: { select: vi.fn().mockReturnValue({ from }) },
    from,
    where,
    limit,
    all,
  };
}

function containsValue(value: unknown, expected: unknown, seen = new Set<unknown>()): boolean {
  if (value === expected) return true;
  if (typeof value !== 'object' || value === null || seen.has(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).some((key) => containsValue((value as Record<PropertyKey, unknown>)[key], expected, seen));
}

describe('graph service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds owner-scoped predicates for entity list and get queries', async () => {
    const query = createSelectDb();
    graphDependencies.createDb.mockReturnValue(query.db);
    const actual = await vi.importActual<typeof import('../src/graph/service')>('../src/graph/service');

    await actual.listEntities(env, 'user-123');
    await actual.getEntity(env, 'user-123', 'entity-123');

    expect(query.from).toHaveBeenNthCalledWith(1, entities);
    expect(query.from).toHaveBeenNthCalledWith(2, entities);
    expect(query.limit).toHaveBeenCalledWith(100);
    for (const predicate of query.where.mock.calls.map(([predicate]) => predicate)) {
      expect(containsValue(predicate, entities.userId)).toBe(true);
      expect(containsValue(predicate, 'user-123')).toBe(true);
    }
    expect(containsValue(query.where.mock.calls[1][0], entities.id)).toBe(true);
    expect(containsValue(query.where.mock.calls[1][0], 'entity-123')).toBe(true);
  });

  it('lists every owned entity for a complete dashboard graph', async () => {
    const query = createSelectDb();
    graphDependencies.createDb.mockReturnValue(query.db);
    const actual = await vi.importActual<typeof import('../src/graph/service')>('../src/graph/service');

    await actual.listAllEntities(env, 'user-123');

    expect(query.from).toHaveBeenCalledWith(entities);
    expect(query.limit).not.toHaveBeenCalled();
    expect(query.all).toHaveBeenCalledTimes(1);
    expect(containsValue(query.where.mock.calls[0][0], entities.userId)).toBe(true);
    expect(containsValue(query.where.mock.calls[0][0], 'user-123')).toBe(true);
  });

  it('filters relationships by owner and either source or target entity', async () => {
    const query = createSelectDb();
    graphDependencies.createDb.mockReturnValue(query.db);
    const actual = await vi.importActual<typeof import('../src/graph/service')>('../src/graph/service');

    await actual.listRelationships(env, 'user-123', 'entity-123');

    expect(query.from).toHaveBeenCalledWith(relationships);
    const predicate = query.where.mock.calls[0][0];
    expect(containsValue(predicate, relationships.userId)).toBe(true);
    expect(containsValue(predicate, 'user-123')).toBe(true);
    expect(containsValue(predicate, relationships.sourceEntityId)).toBe(true);
    expect(containsValue(predicate, relationships.targetEntityId)).toBe(true);
    expect(containsValue(predicate, 'entity-123')).toBe(true);
  });
});

describe('graph routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires API authentication', async () => {
    const response = await worker.fetch(request('/v1/entities?user_id=user-123'), env);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('lists entities in a result envelope', async () => {
    service.listEntities.mockResolvedValue([entity]);

    const response = await worker.fetch(request('/v1/entities?user_id=user-123', { headers: authorization }), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ results: [entity] });
    expect(service.listEntities).toHaveBeenCalledWith(env, 'user-123');
  });

  it('requires user_id for graph endpoints', async () => {
    const responses = await Promise.all([
      worker.fetch(request('/v1/entities', { headers: authorization }), env),
      worker.fetch(request('/v1/entities/entity-123', { headers: authorization }), env),
      worker.fetch(request('/v1/relationships', { headers: authorization }), env),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Validation failed' });
    }
    expect(service.listEntities).not.toHaveBeenCalled();
    expect(service.getEntity).not.toHaveBeenCalled();
    expect(service.listRelationships).not.toHaveBeenCalled();
  });

  it('returns 404 when an owned entity does not exist', async () => {
    service.getEntity.mockResolvedValue(null);

    const response = await worker.fetch(request('/v1/entities/missing?user_id=user-123', { headers: authorization }), env);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Entity not found' });
    expect(service.getEntity).toHaveBeenCalledWith(env, 'user-123', 'missing');
  });

  it('lists relationships filtered by an entity', async () => {
    service.listRelationships.mockResolvedValue([relationship]);

    const response = await worker.fetch(request('/v1/relationships?user_id=user-123&entity_id=entity-123', { headers: authorization }), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ results: [relationship] });
    expect(service.listRelationships).toHaveBeenCalledWith(env, 'user-123', 'entity-123');
  });

  it('lists all relationships for the user when no entity filter is supplied', async () => {
    service.listRelationships.mockResolvedValue([relationship]);

    const response = await worker.fetch(request('/v1/relationships?user_id=user-123', { headers: authorization }), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ results: [relationship] });
    expect(service.listRelationships).toHaveBeenCalledWith(env, 'user-123', undefined);
  });
});
