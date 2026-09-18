import { Redis } from 'ioredis'
import { randomUUID } from 'node:crypto'
import { config } from '../config.js'

export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: false })

export async function once(key: string, ttlSeconds: number): Promise<boolean> {
  return (await redis.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK'
}

export async function limited(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, windowSeconds)
  return count <= limit
}

export async function closeRedis(): Promise<void> { await redis.quit() }

export async function withSemaphore<T>(prefix: string, limit: number, fn: () => Promise<T>, waitMs = 30_000): Promise<T> {
  const token = randomUUID()
  const deadline = Date.now() + waitMs
  let slot: string | undefined
  while (!slot && Date.now() < deadline) {
    for (let i = 0; i < Math.max(1, limit); i++) {
      const candidate = `${prefix}:${i}`
      if (await redis.set(candidate, token, 'PX', waitMs + 5_000, 'NX')) { slot = candidate; break }
    }
    if (!slot) await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!slot) throw new Error('LLM 并发队列已满，请稍后再试')
  try { return await fn() } finally {
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, slot, token)
  }
}
