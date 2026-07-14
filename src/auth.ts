import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from './env';

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export function requireApiKey(context: Context<{ Bindings: Env }>): void {
  if (
    context.env.MEM0_API_KEY === '' ||
    (context.req.header('Authorization') !== `Bearer ${context.env.MEM0_API_KEY}`
      && context.req.header('X-API-Key') !== context.env.MEM0_API_KEY)
  ) {
    throw new UnauthorizedError();
  }
}

export const apiAuth: MiddlewareHandler<{ Bindings: Env }> = async (context, next) => {
  try {
    requireApiKey(context);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return context.json({ error: 'Unauthorized' }, 401);
    }

    throw error;
  }

  await next();
};

export function checkDashboardPassword(password: string, env: Env): boolean {
  return env.DASHBOARD_PASSWORD !== '' && password === env.DASHBOARD_PASSWORD;
}
