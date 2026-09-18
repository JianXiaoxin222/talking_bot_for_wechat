import { migrate, closeDb } from './storage/db.js'
import { closeRedis } from './storage/redis.js'
import { KnowledgeService } from './knowledge/service.js'
import { MemoryService } from './memory/service.js'
import { AccessService } from './access/service.js'
import { createBot } from './wechat/bot.js'

async function main() {
  await migrate()
  const knowledge = new KnowledgeService()
  try { console.log('[knowledge] ingest', await knowledge.ingest()) } catch (error) { console.error('[knowledge] initial ingest failed', error) }
  const memory = new MemoryService()
  const access = new AccessService()
  const bot = createBot(knowledge, memory, access)
  const cleanupTimer = setInterval(() => void memory.cleanup().catch(error => console.error('[memory] cleanup error', error)), 24 * 60 * 60 * 1000)
  const shutdown = async () => { clearInterval(cleanupTimer); await bot.stop(); await closeRedis(); await closeDb(); process.exit(0) }
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown)
  await bot.start()
  console.log('[bot] started')
}

main().catch(error => { console.error('[fatal]', error); process.exit(1) })
