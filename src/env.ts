export interface MemoryJob {
  type: 'extract-and-store';
  requestId: string;
  body: unknown;
}

export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  MEMORY_JOBS: Queue<MemoryJob>;
  OPENAI_API_KEY: string;
  MEM0_API_KEY: string;
  DASHBOARD_PASSWORD: string;
  EMBEDDING_MODEL: string;
  LLM_MODEL: string;
  LLM_API_BASE_URL?: string;
  EMBEDDING_API_BASE_URL?: string;
  VECTOR_DIMENSIONS: string;
  MEM0_INDEX_NAME: string;
}
