'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronUp, Pencil, CheckCircle, AlertTriangle } from 'lucide-react'
import {
  approvePayrollRun,
  updatePayrollLine,
  recordPayrollPayment,
  recordBatchPayrollPayment,
} from '@/actions/payroll'
import type { PayrollRunWithLines, PayrollLineDetail } from '@/actions/payroll'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import PayslipButton from '@/components/PayslipButton.client'

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmt(value: string | null | undefined): string {
  if (!value) return '0.00'
  return parseFloat(value).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtGHS(value: string | null | undefined): string {
  return `GHS ${fmt(value)}`
}

function formatPeriodHeader(periodStart: string): string {
  const d = new Date(periodStart + 'T00:00:00Z')
  return d.toLocaleDateString('en-GH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function formatPeriodLabel(periodStart: string): string {
  const d = new Date(periodStart + 'T00:00:00Z')
  return d.toLocaleDateString('en-GH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function formatDateShort(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  mtn_momo: 'MTN MoMo',
  telecel: 'Telecel Cash',
  airteltigo: 'AirtelTigo Money',
  bank: 'Bank Transfer',
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        Approved — payment pending
      </Badge>
    )
  }
  if (status === 'paid') {
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>
  }
  return <Badge variant="secondary">Draft — pending approval</Badge>
}

// ─── Inline adjustment panel ──────────────────────────────────────────────────

function AdjustmentPanel({
  line,
  onSaved,
  onCancel,
}: {
  line: PayrollLineDetail
  onSaved: (updated: {
    lineId: string
    totalGross: string
    totalDeductions: string
    totalNet: string
  }) => void
  onCancel: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const currentOther = Number(line.otherDeductions)
  const [rawValue, setRawValue] = useState(
    currentOther < 0
      ? String(Math.abs(currentOther))
      : currentOther > 0
        ? String(currentOther)
        : '',
  )
  const [adjustType, setAdjustType] = useState<'bonus' | 'deduction'>(
    currentOther < 0 ? 'bonus' : 'deduction',
  )

  const handleSave = () => {
    setError(null)
    const amount = parseFloat(rawValue || '0')
    if (isNaN(amount) || amount < 0) {
      setError('Enter a valid amount.')
      return
    }
    const otherDeductions = adjustType === 'bonus' ? -amount : amount

    startTransition(async () => {
      try {
        const result = await updatePayrollLine(line.id, { otherDeductions })
        onSaved(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update line.')
      }
    })
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex gap-3">
        <div className="flex-1">
          <Label className="text-sm font-medium text-gray-700">Type</Label>
          <select
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={adjustType}
            onChange={(e) => setAdjustType(e.target.value as 'bonus' | 'deduction')}
            disabled={isPending}
          >
            <option value="bonus">Bonus / Extra pay</option>
            <option value="deduction">Deduction (leave, advance…)</option>
          </select>
        </div>
        <div className="w-40">
          <Label className="text-sm font-medium text-gray-700">Amount (GHS)</Label>
          <Input
            className="mt-1 h-10"
            type="number"
            min="0"
            step="0.01"
            value={rawValue}
            onChange={(e) => setRawValue(e.target.value)}
            placeholder="0.00"
            disabled={isPending}
          />
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? 'Recomputing…' : 'Recompute'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ─── Journal entry preview ────────────────────────────────────────────────────

function JournalPreview({
  lines,
  totalGross,
  totalNet,
}: {
  lines: PayrollLineDetail[]
  totalGross: string | null
  totalNet: string | null
}) {
  const [open, setOpen] = useState(false)

  const totalSsnit = lines.reduce(
    (s, l) => s + Number(l.ssnitEmployee) + Number(l.ssnitEmployer),
    0,
  )
  const totalPaye = lines.reduce((s, l) => s + Number(l.payeTax), 0)
  const totalDebit = lines.reduce(
    (s, l) => s + Number(l.grossSalary) - Number(l.otherDeductions) + Number(l.ssnitEmployer),
    0,
  )
  const totalCredit = totalSsnit + totalPaye + lines.reduce((s, l) => s + Number(l.netSalary), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.02

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span>Journal Entry Preview</span>
        <div className="flex items-center gap-2">
          {isBalanced ? (
            <span className="flex items-center gap-1 text-green-600 text-xs font-normal">
              <CheckCircle className="h-4 w-4" /> Balanced
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-600 text-xs font-normal">
              <AlertTriangle className="h-4 w-4" /> Imbalanced
            </span>
          )}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 px-4 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="pb-1 text-left font-normal">Account</th>
                <th className="pb-1 text-right font-normal">Dr</th>
                <th className="pb-1 text-right font-normal">Cr</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-1.5 text-gray-700">6001 Salaries &amp; Wages</td>
                <td className="py-1.5 text-right font-mono text-gray-900">
                  {fmt(String(Math.round(totalDebit * 100) / 100))}
                </td>
                <td className="py-1.5 text-right text-gray-400">—</td>
              </tr>
              <tr>
                <td className="py-1.5 text-gray-700">2200 SSNIT Payable</td>
                <td className="py-1.5 text-right text-gray-400">—</td>
                <td className="py-1.5 text-right font-mono text-gray-900">
                  {fmt(String(Math.round(totalSsnit * 100) / 100))}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-gray-700">2300 PAYE Payable</td>
                <td className="py-1.5 text-right text-gray-400">—</td>
                <td className="py-1.5 text-right font-mono text-gray-900">
                  {fmt(String(Math.round(totalPaye * 100) / 100))}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-gray-700">2500 Net Salaries Payable</td>
                <td className="py-1.5 text-right text-gray-400">—</td>
                <td className="py-1.5 text-right font-mono text-gray-900">{fmt(totalNet)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-300 text-xs font-semibold text-gray-600">
                <td className="pt-2">Total</td>
                <td className="pt-2 text-right font-mono">
                  {fmt(String(Math.round(totalDebit * 100) / 100))}
                </td>
                <td className="pt-2 text-right font-mono">
                  {fmt(String(Math.round(totalCredit * 100) / 100))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Inline Pay Now panel ─────────────────────────────────────────────────────

function PayNowPanel({
  line,
  defaultMethod,
  defaultDate,
  onPaid,
  onCancel,
}: {
  line: PayrollLineDetail
  defaultMethod: string
  defaultDate: string
  onPaid: (lineId: string, method: string, paidAt: Date) => void
  onCancel: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [method, setMethod] = useState(defaultMethod)
  const [date, setDate] = useState(defaultDate)
  const [reference, setReference] = useState('')

  const handlePay = () => {
    setError(null)
    startTransition(async () => {
      try {
        await recordPayrollPayment({
          payrollLineId: line.id,
          paymentMethod: method,
          paymentDate: date,
          reference: reference || undefined,
        })
        onPaid(line.id, method, new Date())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Payment failed.')
      }
    })
  }

  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <p className="mb-3 text-sm font-medium text-blue-800">
        Pay: {line.staffName} — {fmtGHS(line.netSalary)}
      </p>
      <div className="flex flex-wrap gap-3">
        <div className="w-40">
          <Label className="text-xs font-medium text-gray-700">Payment Method</Label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            disabled={isPending}
          >
            <option value="cash">Cash</option>
            <option value="mtn_momo">MTN MoMo</option>
            <option value="telecel">Telecel Cash</option>
            <option value="airteltigo">AirtelTigo Money</option>
            <option value="bank">Bank Transfer</option>
          </select>
        </div>
        <div className="w-40">
          <Label className="text-xs font-medium text-gray-700">Date</Label>
          <Input
            className="mt-1 h-9"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="flex-1 min-w-32">
          <Label className="text-xs font-medium text-gray-700">Reference (optional)</Label>
          <Input
            className="mt-1 h-9"
            placeholder="MoMo or bank ref…"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={isPending}
          />
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={handlePay} disabled={isPending}>
          {isPending ? 'Recording…' : 'Record Payment'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PayrollRunDetail({ initialRun }: { initialRun: PayrollRunWithLines }) {
  const [run, setRun] = useState(initialRun)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [payingLineId, setPayingLineId] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [singleUserWarning, setSingleUserWarning] = useState(false)
  const [approvePending, startApproveTransition] = useTransition()

  // Batch payment controls
  const [batchMethod, setBatchMethod] = useState('mtn_momo')
  const [batchDate, setBatchDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [batchPending, startBatchTransition] = useTransition()
  const [batchError, setBatchError] = useState<string | null>(null)
  const [batchResult, setBatchResult] = useState<{ paid: number; skipped: number } | null>(null)

  const isDraft = run.status === 'draft'
  const isApproved = run.status === 'approved'
  const isPaidStatus = run.status === 'paid'
  const showPaymentSection = isApproved || isPaidStatus

  const period = formatPeriodLabel(run.periodStart)

  // Called when a line adjustment is saved — updates the line in state + run totals
  function handleLineSaved(updated: {
    lineId: string
    totalGross: string
    totalDeductions: string
    totalNet: string
  }) {
    setRun((prev) => ({
      ...prev,
      totalGross: updated.totalGross,
      totalDeductions: updated.totalDeductions,
      totalNet: updated.totalNet,
    }))
    setEditingLineId(null)
  }

  function handleApprove() {
    setApproveError(null)
    startApproveTransition(async () => {
      try {
        const result = await approvePayrollRun(run.id)
        if (result.isSingleUser) setSingleUserWarning(true)
        setRun((prev) => ({ ...prev, status: 'approved' }))
      } catch (err) {
        setApproveError(err instanceof Error ? err.message : 'Failed to approve payroll run.')
      }
    })
  }

  function handleLinePaid(lineId: string, method: string, paidAt: Date) {
    setRun((prev) => {
      const updatedLines = prev.lines.map((l) =>
        l.id === lineId ? { ...l, isPaid: true, paidAt, paymentMethod: method } : l,
      )
      const allPaid = updatedLines.every((l) => l.isPaid)
      return { ...prev, lines: updatedLines, status: allPaid ? 'paid' : prev.status }
    })
    setPayingLineId(null)
  }

  function handleBatchPay() {
    setBatchError(null)
    setBatchResult(null)
    startBatchTransition(async () => {
      try {
        const result = await recordBatchPayrollPayment({
          payrollRunId: run.id,
          paymentMethod: batchMethod,
          paymentDate: batchDate,
        })
        setBatchResult(result)
        // Optimistically mark all unpaid lines as paid
        setRun((prev) => {
          const updatedLines = prev.lines.map((l) =>
            l.isPaid ? l : { ...l, isPaid: true, paidAt: new Date(), paymentMethod: batchMethod },
          )
          return { ...prev, lines: updatedLines, status: 'paid' }
        })
      } catch (err) {
        setBatchError(err instanceof Error ? err.message : 'Batch payment failed.')
      }
    })
  }

  const paidCount = run.lines.filter((l) => l.isPaid).length

  return (
    <main className="min-h-screen bg-gray-50 p-4 pb-24 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={`Payroll — ${formatPeriodHeader(run.periodStart)}`}
          backHref="/payroll"
          actions={<StatusBadge status={run.status} />}
        />

        {/* Summary row */}
        <div className="mt-6 grid grid-cols-3 gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div>
            <p className="text-xs text-gray-400">Staff</p>
            <p className="text-lg font-semibold text-gray-900">{run.lines.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Total Gross</p>
            <p className="text-lg font-semibold text-gray-900">{fmtGHS(run.totalGross)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Total Net</p>
            <p className="text-lg font-semibold text-gray-900">{fmtGHS(run.totalNet)}</p>
          </div>
        </div>

        {/* Single-user warning */}
        {singleUserWarning && (
          <Alert className="mt-4 border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              You are the only user on this account. Normally payroll should be approved by a
              different person than who created it. Continue with caution and verify figures
              independently.
            </AlertDescription>
          </Alert>
        )}

        {/* Approval error */}
        {approveError && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{approveError}</AlertDescription>
          </Alert>
        )}

        {/* Staff lines table */}
        <div className="mt-6 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="border-b border-gray-100">
              <tr className="text-xs text-gray-400">
                <th className="px-4 py-3 text-left font-medium">Staff</th>
                <th className="px-4 py-3 text-right font-medium">Gross</th>
                <th className="px-4 py-3 text-right font-medium">Emp. SSNIT</th>
                <th className="px-4 py-3 text-right font-medium">Empr. SSNIT</th>
                <th className="px-4 py-3 text-right font-medium">PAYE</th>
                <th className="px-4 py-3 text-right font-medium">Adjustment</th>
                <th className="px-4 py-3 text-right font-medium">Net</th>
                {showPaymentSection && (
                  <th className="px-4 py-3 text-right font-medium">Payment Status</th>
                )}
                {showPaymentSection && (
                  <th className="px-4 py-3 text-right font-medium">Payslip</th>
                )}
                {isDraft && <th className="px-4 py-3 text-right font-medium"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {run.lines.map((line) => {
                const other = Number(line.otherDeductions)
                const adjustLabel =
                  other < 0
                    ? `+${fmt(String(Math.abs(other)))}`
                    : other > 0
                      ? `-${fmt(line.otherDeductions)}`
                      : '—'

                return (
                  <tr key={line.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{line.staffName}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {fmt(line.grossSalary)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {fmt(line.ssnitEmployee)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {fmt(line.ssnitEmployer)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {fmt(line.payeTax)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {other !== 0 ? (
                        <span className={other < 0 ? 'text-green-600' : 'text-red-600'}>
                          {adjustLabel}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                      {fmt(line.netSalary)}
                    </td>

                    {/* Payment status column */}
                    {showPaymentSection && (
                      <td className="px-4 py-3 text-right">
                        {line.isPaid ? (
                          <span className="flex items-center justify-end gap-1 text-green-700">
                            <CheckCircle className="h-4 w-4 shrink-0" />
                            <span className="text-xs">
                              {METHOD_LABELS[line.paymentMethod ?? ''] ?? line.paymentMethod}
                              <br />
                              <span className="text-gray-400">{formatDateShort(line.paidAt)}</span>
                            </span>
                          </span>
                        ) : (
                          isApproved && (
                            <button
                              className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                              onClick={() =>
                                setPayingLineId((id) => (id === line.id ? null : line.id))
                              }
                              type="button"
                            >
                              Pay Now
                            </button>
                          )
                        )}
                      </td>
                    )}

                    {/* Payslip column */}
                    {showPaymentSection && (
                      <td className="px-4 py-3 text-right">
                        <PayslipButton
                          payrollLineId={line.id}
                          staffName={line.staffName}
                          payrollRunId={run.id}
                          staffId={line.staffId}
                          period={period}
                          netSalary={line.netSalary}
                        />
                      </td>
                    )}

                    {isDraft && (
                      <td className="px-4 py-3 text-right">
                        <button
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          onClick={() =>
                            setEditingLineId((id) => (id === line.id ? null : line.id))
                          }
                          title="Edit adjustment"
                          type="button"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Inline adjustment panel below edited row */}
          {editingLineId &&
            (() => {
              const line = run.lines.find((l) => l.id === editingLineId)
              if (!line) return null
              return (
                <div className="border-t border-gray-100 px-4 pb-4 pt-2">
                  <p className="mb-2 text-sm font-medium text-gray-700">
                    Adjusting: {line.staffName}
                  </p>
                  <AdjustmentPanel
                    line={line}
                    onSaved={handleLineSaved}
                    onCancel={() => setEditingLineId(null)}
                  />
                </div>
              )
            })()}

          {/* Inline Pay Now panel */}
          {payingLineId &&
            (() => {
              const line = run.lines.find((l) => l.id === payingLineId)
              if (!line) return null
              return (
                <div className="border-t border-gray-100 px-4 pb-4 pt-2">
                  <PayNowPanel
                    line={line}
                    defaultMethod={batchMethod}
                    defaultDate={batchDate}
                    onPaid={handleLinePaid}
                    onCancel={() => setPayingLineId(null)}
                  />
                </div>
              )
            })()}
        </div>

        {/* ── Approval section (draft only) ── */}
        {isDraft && (
          <div className="mt-6 space-y-4">
            <JournalPreview lines={run.lines} totalGross={run.totalGross} totalNet={run.totalNet} />

            <Button
              className="h-13 w-full text-base"
              onClick={handleApprove}
              disabled={approvePending || run.status !== 'draft'}
            >
              {approvePending ? 'Approving…' : 'Approve Payroll'}
            </Button>
          </div>
        )}

        {/* ── Payment section (approved or paid) ── */}
        {showPaymentSection && (
          <div className="mt-6 space-y-4">
            {/* Paid banner */}
            {isPaidStatus && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  All {run.lines.length} salaries paid for {period}.
                </AlertDescription>
              </Alert>
            )}

            {/* Batch payment controls */}
            {isApproved && (
              <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <h3 className="mb-4 text-sm font-semibold text-gray-800">
                  Record Salary Payments
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    ({paidCount}/{run.lines.length} paid)
                  </span>
                </h3>

                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Payment Method</Label>
                    <select
                      className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={batchMethod}
                      onChange={(e) => setBatchMethod(e.target.value)}
                      disabled={batchPending}
                    >
                      <option value="cash">Cash</option>
                      <option value="mtn_momo">MTN MoMo</option>
                      <option value="telecel">Telecel Cash</option>
                      <option value="airteltigo">AirtelTigo Money</option>
                      <option value="bank">Bank Transfer</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Payment Date</Label>
                    <Input
                      className="mt-1 h-9 w-40"
                      type="date"
                      value={batchDate}
                      onChange={(e) => setBatchDate(e.target.value)}
                      disabled={batchPending}
                    />
                  </div>
                  <Button onClick={handleBatchPay} disabled={batchPending} className="h-9">
                    {batchPending
                      ? 'Processing…'
                      : `Pay All Staff — ${METHOD_LABELS[batchMethod] ?? batchMethod}`}
                  </Button>
                </div>

                {batchError && <p className="mt-3 text-xs text-red-600">{batchError}</p>}
                {batchResult && (
                  <p className="mt-3 text-xs text-green-700">
                    {batchResult.paid} payment{batchResult.paid !== 1 ? 's' : ''} recorded
                    {batchResult.skipped > 0 ? `, ${batchResult.skipped} skipped` : ''}.
                  </p>
                )}

                <p className="mt-3 text-xs text-gray-400">
                  To pay staff via different methods, use the &ldquo;Pay Now&rdquo; link on each
                  row.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
