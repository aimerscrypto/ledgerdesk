export const MAX_UPLOAD_MB = 15

export interface PreparedUpload {
  /** Sent to the vision model. Sized to stay well under Vercel's 4.5 MB body limit. */
  apiImage: string | null
  /** Smaller copy kept for the review screen. */
  preview: string | null
}

function canvasToJpeg(source: CanvasImageSource, width: number, height: number, maxEdge: number, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

async function renderPdfFirstPage(file: File): Promise<HTMLCanvasElement> {
  // Loaded on demand: pdf.js is large and only needed when someone uploads a PDF.
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() })
  const pdf = await task.promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, viewport }).promise
  await task.destroy()
  return canvas
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally {
    // decode() has finished, and the canvas draw happens on the loaded bitmap.
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}

/** Never throws: an unreadable file still enters the flow, just without a picture. */
export async function prepareUpload(file: File): Promise<PreparedUpload> {
  try {
    let source: CanvasImageSource
    let width: number
    let height: number
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const canvas = await renderPdfFirstPage(file)
      source = canvas
      width = canvas.width
      height = canvas.height
    } else {
      const image = await loadImage(file)
      source = image
      width = image.naturalWidth
      height = image.naturalHeight
    }
    return {
      apiImage: canvasToJpeg(source, width, height, 1600, 0.85),
      preview: canvasToJpeg(source, width, height, 1000, 0.68),
    }
  } catch {
    return { apiImage: null, preview: null }
  }
}

export function isAcceptedFile(file: File): boolean {
  return file.type.startsWith('image/') || file.type === 'application/pdf' || /\.(pdf|png|jpe?g|webp)$/i.test(file.name)
}
