import { describe, expect, it } from 'vitest'
import { chunkText } from '../src/knowledge/chunker.js'
import { buildPrompt } from '../src/llm/prompt.js'
import { decideAccess, parseCommand } from '../src/access/service.js'

describe('chunkText', () => {
  it('normalizes and overlaps long text', () => {
    const chunks = chunkText('a'.repeat(20), 10, 2)
    expect(chunks.length).toBe(3)
    expect(chunks[0]).toHaveLength(10)
    expect(chunks[1].startsWith('a')).toBe(true)
  })
})

describe('access and commands', () => {
  it('applies block before admin and allow', () => {
    expect(decideAccess({ userStatus: 'block', isAdmin: true })).toBe('block')
    expect(decideAccess({ roomStatus: 'allow', isAdmin: false })).toBe('allow')
    expect(decideAccess({ isAdmin: false })).toBe('deny')
  })
  it('parses administrator commands', () => {
    expect(parseCommand('allow wxid_1')).toEqual({ action: 'allow', target: 'wxid_1' })
  })
})

describe('prompt', () => {
  it('contains memory, knowledge and question', () => {
    const prompt = buildPrompt('问题', '摘要', [{ conversationId: 'c', senderId: 'u', role: 'user', content: '之前' }], [{ id: '1', source: 'knowledge.txt', content: '事实', score: 0.9 }])
    expect(prompt.map(item => item.content).join('\n')).toContain('摘要')
    expect(prompt.map(item => item.content).join('\n')).toContain('事实')
    expect(prompt.at(-1)?.content).toBe('问题')
  })
})
