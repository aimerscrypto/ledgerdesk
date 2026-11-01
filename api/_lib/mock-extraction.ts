/**
 * Realistic stand-in extraction, used whenever the live model is unavailable.
 * Shared by the serverless function and the browser so the demo never breaks.
 * Sample receipts return the values printed on them; anything else gets a plausible
 * result chosen deterministically from the filename and is labelled as demo data in the UI.
 */

export type ExtractedField = 'vendor' | 'date' | 'invoiceNumber' | 'subtotal' | 'tax' | 'total' | 'currency' | 'category'

export interface ExtractionResult {
  vendor: string
  date: string
  invoiceNumber: string
  subtotal: number
  tax: number
  total: number
  currency: 'KYD' | 'USD'
  category: string
  confidence: number
  fieldConfidence: Record<ExtractedField, number>
  /** fireworks: read by the model. mock: an upload the model couldn't read. seed: seeded demo data. */
  source: 'fireworks' | 'mock' | 'seed'
  fallbackReason?: 'no_key' | 'api_error' | 'unreachable'
}

/** The name shown wherever the app says who read a document. */
export function extractionLabel(result: Pick<ExtractionResult, 'source'>): string {
  if (result.source === 'fireworks') return 'DeepSeek V4.1 Flash'
  return result.source === 'seed' ? 'Imported' : 'Demo extraction'
}

export const CATEGORIES = [
  'Cost of goods sold',
  'Rent & lease',
  'Utilities',
  'Telecom & internet',
  'Payroll & pension',
  'Fuel & vehicles',
  'Repairs & maintenance',
  'Office & software',
  'Professional fees',
  'Insurance',
  'Marketing',
  'Travel',
  'Meals & entertainment',
  'Equipment',
  'Freight & import duty',
  'Licences & permits',
  'Bank charges',
  'Sales income',
  'Service income',
] as const

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function fields(base: number, overrides: Partial<Record<ExtractedField, number>> = {}) {
  const f: Record<ExtractedField, number> = {
    vendor: base + 0.04,
    date: base + 0.03,
    invoiceNumber: base,
    subtotal: base + 0.02,
    tax: base + 0.03,
    total: base + 0.05,
    currency: base + 0.05,
    category: base - 0.04,
    ...overrides,
  }
  for (const key of Object.keys(f) as ExtractedField[]) f[key] = Math.min(0.99, Math.round(f[key] * 100) / 100)
  return f
}

type Stub = Omit<ExtractionResult, 'source' | 'model' | 'fallbackReason'>

// Values match what is printed on the images in /public/samples.
const SAMPLES: Array<{ match: RegExp; result: Stub }> = [
  {
    match: /harbour-fuel/i,
    result: {
      vendor: 'Harbour Fuel & Marine',
      date: '2026-10-22',
      invoiceNumber: 'R-48213',
      subtotal: 186.4,
      tax: 0,
      total: 186.4,
      currency: 'KYD',
      category: 'Fuel & vehicles',
      confidence: 0.96,
      fieldConfidence: fields(0.93),
    },
  },
  {
    match: /island-power/i,
    result: {
      vendor: 'Island Power & Light',
      date: '2026-10-05',
      invoiceNumber: 'IPL-2210-7741',
      subtotal: 942.18,
      tax: 0,
      total: 942.18,
      currency: 'KYD',
      category: 'Utilities',
      confidence: 0.94,
      fieldConfidence: fields(0.92),
    },
  },
  {
    match: /atlantic-dive/i,
    result: {
      vendor: 'Atlantic Dive Wholesale Inc.',
      date: '2026-10-14',
      invoiceNumber: 'INV-30582',
      subtotal: 2340,
      tax: 163.8,
      total: 2503.8,
      currency: 'USD',
      category: 'Cost of goods sold',
      confidence: 0.91,
      fieldConfidence: fields(0.89, { tax: 0.84 }),
    },
  },
  {
    match: /faded|seaview/i,
    result: {
      vendor: 'Seaview Offce Supply',
      date: '2026-10-19',
      invoiceNumber: '00412',
      subtotal: 87.35,
      tax: 0,
      total: 87.35,
      currency: 'KYD',
      category: 'Office & software',
      confidence: 0.63,
      fieldConfidence: fields(0.74, { vendor: 0.58, date: 0.66, invoiceNumber: 0.41, total: 0.62, subtotal: 0.62 }),
    },
  },
]

const GENERIC: Array<Pick<Stub, 'vendor' | 'category' | 'currency'> & { low: number; high: number; taxRate?: number }> = [
  { vendor: 'George Town Hardware', category: 'Repairs & maintenance', currency: 'KYD', low: 45, high: 620 },
  { vendor: 'Tropic Telecom', category: 'Telecom & internet', currency: 'KYD', low: 120, high: 480 },
  { vendor: 'Seaview Office Supply', category: 'Office & software', currency: 'KYD', low: 30, high: 310 },
  { vendor: 'Tradewinds Freight & Customs', category: 'Freight & import duty', currency: 'KYD', low: 180, high: 1450 },
  { vendor: 'Harbour Fuel & Marine', category: 'Fuel & vehicles', currency: 'KYD', low: 60, high: 340 },
  { vendor: 'Cloudbooks Software LLC', category: 'Office & software', currency: 'USD', low: 49, high: 299 },
  { vendor: 'Gulf Coast Supply Co.', category: 'Cost of goods sold', currency: 'USD', low: 240, high: 3200, taxRate: 0.07 },
  { vendor: 'Islander Media Group', category: 'Marketing', currency: 'KYD', low: 150, high: 900 },
]

export function mockExtraction(
  filename: string,
  fallbackReason: ExtractionResult['fallbackReason'],
  today: Date = new Date(),
): ExtractionResult {
  const sample = SAMPLES.find((s) => s.match.test(filename))
  if (sample) return { ...sample.result, source: 'mock', fallbackReason }

  const h = hash(filename)
  const pick = GENERIC[h % GENERIC.length]
  const subtotal = Math.round((pick.low + ((h >>> 4) % 1000) / 1000 * (pick.high - pick.low)) * 100) / 100
  const tax = pick.taxRate ? Math.round(subtotal * pick.taxRate * 100) / 100 : 0
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((h >>> 8) % 12))
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  // Roughly one upload in three comes back shaky, so the review highlighting gets exercised.
  const shaky = (h >>> 12) % 3 === 0
  const base = shaky ? 0.72 : 0.9

  return {
    vendor: pick.vendor,
    date: iso,
    invoiceNumber: `${pick.vendor.slice(0, 2).toUpperCase()}-${10000 + ((h >>> 6) % 89999)}`,
    subtotal,
    tax,
    total: Math.round((subtotal + tax) * 100) / 100,
    currency: pick.currency,
    category: pick.category,
    confidence: shaky ? 0.71 : 0.93,
    fieldConfidence: fields(base, shaky ? { invoiceNumber: 0.55, total: 0.69 } : {}),
    source: 'mock',
    fallbackReason,
  }
}
