import { config } from '../config.js'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type ChatResult = { text: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }

async function requestJson(url: string, body: unknown, apiKey: string): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify(body), signal: controller.signal,
    })
    if (!response.ok) throw new Error(`AI API ${response.status}: ${await response.text()}`)
    return await response.json()
  } finally { clearTimeout(timer) }
}

export async function embed(input: string[]): Promise<number[][]> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const json = await requestJson(`${config.embeddingBaseUrl}/embeddings`, { model: config.embeddingModel, input }, config.embeddingApiKey)
      return json.data.sort((a: any, b: any) => a.index - b.index).map((item: any) => item.embedding)
    } catch (error) { lastError = error; await new Promise(r => setTimeout(r, 250 * 2 ** attempt)) }
  }
  throw lastError
}

export async function chat(messages: ChatMessage[]): Promise<string> {
  return (await chatDetailed(messages)).text
}

export async function chatDetailed(messages: ChatMessage[]): Promise<ChatResult> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const json = await requestJson(`${config.llmBaseUrl}/chat/completions`, { model: config.llmModel, messages, temperature: 0.3 }, config.llmApiKey)
      return { text: String(json.choices?.[0]?.message?.content ?? '').trim(), usage: json.usage }
    } catch (error) { lastError = error; await new Promise(r => setTimeout(r, 500 * 2 ** attempt)) }
  }
  throw lastError
}
