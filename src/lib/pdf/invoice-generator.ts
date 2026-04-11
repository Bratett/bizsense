import React, { type ReactElement } from 'react'
import { pdf, type DocumentProps } from '@react-pdf/renderer'
import { InvoiceDocument } from './invoice-document'
import type { InvoiceData } from './types'

export async function generateInvoicePdf(data: InvoiceData): Promise<Blob> {
  // InvoiceDocument renders a <Document> at runtime — cast is safe
  const doc = React.createElement(InvoiceDocument, {
    data,
  }) as unknown as ReactElement<DocumentProps>
  const blob = await pdf(doc).toBlob()
  return blob
}
