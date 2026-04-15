import { generatePayslipPdf } from './payslip-generator'
import type { PayslipData } from '@/actions/payroll'

export type PayslipWorkerRequest = {
  type: 'generate'
  data: PayslipData
}

export type PayslipWorkerResponse =
  | { type: 'success'; blob: Blob }
  | { type: 'error'; message: string }

self.onmessage = async (event: MessageEvent<PayslipWorkerRequest>) => {
  const { type, data } = event.data

  if (type === 'generate') {
    try {
      const blob = await generatePayslipPdf(data)
      ;(self as unknown as Worker).postMessage({
        type: 'success',
        blob,
      } satisfies PayslipWorkerResponse)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed'
      ;(self as unknown as Worker).postMessage({
        type: 'error',
        message,
      } satisfies PayslipWorkerResponse)
    }
  }
}
