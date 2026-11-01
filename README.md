# LedgerDesk

An AI-powered client portal for small accounting firms, replacing the usual mix of spreadsheets and email. This demo is set in a Cayman Islands firm, with bookkeeping in KYD and USD at the peg of 1 KYD = 1.20 USD.

## What it does

**Client view**
- Upload receipts and invoices by drag and drop (images or PDF)
- Follow each document through Processing, Needs review and Approved
- Message the accountant in a thread attached to each document

**Accountant view**
- **Dashboard:** clients, documents waiting, unreconciled items and month-end deadlines
- **Clients:** eight seeded Cayman businesses with close progress
- **Review queue:** document preview beside editable AI-extracted fields, with low-confidence fields highlighted. Nothing posts to the ledger until a person approves it
- **Ledger:** entries per client, with currency, KYD equivalent and a link to the source document
- **Bank reconciliation:** import a statement CSV (a sample is built in), auto-match by amount, date and vendor, then work through suggested and unmatched lines
- **Month-end report:** income vs expenses and expenses by category, with CSV export and a printable PDF view
- **Audit log:** every upload, AI extraction, edit, approval and export, with time and user

Switch roles from the demo switcher in the top bar. There is no real sign-in. All data is fake, lives in your browser's localStorage, and **Reset demo data** restores it.

## Run it locally

Requires Node 20 or newer.

```bash
npm install
```

```bash
npm run dev
```

The app opens at http://localhost:5173. `npm run dev` also serves `/api/extract`, so uploads work the same way as on Vercel.

To try uploads quickly, use the **Try a sample** strip on the client page. The same images are in `public/samples/`.

To build for production:

```bash
npm run build
```

## Set the Fireworks key on Vercel

Documents are read by DeepSeek V4.1 Flash on Fireworks AI (`accounts/fireworks/models/deepseek-v4p1-flash-1017`), called from one serverless function, `api/extract.ts`. The model takes image input, so the document goes to it directly as an image, with no separate OCR step. The model is set in that file and has no environment override.

1. Import this project into Vercel. It detects Vite and `vercel.json` needs no changes.
2. Go to **Settings → Environment Variables** and add `FIREWORKS_API_KEY` with your key from [fireworks.ai](https://fireworks.ai).
3. Redeploy. Environment variable changes only apply to new deployments.

For local development, copy `.env.example` to `.env.local` and fill in the key.

The key is only read on the server. Never give it a `VITE_` prefix, because Vite would then include it in the browser bundle.

## Running without a key

The demo always works. If the key is missing or a Fireworks call fails, `/api/extract` returns realistic mock data instead. The review screen and audit log show **DeepSeek V4.1 Flash** when the model read the document and **Demo extraction** when an upload fell back to mock data, so the two can't be confused. Seeded documents show a neutral **Imported** label instead. The sample images have matching mock values, and any other file gets plausible invented ones.

## Stack

React, Vite, TypeScript and Tailwind CSS, with one Vercel serverless function. Charts are hand-built SVG, and `pdfjs-dist` renders PDF uploads to an image before they are sent for reading.
