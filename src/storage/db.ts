import pg from 'pg'
import { config } from '../config.js'

const { Pool } = pg
export const db = new Pool({ connectionString: config.databaseUrl, max: 10 })

export async function migrate(): Promise<void> {
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id BIGSERIAL PRIMARY KEY, source TEXT NOT NULL, file_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), is_active BOOLEAN NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id BIGSERIAL PRIMARY KEY, document_id BIGINT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL, content TEXT NOT NULL, embedding vector(${config.embeddingDim}) NOT NULL,
      UNIQUE(document_id, chunk_index)
    );
    CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
    CREATE TABLE IF NOT EXISTS knowledge_ingestion_runs (
      id BIGSERIAL PRIMARY KEY, source TEXT NOT NULL, file_hash TEXT NOT NULL, status TEXT NOT NULL,
      error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS retrieval_logs (
      id BIGSERIAL PRIMARY KEY, conversation_id UUID, query TEXT NOT NULL,
      result_count INTEGER NOT NULL, top_score REAL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS llm_logs (
      id BIGSERIAL PRIMARY KEY, conversation_id UUID, operation TEXT NOT NULL,
      duration_ms INTEGER NOT NULL, success BOOLEAN NOT NULL, error_type TEXT,
      prompt_tokens INTEGER, completion_tokens INTEGER, total_tokens INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY, scope TEXT NOT NULL, room_id TEXT, contact_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(scope, room_id, contact_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY, message_id TEXT UNIQUE, conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages(conversation_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS conversation_summaries (
      conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
      summary TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS access_users (
      contact_id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('allow','block','deny')),
      note TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS access_rooms (
      room_id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('allow','block','deny')),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS access_audit_logs (
      id BIGSERIAL PRIMARY KEY, admin_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)
}

export async function closeDb(): Promise<void> { await db.end() }
