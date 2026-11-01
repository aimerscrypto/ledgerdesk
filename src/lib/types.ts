import type { ExtractionResult } from '../../api/_lib/mock-extraction'

export type { ExtractedField, ExtractionResult } from '../../api/_lib/mock-extraction'

export type Currency = 'KYD' | 'USD'
export type Role = 'client' | 'accountant'
export type EntryType = 'expense' | 'income'
export type DocStatus = 'processing' | 'needs_review' | 'approved' | 'rejected'
export type PaperTemplate = 'receipt' | 'invoice' | 'utility' | 'sales'

export interface Client {
  id: string
  name: string
  industry: string
  address: string
  contact: string
  email: string
  phone: string
  bankName: string
  bankCurrency: Currency
  monthEndDue: string
  since: string
}

/** What is physically printed on a seeded document. The AI's reading can differ from it. */
export interface Paper {
  template: PaperTemplate
  vendor: string
  date: string
  number: string
  subtotal: number
  tax: number
  total: number
  currency: Currency
  category: string
  billTo: string
  faint?: boolean
}

export type DocFields = Pick<
  ExtractionResult,
  'vendor' | 'date' | 'invoiceNumber' | 'subtotal' | 'tax' | 'total' | 'currency' | 'category'
>

export interface DocRecord {
  id: string
  clientId: string
  filename: string
  mime: string
  sizeKb: number
  uploadedAt: string
  uploadedBy: string
  status: DocStatus
  paper?: Paper
  hasStoredPreview?: boolean
  extraction?: ExtractionResult
  final?: DocFields
  entryType?: EntryType
  reviewedAt?: string
  reviewedBy?: string
  rejectionReason?: string
  ledgerEntryId?: string
  readAt?: Partial<Record<Role, string>>
}

export interface Message {
  id: string
  docId: string
  author: string
  role: Role
  body: string
  at: string
}

export interface LedgerEntry {
  id: string
  clientId: string
  date: string
  vendor: string
  category: string
  type: EntryType
  amount: number
  currency: Currency
  docId?: string
  bankTxnId?: string
  invoiceNumber?: string
  postedBy: string
  postedAt: string
}

export type MatchStatus = 'matched' | 'suggested' | 'unmatched' | 'excluded'

export interface BankTxn {
  id: string
  clientId: string
  period: string
  date: string
  description: string
  amount: number
  currency: Currency
  fingerprint: string
  status: MatchStatus
  ledgerEntryId?: string
  score?: number
  reasons?: string[]
  resolvedBy?: string
  note?: string
}

export interface Statement {
  id: string
  clientId: string
  period: string
  filename: string
  importedAt: string
  importedBy: string
  lineCount: number
}

export type AuditAction =
  | 'upload'
  | 'ai_extraction'
  | 'demo_extraction'
  | 'seed_import'
  | 'edit'
  | 'approve'
  | 'reject'
  | 'post'
  | 'export'
  | 'import'
  | 'reconcile'
  | 'message'
  | 'system'

export interface AuditEvent {
  id: string
  seq: number
  at: string
  actor: string
  actorRole: Role | 'system'
  action: AuditAction
  clientId?: string
  docId?: string
  detail: string
}

export interface Session {
  role: Role
  clientId: string
}

export interface AppState {
  version: number
  seededAt: string
  closePeriod: string
  session: Session
  clients: Client[]
  documents: DocRecord[]
  messages: Message[]
  ledger: LedgerEntry[]
  bank: BankTxn[]
  statements: Statement[]
  audit: AuditEvent[]
}
