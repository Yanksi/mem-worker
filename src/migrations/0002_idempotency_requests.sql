CREATE TABLE memory_requests (
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  agent_id TEXT,
  run_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  result_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (user_id, idempotency_key)
);

CREATE INDEX memory_requests_status_updated_at_idx ON memory_requests (status, updated_at);
