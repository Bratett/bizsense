import React, { type ReactElement } from 'react'
import { pdf, type DocumentProps } from '@react-pdf/renderer'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReportSection = {
  heading?: string
  rows: Array<{
    label: string
    value: string
    indent?: number
    bold?: boolean
    separator?: boolean
  }>
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

/**
 * Build a CSV blob from an array of row objects and trigger a browser download.
 * Uses BOM prefix (\uFEFF) for correct Excel display of GHS amounts.
 * Called from client component event handlers only — never on the server.
 */
export function downloadCsv(filename: string, rows: Record<string, string | number>[]): void {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])
  const escape = (cell: string | number) => {
    const s = String(cell)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h] ?? '')).join(',')),
  ]

  const blob = new Blob(['\uFEFF' + lines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

/**
 * Generate a report PDF blob using react-pdf.
 * Follows the same pattern as src/lib/pdf/invoice-generator.ts.
 * Pass the react-pdf Document component and its data — this function
 * handles the createElement + toBlob plumbing.
 */
export async function generateReportPdf<T>(
  DocumentComponent: React.ComponentType<{ data: T }>,
  data: T,
): Promise<Blob> {
  const doc = React.createElement(DocumentComponent, {
    data,
  }) as unknown as ReactElement<DocumentProps>
  return pdf(doc).toBlob()
}
