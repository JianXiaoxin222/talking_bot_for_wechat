import 'dotenv/config'

const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const number = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric environment variable: ${name}`)
  return parsed
}

export const config = {
  databaseUrl: required('DATABASE_URL', 'postgres://wechaty:change-me@postgres:5432/wechaty'),
  redisUrl: required('REDIS_URL', 'redis://redis:6379'),
  puppetToken: process.env.WECHATY_PUPPET_SERVICE_TOKEN ?? '',
  llmBaseUrl: required('LLM_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, ''),
  llmApiKey: process.env.LLM_API_KEY ?? '',
  llmModel: required('LLM_MODEL', 'gpt-4o-mini'),
  embeddingBaseUrl: required('EMBEDDING_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, ''),
  embeddingApiKey: process.env.EMBEDDING_API_KEY ?? process.env.LLM_API_KEY ?? '',
  embeddingModel: required('EMBEDDING_MODEL', 'text-embedding-3-small'),
  embeddingDim: number('EMBEDDING_DIM', 1536),
  knowledgeFile: required('KNOWLEDGE_FILE', '/app/knowledge/knowledge.txt'),
  admins: new Set((process.env.ADMIN_CONTACT_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)),
  retentionDays: number('MEMORY_RETENTION_DAYS', 30),
  rateLimit: number('MESSAGE_RATE_LIMIT', 20),
  rateWindowSeconds: number('MESSAGE_RATE_WINDOW_SECONDS', 60),
  ragTopK: number('RAG_TOP_K', 5),
  ragMinScore: number('RAG_MIN_SCORE', 0.75),
  llmGlobalConcurrency: number('LLM_GLOBAL_CONCURRENCY', 4),
  llmPerUserConcurrency: number('LLM_PER_USER_CONCURRENCY', 1),
  ragMaxChars: number('RAG_MAX_CHARS', 6000),
}
