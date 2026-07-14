import { Hono } from 'hono';
import { apiAuth } from '../auth';
import type { Env } from '../env';
import { getEntity, listEntities, listRelationships } from '../graph/service';

export const entitiesRoutes = new Hono<{ Bindings: Env }>();
export const relationshipsRoutes = new Hono<{ Bindings: Env }>();

entitiesRoutes.use('*', apiAuth);
relationshipsRoutes.use('*', apiAuth);

entitiesRoutes.get('/', async (context) => {
  const userId = requiredUserId(context.req.query('user_id'));
  if (userId instanceof Response) return userId;
  return context.json({ results: await listEntities(context.env, userId) });
});

entitiesRoutes.get('/:id', async (context) => {
  const userId = requiredUserId(context.req.query('user_id'));
  if (userId instanceof Response) return userId;
  const entity = await getEntity(context.env, userId, context.req.param('id'));
  return entity === null ? context.json({ error: 'Entity not found' }, 404) : context.json(entity);
});

relationshipsRoutes.get('/', async (context) => {
  const userId = requiredUserId(context.req.query('user_id'));
  if (userId instanceof Response) return userId;
  const entityId = context.req.query('entity_id');
  return context.json({ results: await listRelationships(context.env, userId, entityId) });
});

function requiredUserId(userId: string | undefined): string | Response {
  return userId === undefined || userId.trim() === ''
    ? Response.json({ error: 'Validation failed' }, { status: 400 })
    : userId;
}
