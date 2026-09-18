export function chunkText(text: string, size = 3200, overlap = 480): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  const chunks: string[] = []
  for (let start = 0; start < normalized.length; start += Math.max(1, size - overlap)) {
    const chunk = normalized.slice(start, start + size).trim()
    if (chunk) chunks.push(chunk)
    if (start + size >= normalized.length) break
  }
  return chunks
}
