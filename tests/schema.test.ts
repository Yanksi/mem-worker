import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
// Vite supplies this raw asset transform during Vitest execution.
// @ts-expect-error -- this scaffold does not include Vite's client asset declarations.
import initialMigration from '../src/migrations/0001_initial.sql?raw';
// @ts-expect-error -- this scaffold does not include Vite's client asset declarations.
import idempotencyRequestsMigration from '../src/migrations/0002_idempotency_requests.sql?raw';
// @ts-expect-error -- this scaffold does not include Vite's client asset declarations.
import memoryRequestLeasesMigration from '../src/migrations/0003_memory_request_leases.sql?raw';
import {
  apiKeys,
  entities,
  memories,
  memoryRequests,
  memoryEntityLinks,
  memoryHistory,
  relationships,
} from '../src/db/schema';

describe('database schema', () => {
  it('exposes the core database column names', () => {
    expect(apiKeys.id.name).toBe('id');
    expect(memories.id.name).toBe('id');
    expect(entities.name.name).toBe('name');
    expect(relationships.relationType.name).toBe('relation_type');
    expect(memoryHistory.memoryId.name).toBe('memory_id');
  });

  it('uses memory and entity IDs as the composite link primary key', () => {
    const [primaryKey] = getTableConfig(memoryEntityLinks).primaryKeys;

    expect(primaryKey.columns.map((column) => column.name)).toEqual([
      'memory_id',
      'entity_id',
    ]);
  });

  it('uses the user ID and idempotency key as the request ledger primary key', () => {
    const [primaryKey] = getTableConfig(memoryRequests).primaryKeys;

    expect(primaryKey.columns.map((column) => column.name)).toEqual([
      'user_id',
      'idempotency_key',
    ]);
  });

  it('declares the named unique indexes in the Drizzle schema', () => {
    const apiKeyIndexes = getTableConfig(apiKeys).indexes.map((index) => index.config);
    const entityIndexes = getTableConfig(entities).indexes.map((index) => index.config);

    expect(apiKeyIndexes).toContainEqual(
      expect.objectContaining({ name: 'api_keys_key_hash_idx', unique: true }),
    );
    expect(entityIndexes).toContainEqual(
      expect.objectContaining({ name: 'entities_user_name_type_idx', unique: true }),
    );
  });

  it('declares the request ledger status index in the Drizzle schema', () => {
    const indexes = getTableConfig(memoryRequests).indexes.map((index) => index.config);

    expect(indexes).toContainEqual(
      expect.objectContaining({
        name: 'memory_requests_status_updated_at_idx',
        unique: false,
      }),
    );
  });

  it('declares the required named unique indexes and composite link key in the migration', () => {
    expect(initialMigration).toContain(
      'CREATE UNIQUE INDEX api_keys_key_hash_idx ON api_keys (key_hash);',
    );
    expect(initialMigration).toContain(
      'CREATE UNIQUE INDEX entities_user_name_type_idx ON entities (user_id, name, type);',
    );
    expect(initialMigration).toContain('PRIMARY KEY (memory_id, entity_id)');
  });

  it('keeps the idempotency request migration aligned with the Drizzle schema', () => {
    expect(Object.values(memoryRequests).map((column) => column.name)).toEqual([
      'user_id',
      'idempotency_key',
      'agent_id',
      'run_id',
      'status',
      'result_json',
      'error_message',
      'created_at',
      'updated_at',
      'completed_at',
      'lease_token',
      'candidates_json',
    ]);
    expect(idempotencyRequestsMigration).toContain('CREATE TABLE memory_requests (');
    expect(idempotencyRequestsMigration).toContain('PRIMARY KEY (user_id, idempotency_key)');
    expect(idempotencyRequestsMigration).toContain(
      'CREATE INDEX memory_requests_status_updated_at_idx ON memory_requests (status, updated_at);',
    );
    expect(idempotencyRequestsMigration).toContain(
      "status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed'))",
    );
  });

  it('declares fenced-processing columns with the lease default in the Drizzle schema', () => {
    expect(memoryRequests.leaseToken.name).toBe('lease_token');
    expect(memoryRequests.leaseToken.notNull).toBe(true);
    expect(memoryRequests.leaseToken.default).toBe(0);
    expect(memoryRequests.candidatesJson.name).toBe('candidates_json');
    expect(memoryRequests.candidatesJson.notNull).toBe(false);
    expect(memoryRequests.candidatesJson.default).toBeUndefined();
  });

  it('keeps the lease migration aligned with the Drizzle schema', () => {
    expect(memoryRequestLeasesMigration).toContain(
      'ALTER TABLE memory_requests ADD COLUMN lease_token INTEGER NOT NULL DEFAULT 0;',
    );
    expect(memoryRequestLeasesMigration).toContain(
      'ALTER TABLE memory_requests ADD COLUMN candidates_json TEXT;',
    );
  });
});
