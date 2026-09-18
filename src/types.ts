export type ChatScope = 'direct' | 'room'

export type MessageRecord = {
  id?: string
  conversationId: string
  senderId: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: Date
}

export type RetrievedChunk = {
  id: string
  content: string
  source: string
  score: number
}
