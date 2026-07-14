import { createDb } from '../db/client';
import { memories, memoryHistory } from '../db/schema';
import type { Env, Mem0ImportJob, ReclassifyMem0AgentJob } from '../env';
import { embedText } from '../llm';
import { sha256Hex } from '../memory/idempotency';
import { upsertVectors } from '../vectorize';
import {
  RawMemoryMigrationExport,
  RawMemoryMigrationItem,
  type RawMemoryMigrationExport as RawMemoryMigrationExportType,
  type DashboardEntityScope,
} from './types';

export { RawMemoryMigrationExport } from './types';

export function isMem0ImportJob(value: unknown): value is Mem0ImportJob {
  if (typeof value !== 'object' || value === null) return false;
  const job = value as Partial<Mem0ImportJob>;
  return job.type === 'import-mem0-memory'
    && typeof job.requestId === 'string'
    && job.requestId.length > 0
    && ((typeof job.entityId === 'string' && job.entityId.trim().length > 0 && (job.entityType === 'user' || job.entityType === 'agent'))
      || (typeof job.userId === 'string' && job.userId.trim().length > 0))
    && RawMemoryMigrationItem.safeParse(job.item).success;
}

export function isReclassifyMem0AgentJob(value: unknown): value is ReclassifyMem0AgentJob {
  if (typeof value !== 'object' || value === null) return false;
  const job = value as Partial<ReclassifyMem0AgentJob>;
  return job.type === 'reclassify-mem0-agent'
    && typeof job.id === 'string' && job.id.length > 0
    && typeof job.sourceUserId === 'string' && job.sourceUserId.trim().length > 0
    && typeof job.agentId === 'string' && job.agentId.trim().length > 0
    && typeof job.content === 'string'
    && typeof job.metadataJson === 'string';
}

export async function enqueueMem0Import(
  env: Env,
  scope: DashboardEntityScope,
  exportPayload: RawMemoryMigrationExportType,
): Promise<number> {
  const exportId = await sha256Hex(JSON.stringify({ entity_type: scope.entityType, entity_id: scope.entityId, export: exportPayload }));

  await Promise.all(exportPayload.memories.map(async (item, index) => {
    const requestId = await sha256Hex(`${scope.entityType}:${scope.entityId}:${exportId}:${index}`);
    await env.MEMORY_JOBS.send({
      type: 'import-mem0-memory',
      requestId,
      entityType: scope.entityType,
      entityId: scope.entityId,
      item,
    });
  }));

  return exportPayload.memories.length;
}

export async function processMem0ImportJob(env: Env, job: Mem0ImportJob): Promise<void> {
  const scope = importScope(job);
  const db = createDb(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const sourceCreatedAt = job.item.created_at ?? null;
  const sourceUpdatedAt = job.item.updated_at ?? null;
  const createdAt = sourceUnixTimestamp(sourceCreatedAt) ?? sourceUnixTimestamp(sourceUpdatedAt) ?? now;
  const updatedAt = sourceUnixTimestamp(sourceUpdatedAt) ?? createdAt;
  const metadata = {
    source: 'mem0-import',
    source_created_at: sourceCreatedAt,
    source_updated_at: sourceUpdatedAt,
  };
  const vectorMetadata = {
    ...(scope.entityType === 'user' ? { user_id: scope.entityId } : { agent_id: scope.entityId }),
    source: metadata.source,
    ...(metadata.source_created_at === null ? {} : { source_created_at: metadata.source_created_at }),
    ...(metadata.source_updated_at === null ? {} : { source_updated_at: metadata.source_updated_at }),
  };
  const embedding = await embedText(env, job.item.memory);

  await db.insert(memories).values({
    id: job.requestId,
    userId: scope.entityType === 'user' ? scope.entityId : null,
    agentId: scope.entityType === 'agent' ? scope.entityId : null,
    runId: null,
    actorId: null,
    content: job.item.memory,
    metadataJson: JSON.stringify(metadata),
    hash: job.requestId,
    createdAt,
    updatedAt,
    deletedAt: null,
  }).onConflictDoNothing().run();

  await db.insert(memoryHistory).values({
    id: `${job.requestId}:import`,
    memoryId: job.requestId,
    operation: 'ADD',
    content: job.item.memory,
    metadataJson: JSON.stringify(metadata),
    hash: job.requestId,
    createdAt,
  }).onConflictDoNothing().run();

  await upsertVectors(env.VECTORIZE, [{
    id: job.requestId,
    values: embedding,
    metadata: vectorMetadata,
  }]);
}

export async function enqueueMem0AgentReclassification(env: Env, sourceUserId: string, agentId: string): Promise<number> {
  const result = await env.DB.prepare(`
    SELECT id, content, metadata_json
    FROM memories
    WHERE user_id = ? AND deleted_at IS NULL
  `).bind(sourceUserId).all<{ id: string; content: string; metadata_json: string }>();

  await Promise.all(result.results.map((row) => env.MEMORY_JOBS.send({
    type: 'reclassify-mem0-agent',
    id: row.id,
    sourceUserId,
    agentId,
    content: row.content,
    metadataJson: row.metadata_json,
  })));
  return result.results.length;
}

export async function processMem0AgentReclassificationJob(env: Env, job: ReclassifyMem0AgentJob): Promise<void> {
  const metadata = scalarMetadata(job.metadataJson);
  const embedding = await embedText(env, job.content);
  await env.DB.prepare(`
    UPDATE memories
    SET user_id = NULL, agent_id = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).bind(job.agentId, job.id, job.sourceUserId).run();
  await upsertVectors(env.VECTORIZE, [{
    id: job.id,
    values: embedding,
    metadata: { ...metadata, agent_id: job.agentId },
  }]);
}

function importScope(job: Mem0ImportJob): DashboardEntityScope {
  if (job.entityId !== undefined && (job.entityType === 'user' || job.entityType === 'agent')) {
    return { entityType: job.entityType, entityId: job.entityId };
  }
  if (job.userId !== undefined) return { entityType: 'user', entityId: job.userId };
  throw new Error('Invalid Mem0 import entity scope');
}

function scalarMetadata(value: string): Record<string, VectorizeVectorMetadataValue> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, item]) => (
      typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
    ))) as Record<string, VectorizeVectorMetadataValue>;
  } catch {
    return {};
  }
}

function sourceUnixTimestamp(value: string | null): number | undefined {
  if (value === null) return undefined;
  return Math.floor(Date.parse(value) / 1000);
}
