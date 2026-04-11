import { generateSupplierStatementPdf } from './supplierStatement'
import type { SupplierStatementData } from './supplierStatementDocument'

export type SupplierStatementWorkerRequest = {
  type: 'generate'
  data: SupplierStatementData
}

export type SupplierStatementWorkerResponse =
  | { type: 'success'; blob: Blob }
  | { type: 'error'; message: string }

self.onmessage = async (event: MessageEvent<SupplierStatementWorkerRequest>) => {
  const { type, data } = event.data

  if (type === 'generate') {
    try {
      const blob = await generateSupplierStatementPdf(data)
      ;(self as unknown as Worker).postMessage({
        type: 'success',
        blob,
      } satisfies SupplierStatementWorkerResponse)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed'
      ;(self as unknown as Worker).postMessage({
        type: 'error',
        message,
      } satisfies SupplierStatementWorkerResponse)
    }
  }
}
