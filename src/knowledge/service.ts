import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { config } from '../config.js'
import { db } from '../storage/db.js'
import { redis } from '../storage/redis.js'
import { embed } from '../llm/client.js'
import { chunkText } from './chunker.js'
import type { RetrievedChunk } from '../types.js'

const vector = (values: number[]) => `[${values.join(',')}]`

export class KnowledgeService {
  async ingest(force = false): Promise<{ chunks: number; skipped: boolean }> {
    const text = await readFile(config.knowledgeFile, 'utf8')
    const hash = createHash('sha256').update(text).digest('hex')
    if (!force && (await db.query('SELECT 1 FROM knowledge_documents WHERE file_hash=$1 AND is_active=true', [hash])).rowCount) return { chunks: 0, skipped: true }
    if (!(await redis.set('lock:knowledge:ingest', '1', 'EX', 600, 'NX'))) throw new Error('知识库正在重载，请稍后再试')
    try {
      const chunks = chunkText(text)
      const embeddings: number[][] = []
      for (let i = 0; i < chunks.length; i += 32) embeddings.push(...await embed(chunks.slice(i, i + 32)))
      if (embeddings.some(item => item.length !== config.embeddingDim)) throw new Error(`Embedding 维度不匹配，期望 ${config.embeddingDim}`)
      const client = await db.connect()
      try {
        await client.query('BEGIN')
        const doc = await client.query('INSERT INTO knowledge_documents(source,file_hash,is_active) VALUES($1,$2,false) RETURNING id', [basename(config.knowledgeFile), hash])
        for (let i = 0; i < chunks.length; i++) await client.query('INSERT INTO knowledge_chunks(document_id,chunk_index,content,embedding) VALUES($1,$2,$3,$4::vector)', [doc.rows[0].id, i, chunks[i], vector(embeddings[i])])
        await client.query('UPDATE knowledge_documents SET is_active=false WHERE id<>$1', [doc.rows[0].id])
        await client.query('UPDATE knowledge_documents SET is_active=true WHERE id=$1', [doc.rows[0].id])
        await client.query('COMMIT')
        await client.query('DELETE FROM knowledge_documents WHERE is_active=false AND created_at < now() - interval \'1 day\'')
      } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
      return { chunks: chunks.length, skipped: false }
    } finally { await redis.del('lock:knowledge:ingest') }
  }

  async search(query: string): Promise<RetrievedChunk[]> {
    const [embedding] = await embed([query])
    const result = await db.query(`SELECT id, content, source, 1 - (embedding <=> $1::vector) AS score
      FROM knowledge_chunks c JOIN knowledge_documents d ON d.id=c.document_id AND d.is_active=true
      WHERE 1 - (embedding <=> $1::vector) >= $2 ORDER BY embedding <=> $1::vector LIMIT $3`, [vector(embedding), config.ragMinScore, config.ragTopK])
    return result.rows.map(row => ({ id: String(row.id), content: row.content, source: row.source, score: Number(row.score) }))
  }
}
