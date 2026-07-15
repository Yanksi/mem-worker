# Mem0-Compatible Entity-Linking Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transparently boost standard user-scoped memory search results using Mem0-style entity linking, while retaining semantic search as the only candidate generator.

**Architecture:** The existing extraction LLM supplies write-time entities. A new parallel Vectorize entity index stores their embeddings, and D1 retains entity-to-memory links. Search embeds the query once, gathers a larger bounded semantic candidate pool plus entity-index matches in parallel, resolves linked memory IDs through D1, and returns only the semantic candidates after deterministic score fusion.

**Tech Stack:** TypeScript, Hono, Cloudflare D1, Cloudflare Vectorize, OpenAI-compatible embeddings, Vitest, Wrangler.

---

## File Structure

- Modify `wrangler.toml` and `src/env.ts`: declare the `ENTITY_VECTORIZE` binding.
- Modify `src/vectorize.ts`: add entity-index search/upsert helpers and an expanded memory candidate-pool option.
- Modify `src/memory/service.ts`: persist entity vectors and fuse entity-linked candidates during user-scoped search.
- Modify `tests/vectorize.test.ts` and `tests/memories.test.ts`: cover Vectorize and service behavior.
- Modify `README.md`: document Mem0-compatible entity linking and entity-index provisioning.

### Task 1: Entity Index Binding and Vector Helpers

**Files:**
- Modify: `wrangler.toml`
- Modify: `src/env.ts`
- Modify: `src/vectorize.ts`
- Modify: `tests/vectorize.test.ts`

- [ ] **Step 1: Write failing Vectorize helper tests**

Add tests for an entity upsert record and entity search with an exact `user_id` metadata filter. Assert the helper queries `ENTITY_VECTORIZE` with `topK: 20`, metadata enabled, values disabled, and does not include agent/run/actor filters. Add a test that memory candidate search can request `limit: 5` yet query an internal pool of `50` candidates.

- [ ] **Step 2: Run focused test to verify red**

Run: `npm.cmd test -- tests/vectorize.test.ts`

Expected: failure because entity helper exports and candidate-pool control do not exist.

- [ ] **Step 3: Implement minimal binding and helpers**

Add the entity Vectorize binding:

```toml
[[vectorize]]
binding = "ENTITY_VECTORIZE"
index_name = "mem0-edge-entities"
```

Add `ENTITY_VECTORIZE: VectorizeIndex` to `Env`. In `src/vectorize.ts`, provide typed entity record/search helpers that use `user_id` metadata and constrain memory candidate retrieval to `min(50, requestedPool)`. Continue validating caller-provided metadata filters for memory search.

- [ ] **Step 4: Run focused test to verify green**

Run: `npm.cmd test -- tests/vectorize.test.ts`

Expected: pass.

- [ ] **Step 5: Commit binding/helpers**

```powershell
git add wrangler.toml src/env.ts src/vectorize.ts tests/vectorize.test.ts
git commit -m "feat: add entity Vectorize index helpers"
```

### Task 2: Write-Time Entity Vectors and Search Fusion

**Files:**
- Modify: `src/memory/service.ts`
- Modify: `tests/memories.test.ts`

- [ ] **Step 1: Write failing service tests**

Add tests demonstrating:

```ts
// An inferred, user-scoped memory creates/upserts its normalized extracted entity vector.
expect(upsertEntityVectors).toHaveBeenCalledWith(env.ENTITY_VECTORIZE, [
  expect.objectContaining({ id: expect.any(String), metadata: { user_id: 'user-123' } }),
]);

// Entity-linked semantic candidate is boosted above an otherwise higher semantic candidate.
// A memory absent from semantic candidates is never returned merely by entity linkage.
// Agent-scoped search remains semantic-only.
// Empty entity matches retain semantic score order.
```

Mock D1 link resolution and both Vectorize searches. Verify the query embedding is requested once and semantic/entity searches run through the shared vector helpers.

- [ ] **Step 2: Run focused test to verify red**

Run: `npm.cmd test -- tests/memories.test.ts`

Expected: failure because entity vectors are not stored and search has no score fusion.

- [ ] **Step 3: Implement write-time linking and fusion**

In `persistExtractedGraph`, after `persistEntity`, embed the normalized entity name and upsert a deterministic entity vector ID into `ENTITY_VECTORIZE`. Preserve D1 entity and memory-link writes. Do not create entity vectors for agent-only or `infer: false` memories.

Refactor `searchMemories` so a user-scoped request embeds its query once and requests a semantic pool of up to 50 candidates. In parallel, query the entity index with that embedding and resolve matching entity IDs to linked memory IDs using `memory_entity_links`. Add a bounded normalized entity boost only to IDs already in the semantic pool, sort on fused score with ID as a stable tie-breaker, then apply the requested limit. Agent-scoped requests retain the existing semantic search behavior.

- [ ] **Step 4: Run focused test to verify green**

Run: `npm.cmd test -- tests/memories.test.ts`

Expected: pass.

- [ ] **Step 5: Commit entity-linking retrieval**

```powershell
git add src/memory/service.ts tests/memories.test.ts
git commit -m "feat: boost memory search with linked entities"
```

### Task 3: Documentation and Full Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update documentation**

Document that entity linking mirrors Mem0's current entity-aware retrieval behavior: inferred user-scoped writes add entity vectors and links; ordinary `/v1/search` and `/v1/memories/search` transparently boost semantic candidates; entity links never create non-semantic results; agent-only/raw/imported memories remain semantic-only. Add creation commands for the `mem0-edge-entities` Vectorize index and its `user_id` metadata index, using the same configured dimensions and cosine metric as the main index.

- [ ] **Step 2: Run full verification**

Run: `npm.cmd test; npm.cmd run typecheck; git diff --check`

Expected: all Vitest suites pass, TypeScript exits `0`, and diff check has no output.

- [ ] **Step 3: Deploy prerequisites and Worker**

Create the entity index at the configured `VECTOR_DIMENSIONS`, create its `user_id` metadata index, deploy the Worker, and verify a user-scoped add/search smoke test. Do not add test memories to production unless explicitly approved; a read-only deployed health/dashboard check is safe by default.

- [ ] **Step 4: Commit and push**

```powershell
git add README.md
git commit -m "docs: describe entity-linked memory retrieval"
git push origin HEAD:main
git push cloudflare-deploy HEAD:main
```
