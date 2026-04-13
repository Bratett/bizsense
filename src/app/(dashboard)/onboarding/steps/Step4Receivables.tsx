'use client'

import { useState, useTransition } from 'react'
import {
  completeOnboardingStep4,
  importCustomersCsv,
  importInvoicesCsv,
} from '@/actions/onboarding'
import CsvImportModal from '@/components/CsvImportModal.client'
import { validateCustomersCsv } from '@/lib/csvImport/validateCustomers'
import { validateInvoicesCsv } from '@/lib/csvImport/validateInvoices'
import {
  generateCustomersTemplate,
  generateInvoicesTemplate,
} from '@/lib/csvImport/generateTemplate'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

type InvoiceRow = {
  customerName: string
  phone: string
  amount: string
  invoiceDate: string
  dueDate: string
}

function defaultDueDate(invoiceDate: string): string {
  if (!invoiceDate) return ''
  const d = new Date(invoiceDate)
  d.setDate(d.getDate() + 30)
  return d.toISOString().split('T')[0]
}

const emptyRow: InvoiceRow = {
  customerName: '',
  phone: '',
  amount: '',
  invoiceDate: new Date().toISOString().split('T')[0],
  dueDate: defaultDueDate(new Date().toISOString().split('T')[0]),
}

type Props = {
  onComplete: () => void
  onBack: () => void
}

export default function Step4Receivables({ onComplete, onBack }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showInvoiceCsvModal, setShowInvoiceCsvModal] = useState(false)
  const [showCustomerCsvModal, setShowCustomerCsvModal] = useState(false)
  const [customerImportMessage, setCustomerImportMessage] = useState('')
  const [rows, setRows] = useState<InvoiceRow[]>([{ ...emptyRow }])

  function updateRow(index: number, field: keyof InvoiceRow, value: string) {
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      // Auto-set due date when invoice date changes
      if (field === 'invoiceDate' && value) {
        next[index].dueDate = defaultDueDate(value)
      }
      return next
    })
  }

  function addRow() {
    if (rows.length >= 100) return
    setRows((prev) => [...prev, { ...emptyRow }])
  }

  function removeRow(index: number) {
    if (rows.length <= 1) return
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const total = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)

  function handleSubmit() {
    setError('')

    const validInvoices = rows.filter((r) => r.customerName.trim())
    if (validInvoices.length === 0) {
      setError('Add at least one invoice or skip this step')
      return
    }

    for (const inv of validInvoices) {
      if (!inv.amount || parseFloat(inv.amount) <= 0) {
        setError(`Invoice for "${inv.customerName}": amount is required and must be greater than 0`)
        return
      }
      if (!inv.invoiceDate) {
        setError(`Invoice for "${inv.customerName}": invoice date is required`)
        return
      }
    }

    startTransition(async () => {
      const result = await completeOnboardingStep4({
        invoices: validInvoices.map((r) => ({
          customerName: r.customerName.trim(),
          phone: r.phone.trim() || undefined,
          amount: parseFloat(r.amount),
          invoiceDate: r.invoiceDate,
          dueDate: r.dueDate || undefined,
        })),
      })
      if (result.success) {
        onComplete()
      } else {
        setError(result.error)
      }
    })
  }

  if (!showForm) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle>Does anyone owe you money?</CardTitle>
            <CardDescription>
              Add customers who haven&apos;t paid yet. Skip if no outstanding invoices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {customerImportMessage && (
              <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                {customerImportMessage}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Button
                type="button"
                onClick={() => setShowForm(true)}
                className="w-full bg-green-700 hover:bg-green-800 active:bg-green-900"
                size="lg"
              >
                Yes, add invoices
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowInvoiceCsvModal(true)}
                className="w-full"
                size="lg"
              >
                Import invoices from CSV
              </Button>
              <Button
                type="button"
                variant="link"
                onClick={() => setShowCustomerCsvModal(true)}
                className="text-sm font-medium text-green-700 hover:text-green-800"
              >
                Import customers from CSV
              </Button>
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onBack}
                  className="text-sm text-muted-foreground"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onComplete}
                  className="text-sm text-muted-foreground/60"
                >
                  Skip this step
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <CsvImportModal
          isOpen={showInvoiceCsvModal}
          onClose={() => setShowInvoiceCsvModal(false)}
          title="Import Invoices from CSV"
          templateFilename="bizsense-invoices-template.csv"
          generateTemplate={generateInvoicesTemplate}
          validate={validateInvoicesCsv}
          onImport={async (rows) => {
            const result = await importInvoicesCsv({ invoices: rows })
            if (result.success) {
              setTimeout(() => onComplete(), 1500)
            }
            return result
          }}
          columns={[
            { key: 'customerName', label: 'Customer' },
            { key: 'invoiceAmount', label: 'Amount' },
            { key: 'invoiceDate', label: 'Date' },
            { key: 'dueDate', label: 'Due Date' },
          ]}
        />

        <CsvImportModal
          isOpen={showCustomerCsvModal}
          onClose={() => setShowCustomerCsvModal(false)}
          title="Import Customers from CSV"
          templateFilename="bizsense-customers-template.csv"
          generateTemplate={generateCustomersTemplate}
          validate={validateCustomersCsv}
          onImport={async (rows) => {
            const result = await importCustomersCsv({ customers: rows })
            if (result.success) {
              setCustomerImportMessage(
                `Imported ${result.imported} customers. You can now add invoices.`,
              )
            }
            return result
          }}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'phone', label: 'Phone' },
            { key: 'location', label: 'Location' },
            { key: 'creditLimit', label: 'Credit Limit' },
          ]}
        />
      </>
    )
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Outstanding Invoices</CardTitle>
        <Button
          type="button"
          variant="ghost"
          onClick={onComplete}
          disabled={isPending}
          className="text-sm text-muted-foreground/60"
        >
          Skip this step
        </Button>
      </CardHeader>
      <CardContent>
        <p className="mt-1 text-sm text-gray-500">Add customers who still owe you money.</p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-4">
          {rows.map((row, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">Invoice {i + 1}</span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={isPending}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={row.customerName}
                  onChange={(e) => updateRow(i, 'customerName', e.target.value)}
                  disabled={isPending}
                  placeholder="Customer Name *"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                           placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="tel"
                    inputMode="tel"
                    value={row.phone}
                    onChange={(e) => updateRow(i, 'phone', e.target.value)}
                    disabled={isPending}
                    placeholder="Phone"
                    className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                             placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                  />
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      GHS
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={row.amount}
                      onChange={(e) => updateRow(i, 'amount', e.target.value)}
                      disabled={isPending}
                      placeholder="Amount *"
                      className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm text-right text-gray-900
                               placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs text-gray-500">Invoice Date *</label>
                    <input
                      type="date"
                      value={row.invoiceDate}
                      onChange={(e) => updateRow(i, 'invoiceDate', e.target.value)}
                      disabled={isPending}
                      className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                               focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs text-gray-500">Due Date</label>
                    <input
                      type="date"
                      value={row.dueDate}
                      onChange={(e) => updateRow(i, 'dueDate', e.target.value)}
                      disabled={isPending}
                      className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                               focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          {rows.length < 100 && (
            <button
              type="button"
              onClick={addRow}
              disabled={isPending}
              className="text-sm font-medium text-green-700 hover:text-green-800"
            >
              + Add another invoice
            </button>
          )}

          {/* Total */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">Total Receivables</span>
            <span className="text-base font-semibold text-gray-900">
              GHS{' '}
              {total.toLocaleString('en-GH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>

          {/* Actions */}
          <div className="mt-2 flex flex-col gap-2">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="w-full bg-green-700 hover:bg-green-800 active:bg-green-900"
              size="lg"
            >
              {isPending ? 'Saving\u2026' : 'Continue'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={isPending}
              className="text-sm text-muted-foreground"
            >
              Back
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
