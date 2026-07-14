import type { Env } from '../env';
import type { MemoryResponse } from '../memory/types';

const PAGE_SIZE = 50;

export type DashboardEntityType = 'user' | 'agent';

export interface DashboardEntity {
  entity_type: DashboardEntityType;
  entity_id: string;
  alias?: string;
  memory_count: number;
}

export interface DashboardMemoryPage {
  results: MemoryResponse[];
  next_offset?: number;
}

export async function listDashboardUsers(env: Env): Promise<DashboardEntity[]> {
  const query = `
    WITH scopes AS (
      SELECT DISTINCT 'user' AS entity_type, user_id AS entity_id FROM memories WHERE deleted_at IS NULL AND user_id IS NOT NULL
      UNION SELECT DISTINCT 'agent' AS entity_type, agent_id AS entity_id FROM memories WHERE deleted_at IS NULL AND agent_id IS NOT NULL
      UNION SELECT DISTINCT 'user' AS entity_type, user_id AS entity_id FROM entities
      UNION SELECT 'user' AS entity_type, user_id AS entity_id FROM user_aliases
    )
    SELECT scopes.entity_type, scopes.entity_id, user_aliases.alias,
      (SELECT COUNT(*) FROM memories WHERE deleted_at IS NULL AND
        ((scopes.entity_type = 'user' AND memories.user_id = scopes.entity_id) OR
         (scopes.entity_type = 'agent' AND memories.agent_id = scopes.entity_id))) AS memory_count
    FROM scopes
    LEFT JOIN user_aliases ON user_aliases.user_id = scopes.entity_id
    ORDER BY scopes.entity_type, COALESCE(user_aliases.alias, scopes.entity_id) COLLATE NOCASE
  `;
  const result = await env.DB.prepare(query).all<{ entity_type: DashboardEntityType; entity_id: string; alias: string | null; memory_count: number }>();
  return result.results.map((row) => ({
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    ...(row.alias === null ? {} : { alias: row.alias }),
    memory_count: row.memory_count,
  }));
}

export async function setDashboardUserAlias(env: Env, userId: string, alias: string): Promise<void> {
  const normalized = alias.trim();
  if (normalized === '') {
    await env.DB.prepare('DELETE FROM user_aliases WHERE user_id = ?').bind(userId).run();
    return;
  }

  await env.DB.prepare(`
    INSERT INTO user_aliases (user_id, alias) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET alias = excluded.alias, updated_at = unixepoch()
  `).bind(userId, normalized).run();
}

export async function listDashboardMemories(env: Env, entityType: DashboardEntityType, entityId: string, offset: number): Promise<DashboardMemoryPage> {
  const column = entityType === 'user' ? 'user_id' : 'agent_id';
  const result = await env.DB.prepare(`
    SELECT id, user_id, agent_id, run_id, actor_id, content, metadata_json, created_at, updated_at
    FROM memories
    WHERE ${column} = ? AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).bind(entityId, PAGE_SIZE + 1, offset).all<MemoryRow>();
  const rows = result.results.slice(0, PAGE_SIZE);
  return {
    results: rows.map(toMemoryResponse),
    ...(result.results.length > PAGE_SIZE ? { next_offset: offset + PAGE_SIZE } : {}),
  };
}

interface MemoryRow {
  id: string;
  user_id: string | null;
  agent_id: string | null;
  run_id: string | null;
  actor_id: string | null;
  content: string;
  metadata_json: string;
  created_at: number;
  updated_at: number;
}

function toMemoryResponse(row: MemoryRow): MemoryResponse {
  return {
    id: row.id,
    memory: row.content,
    ...(row.user_id === null ? {} : { user_id: row.user_id }),
    ...(row.agent_id === null ? {} : { agent_id: row.agent_id }),
    ...(row.run_id === null ? {} : { run_id: row.run_id }),
    ...(row.actor_id === null ? {} : { actor_id: row.actor_id }),
    metadata: parseMetadata(row.metadata_json),
    created_at: new Date(row.created_at * 1000).toISOString(),
    updated_at: new Date(row.updated_at * 1000).toISOString(),
  };
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
