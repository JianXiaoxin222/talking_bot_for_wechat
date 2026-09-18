import { WechatyBuilder } from 'wechaty'
import { config } from '../config.js'
import { AccessService } from '../access/service.js'
import { KnowledgeService } from '../knowledge/service.js'
import { MemoryService } from '../memory/service.js'
import { once, limited, withSemaphore } from '../storage/redis.js'
import { db } from '../storage/db.js'
import { buildPrompt } from '../llm/prompt.js'
import { chatDetailed } from '../llm/client.js'

export function createBot(knowledge: KnowledgeService, memory: MemoryService, access: AccessService) {
  const bot: any = WechatyBuilder.build({ name: 'wechaty-rag-bot', puppet: 'wechaty-puppet-service', puppetOptions: { token: config.puppetToken } } as any)
  bot.on('scan', (_qrcode: string, status: number) => console.log(`[wechaty] scan status=${status}`))
  bot.on('login', (user: any) => console.log(`[wechaty] login ${user}`))
  bot.on('logout', (user: any) => console.log(`[wechaty] logout ${user}`))
  bot.on('error', (error: unknown) => console.error('[wechaty] error', error))
  bot.on('message', async (msg: any) => {
    try {
      const messageType = String(msg.type?.() ?? '')
      if (msg.self?.() || !(messageType === 'MessageType.Text' || messageType === 'Text' || messageType.endsWith('.Text'))) return
      const talker = msg.talker?.()
      const contactId = String(talker?.id ?? '')
      const room = msg.room?.()
      const roomId = room ? String(room.id) : undefined
      const text = String(msg.text?.() ?? '').trim()
      if (!contactId || !text) return
      if (access.isAdmin(contactId) && text.startsWith('!bot ')) {
        const command = text.slice(5).trim()
        if (command === 'kb reload') {
          const result = await knowledge.ingest(true)
          await msg.say(`知识库重载完成，共 ${result.chunks} 个片段。`)
        } else await msg.say(await access.execute(contactId, command))
        return
      }
      if (roomId && !(await msg.mentionSelf?.())) return
      const normalizedText = roomId ? text.replace(/@[^\s]+\s*/g, '').trim() : text
      if (!(await access.canChat(contactId, roomId))) return
      if (!(await once(`message:${msg.id?.() ?? `${contactId}:${normalizedText}`}`, 86400))) return
      if (!(await limited(`rate:${contactId}`, config.rateLimit, config.rateWindowSeconds))) { await msg.say('消息太频繁了，请稍后再试。'); return }
      const conversationId = await memory.conversation(roomId ? 'room' : 'direct', contactId, roomId)
      await memory.add({ conversationId, senderId: contactId, role: 'user', content: normalizedText }, msg.id?.())
      const context = await memory.context(conversationId)
      const startedAt = Date.now()
      const knowledgeItems = await withSemaphore('llm:global', config.llmGlobalConcurrency, () =>
        withSemaphore(`llm:user:${contactId}`, config.llmPerUserConcurrency, () => knowledge.search(normalizedText)))
      await db.query('INSERT INTO retrieval_logs(conversation_id,query,result_count,top_score) VALUES($1,$2,$3,$4)', [conversationId, normalizedText, knowledgeItems.length, knowledgeItems[0]?.score ?? null])
      let answer: string
      try {
        const result = await withSemaphore('llm:global', config.llmGlobalConcurrency, () =>
          withSemaphore(`llm:user:${contactId}`, config.llmPerUserConcurrency, () => chatDetailed(buildPrompt(normalizedText, context.summary, context.recent, knowledgeItems))))
        answer = result.text
        await db.query('INSERT INTO llm_logs(conversation_id,operation,duration_ms,success,prompt_tokens,completion_tokens,total_tokens) VALUES($1,$2,$3,true,$4,$5,$6)', [conversationId, 'chat', Date.now() - startedAt, result.usage?.prompt_tokens ?? null, result.usage?.completion_tokens ?? null, result.usage?.total_tokens ?? null])
      } catch (error) {
        console.error('[llm] error', error)
        await db.query('INSERT INTO llm_logs(conversation_id,operation,duration_ms,success,error_type) VALUES($1,$2,$3,false,$4)', [conversationId, 'chat', Date.now() - startedAt, error instanceof Error ? error.name : 'unknown']).catch(() => undefined)
        answer = '抱歉，我暂时无法回答，请稍后再试。'
      }
      if (answer) { await msg.say(answer); await memory.add({ conversationId, senderId: 'bot', role: 'assistant', content: answer }) }
      void memory.maybeSummarize(conversationId).catch(error => console.error('[memory] summarize error', error))
    } catch (error) { console.error('[message] error', error) }
  })
  return bot
}
