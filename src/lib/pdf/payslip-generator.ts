import React, { type ReactElement } from 'react'
import { pdf, type DocumentProps } from '@react-pdf/renderer'
import { PayslipDocument } from './payslip-document'
import type { PayslipData } from '@/actions/payroll'

export async function generatePayslipPdf(data: PayslipData): Promise<Blob> {
  const doc = React.createElement(PayslipDocument, {
    data,
  }) as unknown as ReactElement<DocumentProps>
  return pdf(doc).toBlob()
}
