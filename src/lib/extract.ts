import { mockExtraction, type ExtractionResult } from '../../api/_lib/mock-extraction'

const CLIENT_TIMEOUT_MS = 28_000

/**
 * Asks the serverless function to read a document. Every failure mode (no function
 * deployed, network down, timeout, bad response) resolves to mock data, never an error.
 */
export async function extractDocument(image: string | null, filename: string): Promise<ExtractionResult> {
  if (!image) return mockExtraction(filename, 'unreachable')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
  try {
    const response = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, filename }),
      signal: controller.signal,
    })
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !type.includes('json')) return mockExtraction(filename, 'unreachable')
    const result = (await response.json()) as ExtractionResult
    if (typeof result.total !== 'number' || !result.fieldConfidence) return mockExtraction(filename, 'unreachable')
    return result
  } catch {
    return mockExtraction(filename, 'unreachable')
  } finally {
    clearTimeout(timer)
  }
}
