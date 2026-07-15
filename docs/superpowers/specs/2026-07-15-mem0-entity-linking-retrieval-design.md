# Mem0-Compatible Entity-Linking Retrieval Design

## Goal

Make the Worker mirror current Mem0 OSS retrieval behavior: memories remain semantic-search candidates, while linked entities add a retrieval-ranking signal transparently to standard Hermes and native search requests.

## Upstream Compatibility Target

Current Mem0 OSS replaced its old traversable graph-store integration with entity linking and multi-signal retrieval. Entities are extracted and embedded during writes into a parallel entity collection; searches combine semantic candidates with entity matches, and entity matches boost candidate scores rather than adding unrelated memories or exposing graph traversal.

This Worker will implement the entity-linking portion of that behavior. BM25 and temporal scoring remain out of scope for this increment because D1 and Vectorize do not provide Mem0's native keyword-store adapters; semantic search continues to be the candidate generator.

## Architecture

### Entity Collection

Add a dedicated Cloudflare Vectorize entity index binding, `ENTITY_VECTORIZE`, with the same configured embedding dimensions as `VECTORIZE`. It is the Worker equivalent of Mem0's parallel `{collection}_entities` collection.

When a user-scoped memory is added with `infer: true`, reuse the entities already returned by the extraction LLM. Persist each normalized entity in D1 as today, link it to the memory as today, and upsert its embedding into `ENTITY_VECTORIZE` with metadata including `user_id` and an entity record marker. Agent-only memories remain unsupported for entity linking, consistent with the existing user-scoped graph-lite schema.

Imported and `infer: false` memories do not acquire entity links automatically, matching their raw-storage behavior.

### Search Fusion

For every user-scoped memory search:

1. Embed the query once.
2. In parallel, retrieve a bounded semantic candidate pool from `VECTORIZE` and entity matches from `ENTITY_VECTORIZE`, both scoped by `user_id`.
3. Resolve matching entity IDs through D1's `memory_entity_links` table.
4. Keep only semantic candidates. Add a deterministic entity-match boost to candidates linked to a matched entity, then sort by fused score and return the requested limit.

Entity matching never introduces a memory absent from the semantic candidate pool. If the entity index is unavailable, empty, or returns no matching links, search falls back to the current semantic ordering. Existing agent-scoped search remains semantic-only.

### Score Contract

The returned `score` becomes the fused search score. The formula and candidate-pool size are internal Worker constants, covered by tests. A stronger semantic result stays ahead unless the entity-link signal makes the linked candidate's fused score higher. Entity match scores are normalized before use so the boost remains bounded.

## Provisioning

Deployment adds an `ENTITY_VECTORIZE` binding. Operators must create the entity index with `VECTOR_DIMENSIONS` dimensions and create its `user_id` metadata index. The README and deploy configuration will state these steps clearly.

## Exclusions

- No graph traversal, relations array, entity/relationship CRUD, or graph search endpoint.
- No BM25 keyword index, temporal scoring, or full new Mem0 ADD-only extraction migration.
- No automatic graph inference for imports, raw `infer: false` writes, or agent-only memories.

## Tests

- Entity upserts occur only for inferred user-scoped writes and use the configured entity index.
- Search fuses linked entity candidates, preserves semantic-only candidates, and returns the requested limit in fused-score order.
- Entity matching cannot add non-semantic candidates or cross user boundaries.
- Empty/unavailable entity results retain current semantic behavior.
- Hermes `/v1/search` gains the behavior transparently because it already routes through the shared search service.
