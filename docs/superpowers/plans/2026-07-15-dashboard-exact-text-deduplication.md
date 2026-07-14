# Dashboard Exact-Text Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a signed-dashboard-only tool that previews and removes active, exact-text duplicate memories within one selected user or agent entity.

**Architecture:** Dashboard service functions query D1 for duplicate groups and deterministic removal IDs. The route authorizes and scopes requests, deletes those vector IDs first, then soft-deletes the same D1 records. The server-rendered dashboard consumes those endpoints with an explicit confirmation and refreshes entity/memory state after cleanup.

**Tech Stack:** TypeScript, Hono, Cloudflare D1, Cloudflare Vectorize, Vitest, Wrangler.

---

## File Structure

- Modify `src/dashboard/service.ts`: define the deduplication summary type; implement scoped preview, duplicate-ID selection, and soft-deletion SQL.
- Modify `src/routes/dashboard.ts`: add signed-session summary and cleanup endpoints and coordinate Vectorize/D1 operations.
- Modify `src/vectorize.ts`: add a batch vector deletion wrapper.
- Modify `src/dashboard/page.ts`: add a dashboard navigation view and confirmation-driven browser behavior.
- Modify `tests/dashboard-api.test.ts`: test the dashboard HTTP contract and authorization.
- Modify `tests/dashboard.test.ts`: test rendered dashboard navigation and client contract.
- Modify `tests/vectorize.test.ts`: test batch vector deletion.
- Create `tests/dashboard-service.test.ts`: test real dashboard service D1 queries with user/agent scopes, exact text, ordering, and idempotency.
- Modify `README.md`: include deduplication in the supported dashboard functionality and describe its precise limits.

### Task 1: Service and Vectorize Primitives

**Files:**
- Create: `tests/dashboard-service.test.ts`
- Modify: `tests/vectorize.test.ts`
- Modify: `src/dashboard/service.ts`
- Modify: `src/vectorize.ts`

- [ ] **Step 1: Write the failing D1 service tests**

Add fixtures for one user and one agent with active records that include: two identical records created at different times, two identical records created at the same time but different IDs, an identical record owned by another entity, a whitespace-variant record, and a soft-deleted duplicate. Assert the following desired API:

```ts
const summary = await getDashboardDeduplicationSummary(env, 'user', 'user-1');
expect(summary).toEqual({
  duplicate_groups: 2,
  removable_memories: 2,
  previews: [
    { memory: 'Duplicate text', duplicate_count: 2 },
    { memory: 'Tie break text', duplicate_count: 2 },
  ],
});

const candidates = await listDashboardDuplicateMemoryIds(env, 'user', 'user-1');
expect(candidates).toEqual(['later-id', 'z-id']);
expect(await softDeleteDashboardMemories(env, 'user', 'user-1', candidates)).toBe(2);
```

Assert that `later-id` and `z-id` are soft-deleted, the oldest/tie-breaker `a-id` records remain active, history rows remain, rerunning candidate selection returns `[]`, and an agent invocation never touches user records.

- [ ] **Step 2: Write the failing batch Vectorize test**

Extend `tests/vectorize.test.ts` with:

```ts
await deleteVectors(index, ['duplicate-1', 'duplicate-2']);
expect(index.deleteByIds).toHaveBeenCalledWith(['duplicate-1', 'duplicate-2']);
```

- [ ] **Step 3: Run the focused tests to verify red**

Run: `npm.cmd test -- tests/dashboard-service.test.ts tests/vectorize.test.ts`

Expected: failure because `getDashboardDeduplicationSummary`, `listDashboardDuplicateMemoryIds`, `softDeleteDashboardMemories`, and `deleteVectors` are not exported yet.

- [ ] **Step 4: Implement the minimal service and Vectorize functions**

In `src/dashboard/service.ts`, add these exported contracts:

```ts
export interface DashboardDeduplicationSummary {
  duplicate_groups: number;
  removable_memories: number;
  previews: Array<{ memory: string; duplicate_count: number }>;
}

export async function getDashboardDeduplicationSummary(
  env: Env, entityType: DashboardEntityType, entityId: string,
): Promise<DashboardDeduplicationSummary> { /* D1 exact-text aggregate */ }

export async function listDashboardDuplicateMemoryIds(
  env: Env, entityType: DashboardEntityType, entityId: string,
): Promise<string[]> { /* D1 ordered duplicate selection */ }

export async function softDeleteDashboardMemories(
  env: Env, entityType: DashboardEntityType, entityId: string, ids: string[],
): Promise<number> { /* scoped D1 soft-delete */ }
```

Use the fixed scope column (`user_id` or `agent_id`), `deleted_at IS NULL`, `GROUP BY content HAVING COUNT(*) > 1`, a preview limit of 10 ordered by `content COLLATE NOCASE`, and a window `ROW_NUMBER() OVER (PARTITION BY content ORDER BY created_at ASC, id ASC)` to identify duplicates. Select only row numbers greater than one. The soft-delete update must constrain both the selected entity scope and selected IDs, set `deleted_at = unixepoch()`, and return the D1 changes count.

In `src/vectorize.ts`, add:

```ts
export function deleteVectors(index: VectorizeIndex, ids: string[]) {
  return index.deleteByIds(ids);
}
```

- [ ] **Step 5: Run focused tests to verify green**

Run: `npm.cmd test -- tests/dashboard-service.test.ts tests/vectorize.test.ts`

Expected: both files pass.

- [ ] **Step 6: Commit the primitive layer**

```powershell
git add src/dashboard/service.ts src/vectorize.ts tests/dashboard-service.test.ts tests/vectorize.test.ts
git commit -m "feat: add exact-text memory deduplication service"
```

### Task 2: Signed Dashboard API

**Files:**
- Modify: `tests/dashboard-api.test.ts`
- Modify: `src/routes/dashboard.ts`

- [ ] **Step 1: Write failing dashboard API tests**

Extend the dashboard-service mock with `getDashboardDeduplicationSummary`, `listDashboardDuplicateMemoryIds`, and `softDeleteDashboardMemories`; mock `deleteVectors`. Add tests that verify:

```ts
GET /dashboard/api/deduplication?entity_type=agent&entity_id=hermes
// -> { duplicate_groups: 1, removable_memories: 2, previews: [...] }

POST /dashboard/api/deduplication
{ "entity_type": "user", "entity_id": "discord:42", "confirm": true }
// -> { removed: 2 }
```

Assert unauthenticated requests return `401`; malformed scope or missing `confirm: true` returns `400`; vector deletion is called before the D1 cleanup function; a cleanup returns only `removed`, never vector IDs; and the selected agent/user scope is passed unchanged.

- [ ] **Step 2: Run the focused API test to verify red**

Run: `npm.cmd test -- tests/dashboard-api.test.ts`

Expected: failure because the deduplication endpoints and imports do not exist.

- [ ] **Step 3: Implement the routes**

Import `getDashboardDeduplicationSummary`, `listDashboardDuplicateMemoryIds`, `softDeleteDashboardMemories`, and `deleteVectors`. Add:

```ts
dashboardRoutes.get('/api/deduplication', async (context) => {
  const scope = dashboardScope(context.req.query('entity_type'), context.req.query('entity_id'), context.req.query('user_id'));
  if (scope === undefined) return context.json({ error: 'Validation failed' }, 400);
  return context.json(await getDashboardDeduplicationSummary(context.env, scope.entityType, scope.entityId));
});

dashboardRoutes.post('/api/deduplication', async (context) => {
  const body = await context.req.json<{ entity_type?: unknown; entity_id?: unknown; confirm?: unknown }>().catch(() => null);
  const scope = body === null ? undefined : dashboardScope(body.entity_type, body.entity_id, undefined);
  if (scope === undefined || body?.confirm !== true) return context.json({ error: 'Validation failed' }, 400);
  const vectorIds = await listDashboardDuplicateMemoryIds(context.env, scope.entityType, scope.entityId);
  await deleteVectors(context.env.VECTOR_INDEX, vectorIds);
  const removed = await softDeleteDashboardMemories(context.env, scope.entityType, scope.entityId, vectorIds);
  return context.json({ removed });
});
```

The route must obtain deterministic IDs without changing D1, call `deleteVectors`, then perform the scoped soft deletion using those exact IDs. It returns only `{ removed }`.

- [ ] **Step 4: Run the focused API test to verify green**

Run: `npm.cmd test -- tests/dashboard-api.test.ts`

Expected: pass.

- [ ] **Step 5: Commit the dashboard API**

```powershell
git add src/routes/dashboard.ts tests/dashboard-api.test.ts src/dashboard/service.ts
git commit -m "feat: add dashboard deduplication API"
```

### Task 3: Dashboard Experience and Documentation

**Files:**
- Modify: `tests/dashboard.test.ts`
- Modify: `src/dashboard/page.ts`
- Modify: `README.md`

- [ ] **Step 1: Write failing dashboard-render tests**

Add assertions that the authenticated page contains:

```ts
expect(html).toContain('data-view="deduplicate"');
expect(html).toContain('id="deduplication-summary"');
expect(html).toContain('/dashboard/api/deduplication');
expect(html).toContain('window.confirm');
```

- [ ] **Step 2: Run the focused render test to verify red**

Run: `npm.cmd test -- tests/dashboard.test.ts`

Expected: failure because the deduplication view and client behavior are absent.

- [ ] **Step 3: Implement the dashboard view**

In `src/dashboard/page.ts`:

- Add a **Deduplicate memories** navigation button after **All memories**.
- Add a view with a status line, `id="deduplication-summary"` preview container, and a disabled primary action button.
- Extend `labels` with a concise description.
- Add `loadDeduplication()` that fetches the selected scope summary, shows group/removal counts and up to ten previewed exact texts via `textContent`, and disables the action at zero removable memories.
- Add `deduplicateMemories()` that calls `window.confirm` with the selected count, POSTs `{ entity_type, entity_id, confirm: true }`, displays the removed count, then calls `loadUsers()` and `loadDeduplication()`.
- Call `loadDeduplication()` when the view opens and after the entity selector changes if that view is active.

Update `README.md` to list the dashboard cleanup feature under **Included** and describe that it is manually confirmed, exact-text only, scope-bound, keeps the oldest active record, soft-deletes later records, and does not alter history or do semantic merging.

- [ ] **Step 4: Run focused UI/render tests to verify green**

Run: `npm.cmd test -- tests/dashboard.test.ts`

Expected: pass.

- [ ] **Step 5: Run complete verification**

Run: `npm.cmd test; npm.cmd run typecheck; git diff --check`

Expected: all Vitest suites pass, TypeScript exits `0`, and `git diff --check` has no output.

- [ ] **Step 6: Commit the dashboard and docs**

```powershell
git add src/dashboard/page.ts tests/dashboard.test.ts README.md
git commit -m "feat: add dashboard memory deduplication"
```

### Task 4: Deploy and Smoke Test

**Files:**
- No source changes expected.

- [ ] **Step 1: Inspect the final diff and status**

Run: `git status --short; git log --oneline -3`

Expected: only intended commits/files are present; the three local JSON export files remain untracked.

- [ ] **Step 2: Deploy the Worker**

Run: `npm.cmd run deploy`

Expected: Wrangler reports a new deployed Worker version for `https://mem0.yanksi.li`.

- [ ] **Step 3: Conduct an authenticated production smoke test**

Sign in using the existing dashboard password from `.env`, choose a known test entity with exact duplicates, verify the preview, confirm cleanup, and verify the active-memory count decreases by the reported amount. Do not run cleanup against production data unless the preview identifies only intentionally testable duplicates or the user separately approves that destructive action.

- [ ] **Step 4: Push both deployment repositories**

Run:

```powershell
git push origin HEAD:main
git push cloudflare-deploy HEAD:main
```

Expected: both repositories advance `main` to the verified implementation commit.
