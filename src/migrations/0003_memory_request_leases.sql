ALTER TABLE memory_requests ADD COLUMN lease_token INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memory_requests ADD COLUMN candidates_json TEXT;
