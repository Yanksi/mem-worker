import { and, desc, eq, or } from 'drizzle-orm';
import { createDb } from '../db/client';
import { entities, relationships } from '../db/schema';
import type { Env } from '../env';

type EntityRow = typeof entities.$inferSelect;
type RelationshipRow = typeof relationships.$inferSelect;

export interface EntityResponse {
  id: string;
  user_id: string;
  name: string;
  type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RelationshipResponse {
  id: string;
  user_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  confidence?: number;
  evidence_memory_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function listEntities(env: Env, userId: string): Promise<EntityResponse[]> {
  const rows = await createDb(env.DB).select().from(entities).where(eq(entities.userId, userId))
    .orderBy(desc(entities.createdAt)).limit(100).all();
  return rows.map(toEntityResponse);
}

export async function listAllEntities(env: Env, userId: string): Promise<EntityResponse[]> {
  const rows = await createDb(env.DB).select().from(entities).where(eq(entities.userId, userId))
    .orderBy(desc(entities.createdAt)).all();
  return rows.map(toEntityResponse);
}

export async function getEntity(env: Env, userId: string, id: string): Promise<EntityResponse | null> {
  const row = await createDb(env.DB).select().from(entities).where(and(
    eq(entities.userId, userId),
    eq(entities.id, id),
  )).get();
  return row === undefined ? null : toEntityResponse(row);
}

export async function listRelationships(
  env: Env,
  userId: string,
  entityId?: string,
): Promise<RelationshipResponse[]> {
  const rows = await createDb(env.DB).select().from(relationships).where(and(
    eq(relationships.userId, userId),
    ...(entityId === undefined ? [] : [or(
      eq(relationships.sourceEntityId, entityId),
      eq(relationships.targetEntityId, entityId),
    )]),
  )).orderBy(desc(relationships.createdAt)).all();
  return rows.map(toRelationshipResponse);
}

function toEntityResponse(row: EntityRow): EntityResponse {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    type: row.type,
    metadata: parseMetadata(row.metadataJson),
    created_at: new Date(row.createdAt * 1000).toISOString(),
    updated_at: new Date(row.updatedAt * 1000).toISOString(),
  };
}

function toRelationshipResponse(row: RelationshipRow): RelationshipResponse {
  return {
    id: row.id,
    user_id: row.userId,
    source_entity_id: row.sourceEntityId,
    target_entity_id: row.targetEntityId,
    relation_type: row.relationType,
    ...(row.confidence === null ? {} : { confidence: row.confidence }),
    ...(row.evidenceMemoryId === null ? {} : { evidence_memory_id: row.evidenceMemoryId }),
    metadata: parseMetadata(row.metadataJson),
    created_at: new Date(row.createdAt * 1000).toISOString(),
    updated_at: new Date(row.updatedAt * 1000).toISOString(),
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
