import { Hono } from 'hono';
import { ZodError } from 'zod';
import { apiAuth } from '../auth';
import type { Env } from '../env';
import {
  addMemory,
  deleteMemory,
  getMemory,
  listMemories,
  searchMemories,
  updateMemory,
} from '../memory/service';
import {
  AddMemoryRequestSchema,
  SearchMemoryRequestSchema,
  UpdateMemoryRequestSchema,
} from '../memory/types';

export const memoriesRoutes = new Hono<{ Bindings: Env }>();

memoriesRoutes.use('*', apiAuth);

memoriesRoutes.post('/', async (context) => {
  const request = await parseBody(context.req.raw, AddMemoryRequestSchema);
  if (request instanceof Response) return request;
  const result = await addMemory(context.env, request);
  return Array.isArray(result)
    ? context.json({ results: result })
    : context.json(result, 202);
});

memoriesRoutes.post('/search', async (context) => {
  const request = await parseBody(context.req.raw, SearchMemoryRequestSchema);
  if (request instanceof Response) return request;
  return context.json({ results: await searchMemories(context.env, request) });
});

memoriesRoutes.get('/', async (context) => {
  const userId = context.req.query('user_id');
  if (userId === undefined || userId.trim() === '') return validationError();
  const requestedLimit = Number(context.req.query('limit') ?? '100');
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100) : 100;
  return context.json({ results: await listMemories(context.env, userId, limit) });
});

memoriesRoutes.get('/:id', async (context) => {
  const userId = requiredUserId(context.req.query('user_id'));
  if (userId instanceof Response) return userId;
  const memory = await getMemory(context.env, context.req.param('id'), userId);
  return memory === null ? notFound(context) : context.json(memory);
});

memoriesRoutes.patch('/:id', async (context) => {
  const userId = requiredUserId(context.req.query('user_id'));
  if (userId instanceof Response) return userId;
  const request = await parseBody(context.req.raw, UpdateMemoryRequestSchema);
  if (request instanceof Response) return request;
  const memory = await updateMemory(context.env, context.req.param('id'), userId, request);
  return memory === null ? notFound(context) : context.json(memory);
});

memoriesRoutes.delete('/:id', async (context) => {
  const userId = requiredUserId(context.req.query('user_id'));
  if (userId instanceof Response) return userId;
  const deleted = await deleteMemory(context.env, context.req.param('id'), userId);
  return deleted ? context.json({ deleted: true }) : notFound(context);
});

async function parseBody<T>(request: Request, schema: { parse(value: unknown): T }): Promise<T | Response> {
  try {
    return schema.parse(await request.json());
  } catch (error) {
    return validationError(error instanceof ZodError ? error.issues : undefined);
  }
}

function validationError(details?: unknown): Response {
  return Response.json({ error: 'Validation failed', ...(details === undefined ? {} : { details }) }, { status: 400 });
}

function requiredUserId(userId: string | undefined): string | Response {
  return userId === undefined || userId.trim() === '' ? validationError() : userId;
}

function notFound(context: { json: (body: { error: string }, status: 404) => Response }): Response {
  return context.json({ error: 'Memory not found' }, 404);
}
