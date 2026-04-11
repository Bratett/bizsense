import React, { type ReactElement } from 'react'
import { pdf, type DocumentProps } from '@react-pdf/renderer'
import { SupplierStatementDocument } from './supplierStatementDocument'
import type { SupplierStatementData } from './supplierStatementDocument'

export type { SupplierStatementData }

export async function generateSupplierStatementPdf(data: SupplierStatementData): Promise<Blob> {
  const doc = React.createElement(
    SupplierStatementDocument,
    { data },
  ) as unknown as ReactElement<DocumentProps>
  return pdf(doc).toBlob()
}
