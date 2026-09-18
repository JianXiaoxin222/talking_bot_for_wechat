import { randomUUID } from 'node:crypto'
import { db } from '../storage/db.js'
import { config } from '../config.js'
import { chat } from '../llm/client.js'
import type { MessageRecord } from '../types.js'

export class MemoryService {
  async conversation(scope: 'direct' | 'room', contactId: string, roomId?: string): Promise<string> {
    const existing = await db.query('SELECT id FROM conversations WHERE scope=$1 AND room_id IS NOT DISTINCT FROM $2 AND contact_id=$3', [scope, roomId ?? null, contactId])
    if (existing.rows[0]?.id) {
      await db.query('UPDATE conversations SET updated_at=now() WHERE id=$1', [existing.rows[0].id])
      return existing.rows[0].id
    }
    const result = await db.query('INSERT INTO conversations(id,scope,room_id,contact_id) VALUES($1,$2,$3,$4) RETURNING id', [randomUUID(), scope, roomId ?? null, contactId])
    return result.rows[0].id
  }

  async add(record: MessageRecord, messageId?: string): Promise<void> {
    await db.query(`INSERT INTO messages(message_id,conversation_id,sender_id,role,content) VALUES($1,$2,$3,$4,$5) ON CONFLICT(message_id) DO NOTHING`, [messageId ?? null, record.conversationId, record.senderId, record.role, record.content])
  }

  async context(conversationId: string): Promise<{ summary?: string; recent: MessageRecord[] }> {
    const [summary, messages] = await Promise.all([
      db.query('SELECT summary FROM conversation_summaries WHERE conversation_id=$1', [conversationId]),
      db.query(`SELECT sender_id,role,content,created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 12`, [conversationId]),
    ])
    return { summary: summary.rows[0]?.summary, recent: messages.rows.reverse().map(r => ({ conversationId, senderId: r.sender_id, role: r.role, content: r.content, createdAt: r.created_at })) }
  }

  async maybeSummarize(conversationId: string): Promise<void> {
    const result = await db.query(`SELECT role,content FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 20`, [conversationId])
    const total = await db.query('SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id=$1', [conversationId])
    const chars = result.rows.reduce((sum, row) => sum + String(row.content).length, 0)
    if ((total.rows[0]?.count ?? 0) < 20 && chars < 8000) return
    const summary = await chat([{ role: 'system', content: '请把以下聊天压缩成简洁、事实性的长期记忆摘要，不要添加不存在的信息。' }, { role: 'user', content: result.rows.reverse().map(r => `${r.role}: ${r.content}`).join('\n') }])
    await db.query(`INSERT INTO conversation_summaries(conversation_id,summary) VALUES($1,$2) ON CONFLICT(conversation_id) DO UPDATE SET summary=$2,updated_at=now()`, [conversationId, summary])
  }

  async cleanup(): Promise<void> {
    await db.query(`DELETE FROM messages WHERE created_at < now() - ($1::int * interval '1 day')`, [config.retentionDays])
    await db.query(`DELETE FROM conversation_summaries WHERE updated_at < now() - ($1::int * interval '1 day')`, [config.retentionDays])
  }
}
