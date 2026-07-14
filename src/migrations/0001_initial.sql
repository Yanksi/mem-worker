CREATE TABLE api_keys (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER,
  last_used_at INTEGER,
  revoked_at INTEGER
);

CREATE UNIQUE INDEX api_keys_key_hash_idx ON api_keys (key_hash);

CREATE TABLE memories (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  agent_id TEXT,
  run_id TEXT,
  actor_id TEXT,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at INTEGER
);

CREATE INDEX memories_user_agent_deleted_at_idx ON memories (user_id, agent_id, deleted_at);
CREATE INDEX memories_hash_idx ON memories (hash);

CREATE TABLE memory_history (
  id TEXT PRIMARY KEY NOT NULL,
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX memory_history_memory_created_at_idx ON memory_history (memory_id, created_at);

CREATE TABLE entities (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX entities_user_name_type_idx ON entities (user_id, name, type);

CREATE TABLE relationships (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  source_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  confidence REAL,
  evidence_memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX relationships_source_entity_idx ON relationships (source_entity_id);
CREATE INDEX relationships_target_entity_idx ON relationships (target_entity_id);
CREATE INDEX relationships_evidence_memory_idx ON relationships (evidence_memory_id);

CREATE TABLE memory_entity_links (
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (memory_id, entity_id)
);

CREATE INDEX memory_entity_links_entity_memory_idx ON memory_entity_links (entity_id, memory_id);
