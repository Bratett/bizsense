'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, Download, AlertCircle, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react'
import { parseAndValidateExpenseCsv, type CsvExpenseRow } from '@/lib/expenses/csvImport'
import { importExpensesFromCsv } from '@/actions/expenses'
import { Button } from '@/components/ui/button'
import type { UserRole } from '@/lib/session'
import { formatGhs } from '@/lib/format'

// CSV template rows — one per common category
const CSV_TEMPLATE = `date,category,amount,payment_method,description
01/04/2026,Transport & Fuel,80,cash,Fuel for delivery van
02/04/2026,Rent,1200,bank,April office rent
03/04/2026,Utilities,150,mtn momo,Electricity bill
`

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  momo_mtn: 'MTN MoMo',
  momo_telecel: 'Telecel',
  momo_airtel: 'AirtelTigo',
  bank: 'Bank',
}

export default function ExpenseCsvImport({ userRole }: { userRole: UserRole }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const [validRows, setValidRows] = useState<CsvExpenseRow[]>([])
  const [errors, setErrors] = useState<Array<{ row: number; field: string; message: string }>>([])
  const [warnings, setWarnings] = useState<Array<{ row: number; message: string }>>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileParsed, setFileParsed] = useState(false)

  function handleDownloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'expense_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB.')
      return
    }

    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const result = parseAndValidateExpenseCsv(text)
      setValidRows(result.valid)
      setErrors(result.errors)
      setWarnings(result.warnings)
      setFileParsed(true)
    }
    reader.readAsText(file)
  }

  function handleImport() {
    if (errors.length > 0 || validRows.length === 0) return

    startTransition(async () => {
      try {
        const result = await importExpensesFromCsv(validRows)
        toast.success(`Imported ${result.imported} expense${result.imported === 1 ? '' : 's'} successfully.`)
        router.push('/expenses')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Import failed. Please try again.')
      }
    })
  }

  // Build a combined row map for the preview table
  // row number → status ('valid' | 'warning' | 'error'), messages
  const rowStatuses = new Map<number, { status: 'error' | 'warning'; messages: string[] }>()
  for (const e of errors) {
    const entry = rowStatuses.get(e.row) ?? { status: 'error' as const, messages: [] }
    entry.status = 'error'
    entry.messages.push(e.message)
    rowStatuses.set(e.row, entry)
  }
  for (const w of warnings) {
    if (!rowStatuses.has(w.row)) {
      rowStatuses.set(w.row, { status: 'warning', messages: [w.message] })
    } else {
      rowStatuses.get(w.row)!.messages.push(w.message)
    }
  }

  const canImport = fileParsed && errors.length === 0 && validRows.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Import Expenses from CSV</h1>
          <p className="text-sm text-gray-500">Bulk-import historical or batch expenses</p>
        </div>
      </div>

      {/* Template download + file picker */}
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
        <Upload className="mx-auto mb-3 h-8 w-8 text-gray-400" />
        <p className="text-sm font-medium text-gray-700">Choose a CSV file to import</p>
        <p className="mt-1 text-xs text-gray-500">Maximum file size: 5MB</p>
        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleDownloadTemplate}
          >
            <Download className="h-4 w-4" />
            Download Template
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {fileName ? 'Change File' : 'Choose File'}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileChange}
        />
        {fileName && (
          <p className="mt-3 text-xs text-gray-500">
            Selected: <span className="font-medium text-gray-700">{fileName}</span>
          </p>
        )}
      </div>

      {/* Validation summary */}
      {fileParsed && (
        <div className="space-y-2">
          {errors.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>
                <strong>{errors.length} error{errors.length === 1 ? '' : 's'}</strong> must be
                fixed before importing.
              </span>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>
                <strong>{warnings.length} warning{warnings.length === 1 ? '' : 's'}</strong> —
                these rows will still import.
              </span>
            </div>
          )}
          {errors.length === 0 && validRows.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>
                <strong>{validRows.length} row{validRows.length === 1 ? '' : 's'}</strong> ready to
                import.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Preview table */}
      {fileParsed && validRows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Method</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {validRows.map((row, idx) => {
                  const displayRow = idx + 2 // header is row 1
                  const status = rowStatuses.get(displayRow)
                  const rowBg =
                    status?.status === 'error'
                      ? 'bg-red-50'
                      : status?.status === 'warning'
                        ? 'bg-amber-50'
                        : ''
                  return (
                    <tr key={idx} className={rowBg}>
                      <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{row.date}</td>
                      <td className="px-3 py-2 text-gray-700">{row.category}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">
                        {formatGhs(row.amount)}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {PAYMENT_LABELS[row.paymentMethod] ?? row.paymentMethod}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-gray-700">
                        {row.description}
                      </td>
                      <td className="px-3 py-2">
                        {status ? (
                          <div className="space-y-1">
                            {status.messages.map((msg, mi) => (
                              <p
                                key={mi}
                                className={`text-xs ${
                                  status.status === 'error' ? 'text-red-600' : 'text-amber-600'
                                }`}
                              >
                                {msg}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Error rows — shown separately when they exist */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-2 text-sm font-medium text-red-700">Rows with errors (fix and re-upload):</p>
          <ul className="space-y-1 text-xs text-red-600">
            {errors.map((e, i) => (
              <li key={i}>
                Row {e.row}, <span className="font-medium">{e.field}</span>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Import button */}
      {fileParsed && (
        <Button
          type="button"
          size="lg"
          className="w-full py-3 text-base"
          onClick={handleImport}
          disabled={!canImport || isPending}
        >
          {isPending
            ? 'Importing...'
            : canImport
              ? `Import ${validRows.length} Expense${validRows.length === 1 ? '' : 's'}`
              : `Fix ${errors.length} error${errors.length === 1 ? '' : 's'} before importing`}
        </Button>
      )}

      {userRole === 'cashier' && (
        <p className="text-center text-xs text-amber-600">
          As a cashier, imported expenses will be submitted for approval.
        </p>
      )}
    </div>
  )
}
