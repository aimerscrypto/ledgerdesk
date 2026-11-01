import type {
  AppState,
  AuditEvent,
  BankTxn,
  Client,
  Currency,
  DocRecord,
  EntryType,
  ExtractedField,
  ExtractionResult,
  LedgerEntry,
  Message,
  Paper,
  PaperTemplate,
  Statement,
} from './types'
import { addMonths, convert, createRng, isoDate, lastDayOf, parseDate, periodOf, round2, type Rng } from './format'
import { autoMatch } from './matching'

export const STATE_VERSION = 2
export const ACCOUNTANT = 'Marcia Ebanks'
const STAFF = 'Devon Tibbetts'
export const AI_ACTOR = 'LedgerDesk AI'
export const IMPORT_ACTOR = 'LedgerDesk'

export const FIRM = {
  name: 'Harbourline Accounting',
  address: 'Suite 4, Elgin Court, George Town, Grand Cayman KY1-1104',
  phone: '+1 (345) 555-0100',
}

interface VendorSpec {
  v: string
  c: string
  a: number
  t?: PaperTemplate
  n?: number
  cur?: Currency
  tax?: number
  day?: number
  bank?: string
}

// All businesses, people and bank names here are fictional.
const V = {
  power: { v: 'Island Power & Light', c: 'Utilities', a: 860, t: 'utility', day: 6, bank: 'DD ISLAND POWER LIGHT' },
  water: { v: 'Cayman Water Works', c: 'Utilities', a: 210, t: 'utility', day: 9, bank: 'DD CAYMAN WATER WORKS' },
  tel: { v: 'Tropic Telecom', c: 'Telecom & internet', a: 340, t: 'utility', day: 12, bank: 'DD TROPIC TELECOM' },
  fuel: { v: 'Harbour Fuel & Marine', c: 'Fuel & vehicles', a: 195, t: 'receipt', n: 2, bank: 'POS HARBOUR FUEL MARINE' },
  office: { v: 'Seaview Office Supply', c: 'Office & software', a: 118, t: 'receipt', bank: 'POS SEAVIEW OFFICE SUP' },
  hardware: { v: 'George Town Hardware', c: 'Repairs & maintenance', a: 265, t: 'receipt', n: 1, bank: 'POS GEORGE TOWN HARDWR' },
  insurance: { v: 'Sound Insurance Agency', c: 'Insurance', a: 720, t: 'invoice', day: 3, bank: 'ACH SOUND INSURANCE' },
  freight: { v: 'Tradewinds Freight & Customs', c: 'Freight & import duty', a: 840, t: 'invoice', bank: 'ACH TRADEWINDS FREIGHT' },
  software: { v: 'Cloudbooks Software LLC', c: 'Office & software', a: 89, t: 'invoice', cur: 'USD', day: 2, bank: 'CARD CLOUDBOOKS SOFTWARE' },
  media: { v: 'Islander Media Group', c: 'Marketing', a: 430, t: 'invoice', bank: 'ACH ISLANDER MEDIA' },
  payroll: { v: 'Pinnacle Payroll Services', c: 'Payroll & pension', a: 6400, t: 'invoice', day: 25, bank: 'ACH PINNACLE PAYROLL' },
  pension: { v: 'Fidelis Pension Administrators', c: 'Payroll & pension', a: 620, t: 'invoice', day: 27, bank: 'ACH FIDELIS PENSION' },
  cafe: { v: 'Blue Iguana Cafe', c: 'Meals & entertainment', a: 72, t: 'receipt', bank: 'POS BLUE IGUANA CAFE' },
} satisfies Record<string, VendorSpec>

interface ClientSeed extends Omit<Client, 'monthEndDue' | 'bankName' | 'since'> {
  dueIn: number
  since: number
  income: VendorSpec[]
  vendors: VendorSpec[]
  pending: Array<{ vendor: number; misread?: Misread }>
  hasStatement: boolean
}

type Misread = 'vendor' | 'total' | 'date' | 'invoice' | 'category' | 'faint'

const CLIENTS: ClientSeed[] = [
  {
    id: 'seven-mile',
    name: 'Seven Mile Dive Shop Ltd',
    industry: 'Dive & watersports',
    address: 'West Bay Road, Seven Mile Beach, Grand Cayman',
    contact: 'Jordan McLaughlin',
    email: 'jordan@sevenmiledive.example',
    phone: '+1 (345) 555-0142',
    bankCurrency: 'KYD',
    dueIn: 3,
    since: 2019,
    hasStatement: true,
    income: [
      { v: 'Dive bookings (POS batch)', c: 'Sales income', a: 6200, t: 'sales', n: 4, bank: 'POS SETTLEMENT MERCHANT' },
      { v: 'Cruise Excursions Partner', c: 'Service income', a: 3800, t: 'sales', n: 1, cur: 'USD', bank: 'WIRE IN CRUISE EXCURSIONS' },
    ],
    vendors: [
      { v: 'Atlantic Dive Wholesale Inc.', c: 'Cost of goods sold', a: 2300, t: 'invoice', cur: 'USD', tax: 0.07, bank: 'WIRE OUT ATLANTIC DIVE WH' },
      { v: 'Caribbean Compressed Air', c: 'Repairs & maintenance', a: 410, t: 'invoice', bank: 'ACH CARIBBEAN COMPRESSED' },
      { v: 'Grand Harbour Properties', c: 'Rent & lease', a: 4250, t: 'invoice', day: 1, bank: 'ACH GRAND HARBOUR PROP' },
      V.power,
      V.tel,
      V.fuel,
      V.hardware,
      V.insurance,
      V.freight,
      V.software,
      { ...V.payroll, a: 11800 },
      { ...V.pension, a: 980 },
      V.media,
    ],
    pending: [
      { vendor: 0, misread: 'invoice' },
      { vendor: 5, misread: 'total' },
      { vendor: 6, misread: 'faint' },
      { vendor: 8 },
    ],
  },
  {
    id: 'bodden-bakehouse',
    name: 'Bodden Town Bakehouse Ltd',
    industry: 'Food & beverage',
    address: 'Bodden Town Road, Bodden Town, Grand Cayman',
    contact: 'Priya Rankine',
    email: 'priya@boddenbakehouse.example',
    phone: '+1 (345) 555-0178',
    bankCurrency: 'KYD',
    dueIn: 5,
    since: 2021,
    hasStatement: true,
    income: [
      { v: 'Counter sales (POS batch)', c: 'Sales income', a: 3100, t: 'sales', n: 4, bank: 'POS SETTLEMENT MERCHANT' },
      { v: 'Sunset Resort Catering', c: 'Sales income', a: 1650, t: 'sales', n: 1, bank: 'ACH CREDIT SUNSET RESORT' },
    ],
    vendors: [
      { v: 'Gulf Coast Flour & Dry Goods', c: 'Cost of goods sold', a: 1850, t: 'invoice', cur: 'USD', n: 2, tax: 0.06, bank: 'WIRE OUT GULF COAST FLOUR' },
      { v: 'Island Fresh Dairy', c: 'Cost of goods sold', a: 640, t: 'invoice', n: 2, bank: 'ACH ISLAND FRESH DAIRY' },
      { v: 'Eastern Avenue Leasing', c: 'Rent & lease', a: 2150, t: 'invoice', day: 1, bank: 'ACH EASTERN AVE LEASING' },
      { ...V.power, a: 1240 },
      V.water,
      V.tel,
      { ...V.payroll, a: 7200 },
      { ...V.pension, a: 610 },
      V.hardware,
    ],
    pending: [{ vendor: 1, misread: 'date' }, { vendor: 8 }],
  },
  {
    id: 'ironshore-yacht',
    name: 'Ironshore Yacht Charters Ltd',
    industry: 'Marine charter',
    address: 'Barcadere Marina, George Town, Grand Cayman',
    contact: 'Tomas Whittaker',
    email: 'tomas@ironshorecharters.example',
    phone: '+1 (345) 555-0119',
    bankCurrency: 'USD',
    dueIn: 1,
    since: 2017,
    hasStatement: true,
    income: [
      { v: 'Charter deposits (Stripeline)', c: 'Service income', a: 8600, t: 'sales', n: 3, cur: 'USD', bank: 'ACH CREDIT STRIPELINE PAYOUT' },
      { v: 'Corporate Charter Group', c: 'Service income', a: 12400, t: 'sales', n: 1, cur: 'USD', bank: 'WIRE IN CORPORATE CHARTER' },
    ],
    vendors: [
      { v: 'Barcadere Marina Ltd', c: 'Rent & lease', a: 3900, t: 'invoice', day: 1, bank: 'ACH BARCADERE MARINA' },
      { ...V.fuel, a: 1450, n: 3 },
      { v: 'Marine Engine Services', c: 'Repairs & maintenance', a: 1780, t: 'invoice', n: 1, bank: 'ACH MARINE ENGINE SVC' },
      { v: 'Lloyd Bay Marine Insurance', c: 'Insurance', a: 2850, t: 'invoice', cur: 'USD', day: 4, bank: 'WIRE OUT LLOYD BAY MARINE' },
      V.tel,
      { ...V.media, a: 980 },
      { ...V.payroll, a: 13200 },
      { ...V.pension, a: 1120 },
      V.software,
    ],
    pending: [{ vendor: 2, misread: 'category' }, { vendor: 1, misread: 'vendor' }, { vendor: 3 }],
  },
  {
    id: 'rum-point',
    name: 'Rum Point Provisions Ltd',
    industry: 'Grocery & retail',
    address: 'Rum Point Drive, North Side, Grand Cayman',
    contact: 'Alana Conolly',
    email: 'alana@rumpointprovisions.example',
    phone: '+1 (345) 555-0163',
    bankCurrency: 'KYD',
    dueIn: 7,
    since: 2020,
    hasStatement: false,
    income: [{ v: 'Store sales (POS batch)', c: 'Sales income', a: 7400, t: 'sales', n: 4, bank: 'POS SETTLEMENT MERCHANT' }],
    vendors: [
      { v: 'Southeastern Food Distributors', c: 'Cost of goods sold', a: 5200, t: 'invoice', cur: 'USD', n: 2, bank: 'WIRE OUT SOUTHEASTERN FOOD' },
      { v: 'Island Fresh Dairy', c: 'Cost of goods sold', a: 1320, t: 'invoice', n: 2, bank: 'ACH ISLAND FRESH DAIRY' },
      { v: 'North Side Land Holdings', c: 'Rent & lease', a: 2600, t: 'invoice', day: 1, bank: 'ACH NORTH SIDE LAND' },
      { ...V.power, a: 2150 },
      V.water,
      V.tel,
      { ...V.freight, a: 1560 },
      { ...V.payroll, a: 9100 },
      { ...V.pension, a: 760 },
      V.insurance,
    ],
    pending: [{ vendor: 6 }, { vendor: 0, misread: 'invoice' }],
  },
  {
    id: 'cayman-breeze',
    name: 'Cayman Breeze Property Management Ltd',
    industry: 'Property management',
    address: 'Shedden Road, George Town, Grand Cayman',
    contact: 'Renee Solomon',
    email: 'renee@caymanbreezepm.example',
    phone: '+1 (345) 555-0187',
    bankCurrency: 'KYD',
    dueIn: 10,
    since: 2018,
    hasStatement: true,
    income: [
      { v: 'Strata management fees', c: 'Service income', a: 5800, t: 'sales', n: 3, bank: 'ACH CREDIT STRATA FEES' },
      { v: 'Rental commissions', c: 'Service income', a: 2900, t: 'sales', n: 2, bank: 'ACH CREDIT RENTAL COMM' },
    ],
    vendors: [
      { v: 'Sandy Ground Landscaping', c: 'Repairs & maintenance', a: 980, t: 'invoice', n: 2, bank: 'ACH SANDY GROUND LANDSC' },
      { v: 'Clearwater Pool Services', c: 'Repairs & maintenance', a: 620, t: 'invoice', bank: 'ACH CLEARWATER POOL' },
      { v: 'Shedden Road Offices', c: 'Rent & lease', a: 1950, t: 'invoice', day: 1, bank: 'ACH SHEDDEN RD OFFICES' },
      V.tel,
      V.office,
      V.hardware,
      { ...V.payroll, a: 8400 },
      { ...V.pension, a: 690 },
      V.insurance,
    ],
    pending: [{ vendor: 1 }],
  },
  {
    id: 'east-end-electrical',
    name: 'East End Electrical Contractors Ltd',
    industry: 'Trades & construction',
    address: 'Sea View Road, East End, Grand Cayman',
    contact: 'Kirk Dacosta',
    email: 'kirk@eastendelectrical.example',
    phone: '+1 (345) 555-0126',
    bankCurrency: 'KYD',
    dueIn: 12,
    since: 2022,
    hasStatement: true,
    income: [
      { v: 'Progress billing: Crewe Road project', c: 'Service income', a: 9400, t: 'sales', n: 1, bank: 'ACH CREDIT CREWE RD PROJECT' },
      { v: 'Residential call-outs', c: 'Service income', a: 2600, t: 'sales', n: 3, bank: 'CHQ DEPOSIT CALL OUTS' },
    ],
    vendors: [
      { v: 'Volt Electrical Wholesale', c: 'Cost of goods sold', a: 3100, t: 'invoice', cur: 'USD', n: 2, tax: 0.07, bank: 'WIRE OUT VOLT ELECTRICAL' },
      V.hardware,
      { ...V.fuel, a: 240, n: 3 },
      { v: 'Cayman Fleet Leasing', c: 'Rent & lease', a: 1280, t: 'invoice', day: 2, bank: 'ACH CAYMAN FLEET LEASE' },
      V.tel,
      { ...V.payroll, a: 10300 },
      { ...V.pension, a: 840 },
      V.insurance,
    ],
    pending: [{ vendor: 0, misread: 'total' }, { vendor: 2 }],
  },
  {
    id: 'stingray-villas',
    name: 'Stingray Bay Villas Ltd',
    industry: 'Hospitality',
    address: 'Queens Highway, East End, Grand Cayman',
    contact: 'Sasha Hydes',
    email: 'sasha@stingraybayvillas.example',
    phone: '+1 (345) 555-0151',
    bankCurrency: 'USD',
    dueIn: 15,
    since: 2016,
    hasStatement: true,
    income: [
      { v: 'Direct villa bookings', c: 'Sales income', a: 9800, t: 'sales', n: 3, cur: 'USD', bank: 'ACH CREDIT DIRECT BOOKINGS' },
      { v: 'Holiday platform payout', c: 'Sales income', a: 7200, t: 'sales', n: 2, cur: 'USD', bank: 'ACH CREDIT PLATFORM PAYOUT' },
    ],
    vendors: [
      { v: 'Clearwater Pool Services', c: 'Repairs & maintenance', a: 780, t: 'invoice', n: 2, bank: 'ACH CLEARWATER POOL' },
      { v: 'Tidewater Linen Service', c: 'Repairs & maintenance', a: 1150, t: 'invoice', n: 2, bank: 'ACH TIDEWATER LINEN' },
      { ...V.power, a: 2680 },
      { ...V.water, a: 540 },
      V.tel,
      { ...V.media, a: 1400 },
      { ...V.payroll, a: 11900 },
      { ...V.pension, a: 980 },
      V.insurance,
    ],
    pending: [{ vendor: 1 }],
  },
  {
    id: 'tradewind-dental',
    name: 'Tradewind Dental Practice Ltd',
    industry: 'Healthcare',
    address: 'South Sound Road, George Town, Grand Cayman',
    contact: 'Dr. Noel Powery',
    email: 'noel@tradewinddental.example',
    phone: '+1 (345) 555-0134',
    bankCurrency: 'KYD',
    dueIn: 19,
    since: 2015,
    hasStatement: false,
    income: [
      { v: 'Patient receipts (POS batch)', c: 'Service income', a: 5900, t: 'sales', n: 4, bank: 'POS SETTLEMENT MERCHANT' },
      { v: 'Insurance claim remittance', c: 'Service income', a: 7600, t: 'sales', n: 2, bank: 'ACH CREDIT CLAIM REMIT' },
    ],
    vendors: [
      { v: 'Meridian Dental Supply', c: 'Cost of goods sold', a: 2400, t: 'invoice', cur: 'USD', n: 1, tax: 0.065, bank: 'WIRE OUT MERIDIAN DENTAL' },
      { v: 'South Sound Medical Plaza', c: 'Rent & lease', a: 3650, t: 'invoice', day: 1, bank: 'ACH SOUTH SOUND MEDICAL' },
      { v: 'Cayman Biomedical Waste', c: 'Licences & permits', a: 310, t: 'invoice', bank: 'ACH CAYMAN BIOMEDICAL' },
      { ...V.power, a: 980 },
      V.tel,
      V.software,
      { ...V.payroll, a: 14600 },
      { ...V.pension, a: 1210 },
      V.insurance,
    ],
    pending: [],
  },
]

function makeNumber(vendor: string, rng: Rng): string {
  const prefix = vendor.replace(/[^A-Za-z ]/g, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
  return `${prefix}-${rng.int(10000, 98999)}`
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
}

function makePaper(spec: VendorSpec, date: string, billTo: string, rng: Rng): Paper {
  const subtotal = round2(spec.a * (0.82 + rng.next() * 0.36))
  const tax = spec.tax ? round2(subtotal * spec.tax) : 0
  return {
    template: spec.t ?? 'invoice',
    vendor: spec.v,
    date,
    number: makeNumber(spec.v, rng),
    subtotal,
    tax,
    total: round2(subtotal + tax),
    currency: spec.cur ?? 'KYD',
    category: spec.c,
    billTo,
  }
}

function fieldScores(rng: Rng, low: Partial<Record<ExtractedField, number>> = {}): Record<ExtractedField, number> {
  const s = () => round2(0.88 + rng.next() * 0.11)
  return {
    vendor: s(),
    date: s(),
    invoiceNumber: s(),
    subtotal: s(),
    tax: s(),
    total: s(),
    currency: s(),
    category: round2(0.84 + rng.next() * 0.12),
    ...low,
  }
}

function overall(scores: Record<ExtractedField, number>): number {
  const values = Object.values(scores)
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  return round2(avg * 0.6 + Math.min(...values) * 0.4)
}

/** The AI's reading of a document, including the realistic ways a real model gets one wrong. */
function readPaper(paper: Paper, rng: Rng, misread?: Misread): ExtractionResult {
  const fields = {
    vendor: paper.vendor,
    date: paper.date,
    invoiceNumber: paper.number,
    subtotal: paper.subtotal,
    tax: paper.tax,
    total: paper.total,
    currency: paper.currency,
    category: paper.category,
  }
  const low: Partial<Record<ExtractedField, number>> = {}
  switch (misread) {
    case 'vendor':
      fields.vendor = paper.vendor.replace(/o/, '0').replace(/i/, 'l')
      low.vendor = 0.58
      break
    case 'total':
      // A classic OCR slip: two digits swapped in the total, so subtotal and total disagree.
      fields.total = swapDigits(paper.total)
      low.total = 0.61
      break
    case 'date': {
      const [y, m, d] = paper.date.split('-')
      if (+d <= 12) fields.date = `${y}-${d}-${m}`
      low.date = 0.55
      break
    }
    case 'invoice':
      fields.invoiceNumber = ''
      low.invoiceNumber = 0.32
      break
    case 'category':
      fields.category = 'Office & software'
      low.category = 0.49
      break
    case 'faint':
      fields.invoiceNumber = paper.number.replace(/\d$/, '')
      low.vendor = 0.74
      low.invoiceNumber = 0.44
      low.total = 0.68
      low.subtotal = 0.68
      low.date = 0.71
      break
  }
  const fieldConfidence = fieldScores(rng, low)
  return { ...fields, confidence: overall(fieldConfidence), fieldConfidence, source: 'seed' }
}

function swapDigits(n: number): number {
  const text = n.toFixed(2)
  const whole = text.split('.')[0]
  if (whole.length < 2) return round2(n + 10)
  const swapped = `${whole.slice(0, -2)}${whole[whole.length - 1]}${whole[whole.length - 2]}.${text.split('.')[1]}`
  const result = Number(swapped)
  return result === n ? round2(n + 90) : result
}

const BANK_NAME = 'Cayman Harbour Bank'

function fingerprint(date: string, amount: number, description: string): string {
  return `${date}|${amount.toFixed(2)}|${description.trim().toLowerCase()}`
}

export const statementFingerprint = fingerprint

interface StatementInput {
  id: string
  date: string
  amount: number
  currency: Currency
  type: EntryType
  vendor: string
  bank?: string
}

/**
 * Turns ledger items into the lines a bank would really print: truncated names, value
 * dates a few days later, opaque card references, fees nobody has a receipt for. Used
 * for both seeded statements and the "sample CSV" button, so matching gets real work.
 */
export function buildStatementLines(
  items: StatementInput[],
  period: string,
  bankCurrency: Currency,
  rng: Rng,
  clean = false,
): Array<{ date: string; description: string; amount: number; currency: Currency }> {
  const end = lastDayOf(period)
  const lines: Array<{ date: string; description: string; amount: number; currency: Currency }> = []

  for (const item of items) {
    if (!clean && rng.chance(0.05)) continue
    const vague = !clean && rng.chance(0.14)
    const crossCurrency = item.currency !== bankCurrency
    const fxSlip = !clean && crossCurrency && rng.chance(0.35)
    const shift = clean ? rng.int(0, 1) : vague ? rng.int(2, 6) : rng.int(0, 2)
    const shifted = parseDate(item.date)
    shifted.setDate(shifted.getDate() + shift)
    const date = isoDate(shifted) > end ? end : isoDate(shifted)

    let amount = convert(item.amount, item.currency, bankCurrency)
    if (fxSlip) amount = round2(amount * (1 + 0.004 + rng.next() * 0.006))

    const description = vague
      ? `${item.type === 'income' ? 'ACH CREDIT' : 'CARD PURCHASE'} ${rng.int(100000, 999999)}`
      : `${item.bank ?? `ACH ${item.vendor.toUpperCase().slice(0, 22)}`} ${rng.int(1000, 9999)}`

    lines.push({ date, description, amount: item.type === 'income' ? amount : -amount, currency: bankCurrency })
  }

  if (!clean) {
    lines.push(
      { date: end, description: 'MONTHLY SERVICE FEE', amount: -15, currency: bankCurrency },
      { date: `${period}-${String(rng.int(8, 26)).padStart(2, '0')}`, description: 'INT WIRE FEE', amount: -25, currency: bankCurrency },
      { date: `${period}-${String(rng.int(5, 24)).padStart(2, '0')}`, description: `POS ${rng.int(1000, 9999)} COCONUT WALK DELI`, amount: -round2(38 + rng.next() * 60), currency: bankCurrency },
    )
    if (rng.chance(0.6)) {
      lines.push({ date: `${period}-${String(rng.int(10, 26)).padStart(2, '0')}`, description: 'ACH CREDIT UNKNOWN REMITTER', amount: round2(180 + rng.next() * 520), currency: bankCurrency })
    }
  }
  return lines.sort((a, b) => a.date.localeCompare(b.date))
}

export function buildState(now: Date = new Date()): AppState {
  const closePeriod = periodOf(isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)))
  const months = Array.from({ length: 6 }, (_, i) => addMonths(closePeriod, i - 5))
  const auditCutoff = new Date(now.getTime() - 50 * 86_400_000).toISOString()

  const documents: DocRecord[] = []
  const ledger: LedgerEntry[] = []
  const bank: BankTxn[] = []
  const statements: Statement[] = []
  const messages: Message[] = []
  const audit: Omit<AuditEvent, 'seq'>[] = []

  let counter = 0
  const nextId = (prefix: string) => `${prefix}-${(++counter).toString(36)}`
  const clampTs = (d: Date) => (d.getTime() > now.getTime() ? new Date(now.getTime() - 3_600_000) : d)
  const log = (e: Omit<AuditEvent, 'seq' | 'id'>) => {
    if (e.at >= auditCutoff) audit.push({ ...e, id: nextId('aud') })
  }

  const clients: Client[] = CLIENTS.map((c) => {
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + c.dueIn)
    return {
      id: c.id,
      name: c.name,
      industry: c.industry,
      address: c.address,
      contact: c.contact,
      email: c.email,
      phone: c.phone,
      bankName: BANK_NAME,
      bankCurrency: c.bankCurrency,
      monthEndDue: isoDate(due),
      since: String(c.since),
    }
  })

  for (const c of CLIENTS) {
    const rng = createRng(`seed:${c.id}:${closePeriod}`)
    const allSpecs: Array<VendorSpec & { type: EntryType }> = [
      ...c.income.map((s) => ({ ...s, type: 'income' as const })),
      ...c.vendors.map((s) => ({ ...s, type: 'expense' as const })),
    ]

    for (const period of months) {
      const lastDay = Number(lastDayOf(period).slice(-2))
      for (const spec of allSpecs) {
        const count = spec.n ?? 1
        for (let i = 0; i < count; i++) {
          if (!spec.day && spec.n === undefined && rng.chance(0.2)) continue
          const day = spec.day ?? (count > 1 ? Math.min(lastDay, Math.floor(((i + rng.next()) * lastDay) / count) + 1) : rng.int(3, lastDay - 2))
          const date = `${period}-${String(day).padStart(2, '0')}`
          const paper = makePaper(spec, date, c.name, rng)
          const docId = nextId('doc')
          const entryId = nextId('led')
          const uploaded = new Date(parseDate(date).getTime() + (rng.int(0, 3) * 24 + rng.int(8, 17)) * 3_600_000 + rng.int(0, 59) * 60_000)
          const reviewed = new Date(uploaded.getTime() + rng.int(2, 30) * 3_600_000)
          const uploadedAt = clampTs(uploaded).toISOString()
          const reviewedAt = clampTs(reviewed).toISOString()
          const reviewer = rng.chance(0.7) ? ACCOUNTANT : STAFF
          const extraction = readPaper(paper, rng)
          const wasEdited = rng.chance(0.06) && paper.category !== 'Office & software'
          if (wasEdited) {
            extraction.category = 'Office & software'
            extraction.fieldConfidence.category = 0.56
            extraction.confidence = overall(extraction.fieldConfidence)
          }
          const filename = `${slug(spec.v)}-${paper.number.toLowerCase()}.${spec.t === 'invoice' ? 'pdf' : 'jpg'}`

          documents.push({
            id: docId,
            clientId: c.id,
            filename,
            mime: spec.t === 'invoice' ? 'application/pdf' : 'image/jpeg',
            sizeKb: rng.int(90, 1400),
            uploadedAt,
            uploadedBy: c.contact,
            status: 'approved',
            paper,
            extraction,
            final: wasEdited
              ? { vendor: paper.vendor, date: paper.date, invoiceNumber: paper.number, subtotal: paper.subtotal, tax: paper.tax, total: paper.total, currency: paper.currency, category: paper.category }
              : undefined,
            entryType: spec.type,
            reviewedAt,
            reviewedBy: reviewer,
            ledgerEntryId: entryId,
          })
          ledger.push({
            id: entryId,
            clientId: c.id,
            date,
            vendor: paper.vendor,
            category: paper.category,
            type: spec.type,
            amount: paper.total,
            currency: paper.currency,
            docId,
            invoiceNumber: paper.number,
            postedBy: reviewer,
            postedAt: reviewedAt,
          })

          log({ at: uploadedAt, actor: c.contact, actorRole: 'client', action: 'upload', clientId: c.id, docId, detail: `Uploaded ${filename}` })
          log({ at: new Date(new Date(uploadedAt).getTime() + 14_000).toISOString(), actor: IMPORT_ACTOR, actorRole: 'system', action: 'seed_import', clientId: c.id, docId, detail: `Imported ${paper.vendor}, ${paper.currency} ${paper.total.toFixed(2)} (${Math.round(extraction.confidence * 100)}% confidence)` })
          if (wasEdited) log({ at: reviewedAt, actor: reviewer, actorRole: 'accountant', action: 'edit', clientId: c.id, docId, detail: `Changed category from "Office & software" to "${paper.category}"` })
          log({ at: reviewedAt, actor: reviewer, actorRole: 'accountant', action: 'approve', clientId: c.id, docId, detail: `Approved ${paper.vendor}, ${paper.currency} ${paper.total.toFixed(2)} and posted to ledger` })
        }
      }
    }

    // Documents still waiting on a person.
    const pendingInputs: StatementInput[] = []
    c.pending.forEach((p, index) => {
      const spec = c.vendors[p.vendor]
      const lastDay = Number(lastDayOf(closePeriod).slice(-2))
      const date = `${closePeriod}-${String(lastDay - rng.int(1, 11)).padStart(2, '0')}`
      const paper = makePaper(spec, date, c.name, rng)
      if (p.misread === 'faint') paper.faint = true
      const docId = c.id === 'seven-mile' ? `doc-pending-${index + 1}` : nextId('doc')
      const uploadedAt = new Date(now.getTime() - rng.int(2, 70) * 3_600_000 - rng.int(0, 59) * 60_000).toISOString()
      const extraction = readPaper(paper, rng, p.misread)
      const filename = `${slug(spec.v)}-${paper.number.toLowerCase()}.${spec.t === 'invoice' ? 'pdf' : 'jpg'}`
      documents.push({
        id: docId,
        clientId: c.id,
        filename,
        mime: spec.t === 'invoice' ? 'application/pdf' : 'image/jpeg',
        sizeKb: rng.int(90, 1400),
        uploadedAt,
        uploadedBy: c.contact,
        status: 'needs_review',
        paper,
        extraction,
        entryType: 'expense',
      })
      pendingInputs.push({ id: docId, date: paper.date, amount: paper.total, currency: paper.currency, type: 'expense', vendor: spec.v, bank: spec.bank })
      log({ at: uploadedAt, actor: c.contact, actorRole: 'client', action: 'upload', clientId: c.id, docId, detail: `Uploaded ${filename}` })
      log({ at: new Date(new Date(uploadedAt).getTime() + 11_000).toISOString(), actor: IMPORT_ACTOR, actorRole: 'system', action: 'seed_import', clientId: c.id, docId, detail: `Imported ${extraction.vendor}, ${extraction.currency} ${extraction.total.toFixed(2)} (${Math.round(extraction.confidence * 100)}% confidence)` })
    })

    // Bank statements: last month fully reconciled, the closing month mid-flight.
    const entriesFor = (period: string) => ledger.filter((e) => e.clientId === c.id && periodOf(e.date) === period)
    const toInput = (e: LedgerEntry): StatementInput => {
      const spec = allSpecs.find((s) => s.v === e.vendor)
      return { id: e.id, date: e.date, amount: e.amount, currency: e.currency, type: e.type, vendor: e.vendor, bank: spec?.bank }
    }
    const importStatement = (period: string, inputs: StatementInput[], clean: boolean): BankTxn[] => {
      const raw = buildStatementLines(inputs, period, c.bankCurrency, rng, clean)
      const lines: BankTxn[] = raw.map((l) => ({
        id: nextId('txn'),
        clientId: c.id,
        period,
        date: l.date,
        description: l.description,
        amount: l.amount,
        currency: l.currency,
        fingerprint: fingerprint(l.date, l.amount, l.description),
        status: 'unmatched',
      }))
      const importedAt = new Date(parseDate(lastDayOf(period)).getTime() + (clean ? 4 * 86_400_000 : 0) + 34 * 3_600_000)
      const at = clampTs(importedAt).toISOString()
      statements.push({ id: nextId('stm'), clientId: c.id, period, filename: `${BANK_NAME.toLowerCase().replace(/\s/g, '-')}-${period}.csv`, importedAt: at, importedBy: ACCOUNTANT, lineCount: lines.length })
      const matched = autoMatch(lines, entriesFor(period))
      const counts = { matched: 0, suggested: 0, unmatched: 0 }
      for (const line of matched) counts[line.status as keyof typeof counts] += 1
      log({ at, actor: ACCOUNTANT, actorRole: 'accountant', action: 'import', clientId: c.id, detail: `Imported ${period} bank statement (${lines.length} lines): ${counts.matched} auto-matched, ${counts.suggested} suggested, ${counts.unmatched} unmatched` })
      return matched
    }

    const previous = addMonths(closePeriod, -1)
    const previousLines = importStatement(previous, entriesFor(previous).map(toInput), true).map((l) =>
      l.status === 'matched' || l.status === 'suggested'
        ? { ...l, status: 'matched' as const, resolvedBy: l.status === 'suggested' ? ACCOUNTANT : undefined }
        : { ...l, status: 'excluded' as const, resolvedBy: ACCOUNTANT, note: 'Reviewed at month-end' },
    )
    bank.push(...previousLines)
    if (c.hasStatement) bank.push(...importStatement(closePeriod, [...entriesFor(closePeriod).map(toInput), ...pendingInputs], false))
  }

  // Link matched bank lines back onto their ledger entries.
  const linkByEntry = new Map(bank.filter((t) => t.status === 'matched' && t.ledgerEntryId).map((t) => [t.ledgerEntryId!, t.id]))
  for (const entry of ledger) entry.bankTxnId = linkByEntry.get(entry.id)

  addScriptedActivity(now, closePeriod, documents, messages, audit, nextId)

  audit.sort((a, b) => a.at.localeCompare(b.at))

  return {
    version: STATE_VERSION,
    seededAt: now.toISOString(),
    closePeriod,
    session: { role: 'accountant', clientId: 'seven-mile' },
    clients,
    documents,
    messages,
    ledger,
    bank,
    statements,
    audit: audit.map((e, i) => ({ ...e, seq: i + 1 })),
  }
}

/** Hand-written conversations, rejections and a live "processing" document. */
function addScriptedActivity(
  now: Date,
  closePeriod: string,
  documents: DocRecord[],
  messages: Message[],
  audit: Omit<AuditEvent, 'seq'>[],
  nextId: (prefix: string) => string,
) {
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
  const say = (docId: string, author: string, role: 'client' | 'accountant', body: string, h: number) => {
    messages.push({ id: nextId('msg'), docId, author, role, body, at: hoursAgo(h) })
  }
  const JORDAN = 'Jordan McLaughlin'
  const rng = createRng(`script:${closePeriod}`)

  say('doc-pending-1', ACCOUNTANT, 'accountant', 'The invoice number didn\'t scan on this one. Do you have the original from Atlantic Dive, or can you read it off the paper copy?', 20)
  say('doc-pending-1', JORDAN, 'client', 'It should be on the packing slip in the shop. I\'ll check when I\'m in tomorrow morning.', 17)
  say('doc-pending-2', JORDAN, 'client', 'This was the fill-up for the two boats ahead of the cruise ship week, in case the amount looks high.', 26)
  say('doc-pending-3', ACCOUNTANT, 'accountant', 'This receipt is quite faded. I can make out most of it, but please take a photo of receipts on the day where you can. They fade fast in the heat.', 8)

  // Conversations on documents the firm has already approved.
  const sevenApproved = documents
    .filter((d) => d.clientId === 'seven-mile' && d.status === 'approved' && d.uploadedAt.slice(0, 7) >= closePeriod && d.entryType === 'expense')
    .slice(0, 2)
  if (sevenApproved[0]) {
    say(sevenApproved[0].id, JORDAN, 'client', 'Is this one OK to go under repairs? It was the compressor service.', 80)
    say(sevenApproved[0].id, ACCOUNTANT, 'accountant', 'Yes, routine servicing stays under repairs. A replacement compressor would go to equipment instead. Approved and posted.', 76)
  }
  if (sevenApproved[1]) {
    say(sevenApproved[1].id, ACCOUNTANT, 'accountant', 'Thanks for sending this before month-end. It matched the bank line straight away.', 60)
  }

  for (const doc of documents.filter((d) => d.status === 'needs_review' && d.clientId !== 'seven-mile').slice(0, 5)) {
    const contact = doc.uploadedBy
    const line = rng.pick([
      `Could you confirm whether this is for the business only? There's a personal account number on the paper copy.`,
      `Please check the total on this one. The scan is a little unclear on my side.`,
      `Is there a purchase order that goes with this invoice? I'd like to attach it for the file.`,
    ])
    say(doc.id, ACCOUNTANT, 'accountant', line, rng.int(10, 40))
    if (rng.chance(0.6)) say(doc.id, contact, 'client', rng.pick(['Yes, that\'s all business. Thanks for checking.', 'I\'ll look for it and send it over this afternoon.', 'Confirmed, the amount is right.']), rng.int(1, 9))
  }

  // Rejections, so the client's list shows that outcome too.
  const addRejected = (clientId: string, contact: string, vendor: string, filename: string, reason: string, hours: number, category: string, total: number) => {
    const id = nextId('doc')
    const date = `${closePeriod}-${String(rng.int(10, 24)).padStart(2, '0')}`
    const paper: Paper = { template: 'receipt', vendor, date, number: `${rng.int(1000, 9999)}`, subtotal: total, tax: 0, total, currency: 'KYD', category, billTo: '' }
    const fieldConfidence = fieldScores(rng, { vendor: 0.62, invoiceNumber: 0.51 })
    documents.push({
      id,
      clientId,
      filename,
      mime: 'image/jpeg',
      sizeKb: rng.int(90, 700),
      uploadedAt: hoursAgo(hours + 18),
      uploadedBy: contact,
      status: 'rejected',
      paper,
      extraction: { vendor, date, invoiceNumber: paper.number, subtotal: total, tax: 0, total, currency: 'KYD', category, confidence: overall(fieldConfidence), fieldConfidence, source: 'seed' },
      entryType: 'expense',
      reviewedAt: hoursAgo(hours),
      reviewedBy: ACCOUNTANT,
      rejectionReason: reason,
    })
    say(id, ACCOUNTANT, 'accountant', `I've rejected this one: ${reason}`, hours)
    audit.push({ id: nextId('aud'), at: hoursAgo(hours + 18), actor: contact, actorRole: 'client', action: 'upload', clientId, docId: id, detail: `Uploaded ${filename}` })
    audit.push({ id: nextId('aud'), at: hoursAgo(hours), actor: ACCOUNTANT, actorRole: 'accountant', action: 'reject', clientId, docId: id, detail: `Rejected ${filename}: ${reason}` })
  }
  addRejected('seven-mile', JORDAN, 'Blue Iguana Cafe', 'receipt-lunch-photo.jpg', 'This looks like a personal lunch. If it was a client meal, tell me who it was with and re-upload it.', 30, 'Meals & entertainment', 64.8)
  addRejected('bodden-bakehouse', 'Priya Rankine', 'Island Fresh Dairy', 'dairy-duplicate.jpg', 'Duplicate of an invoice already posted this month.', 54, 'Cost of goods sold', 612.4)

  // One document mid-flight. The app finishes it a few seconds after loading.
  const processingDate = `${closePeriod}-${String(Number(lastDayOf(closePeriod).slice(-2)) - 1).padStart(2, '0')}`
  const processingPaper: Paper = { template: 'receipt', vendor: 'Harbour Fuel & Marine', date: processingDate, number: 'R-51177', subtotal: 214.6, tax: 0, total: 214.6, currency: 'KYD', category: 'Fuel & vehicles', billTo: '' }
  const processingId = 'doc-processing-1'
  documents.push({
    id: processingId,
    clientId: 'seven-mile',
    filename: 'fuel-receipt-boat-2.jpg',
    mime: 'image/jpeg',
    sizeKb: 412,
    uploadedAt: new Date(now.getTime() - 20_000).toISOString(),
    uploadedBy: JORDAN,
    status: 'processing',
    paper: processingPaper,
    entryType: 'expense',
  })
  audit.push({ id: nextId('aud'), at: new Date(now.getTime() - 20_000).toISOString(), actor: JORDAN, actorRole: 'client', action: 'upload', clientId: 'seven-mile', docId: processingId, detail: 'Uploaded fuel-receipt-boat-2.jpg' })
}

/** Reads a seeded document back at the end of its simulated processing. */
export function extractionFromPaper(paper: Paper, seed: string): ExtractionResult {
  return readPaper(paper, createRng(seed))
}
