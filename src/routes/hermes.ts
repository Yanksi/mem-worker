import { Hono } from 'hono';
import { z, ZodError } from 'zod';
import { apiAuth } from '../auth';
import type { Env } from '../env';
import { addMemory, deleteMemory, getMemoryById, searchMemories, updateMemory } from '../memory/service';
import { AddMemoryRequestSchema } from '../memory/types';

const HermesSearchRequestSchema = z.object({
  query: z.string(),
  top_k: z.number().int().positive().max(50).default(10),
  filters: z.object({ user_id: z.string().trim().min(1) }).passthrough(),
});
const HermesUpdateRequestSchema = z.object({ text: z.string().trim().min(1) });

export const hermesRoutes = new Hono<{ Bindings: Env }>();

hermesRoutes.use('*', apiAuth);

hermesRoutes.post('/memories', async (context) => {
  const request = await parseBody(context.req.raw, AddMemoryRequestSchema);
  if (request instanceof Response) return request;
  const result = await addMemory(context.env, request);
  return Array.isArray(result)
    ? context.json({ results: result })
    : context.json(result, 202);
});

hermesRoutes.post('/search', async (context) => {
  const request = await parseBody(context.req.raw, HermesSearchRequestSchema);
  if (request instanceof Response) return request;
  const { user_id, ...filters } = request.filters;
  return context.json({
    results: await searchMemories(context.env, {
      query: request.query,
      user_id,
      limit: request.top_k,
      filters,
    }),
  });
});

hermesRoutes.put('/memories/:id', async (context) => {
  const request = await parseBody(context.req.raw, HermesUpdateRequestSchema);
  if (request instanceof Response) return request;
  const memory = await getMemoryById(context.env, context.req.param('id'));
  if (memory === null) return notFound(context);
  const updated = await updateMemory(context.env, memory.id, memory.user_id, { memory: request.text });
  return updated === null ? notFound(context) : context.json(updated);
});

hermesRoutes.delete('/memories/:id', async (context) => {
  const memory = await getMemoryById(context.env, context.req.param('id'));
  if (memory === null) return notFound(context);
  const deleted = await deleteMemory(context.env, memory.id, memory.user_id);
  return deleted ? context.json({ deleted: true }) : notFound(context);
});

async function parseBody<T>(request: Request, schema: { parse(value: unknown): T }): Promise<T | Response> {
  try {
    return schema.parse(await request.json());
  } catch (error) {
    return Response.json({
      error: 'Validation failed',
      ...(error instanceof ZodError ? { details: error.issues } : {}),
    }, { status: 400 });
  }
}

function notFound(context: { json: (body: { error: string }, status: 404) => Response }): Response {
  return context.json({ error: 'Memory not found' }, 404);
}
