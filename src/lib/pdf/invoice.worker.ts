import { generateInvoicePdf } from './invoice-generator'
import type { InvoiceData } from './types'

export type InvoiceWorkerRequest = {
  type: 'generate'
  data: InvoiceData
}

export type InvoiceWorkerResponse =
  | { type: 'success'; blob: Blob }
  | { type: 'error'; message: string }

self.onmessage = async (event: MessageEvent<InvoiceWorkerRequest>) => {
  const { type, data } = event.data

  if (type === 'generate') {
    try {
      const blob = await generateInvoicePdf(data)
      ;(self as unknown as Worker).postMessage({
        type: 'success',
        blob,
      } satisfies InvoiceWorkerResponse)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed'
      ;(self as unknown as Worker).postMessage({
        type: 'error',
        message,
      } satisfies InvoiceWorkerResponse)
    }
  }
}
